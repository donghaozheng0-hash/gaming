import type { GameConfig } from "../../../config";
import type { FusionRecipe } from "../../../config/schema/fusion";
import { coreDamage } from "../../formulas/core";
import { runeDamage } from "../../formulas/damage";
import { relation } from "../../formulas/elements";
import { combatPower } from "../../formulas/power";
import type { EventBus } from "../../events/EventBus";
import { drawBonusForScore, type DrawTier } from "../draw/scoring";
import type { GeneratedMap, OpenSlot, Vec2 } from "../map/MapGenerator";
import {
  resolveTargetingStrategy,
  type TargetableMonster,
  type TargetingStrategy,
} from "./targeting";

export interface CombatLoadoutEntry {
  slotIndex: number;
  runeId: string;
}

export interface CombatSnapshot {
  coreHp: number;
  coreMaxHp: number;
  kills: number;
  leaks: number;
  monstersAlive: number;
  lootMultiplier: number;
  wavesCleared: number;
}

export interface DrawCooldownState {
  ready: boolean;
  remainingSteps: number;
  remainingSeconds: number;
  globalSteps: number;
  perRuneSteps: number;
}

export interface CombatSimulationDeps {
  config: GameConfig;
  map: GeneratedMap;
  bus: EventBus;
  rng: () => number;
  loadout: readonly CombatLoadoutEntry[];
  requiredPower: number;
  waveTemplateId?: string;
}

export interface CombatMonsterView extends TargetableMonster {
  monsterId: string;
  element: string;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  routeIndex: number;
}

type MonsterTemplate = GameConfig["monsters"]["monsters"][number];
type RuneTemplate = GameConfig["runes"]["runes"][number];
type WaveDefinition = GameConfig["waves"]["waveTemplates"][number]["waves"][number];
type WaveEntry = WaveDefinition["entries"][number];
type CandidateSlotType = GameConfig["maps"]["candidateSlotTypes"][number];

interface RouteGeometry {
  points: Vec2[];
  lengthUnits: number;
}

interface PendingSpawn {
  monsterPoolIds: readonly string[];
  waveIndex: number;
}

interface ActiveWave {
  waveIndex: number;
  spawnIntervalSteps: number;
  elapsedSteps: number;
  nextSpawnIndex: number;
  queue: PendingSpawn[];
}

interface RuneTower {
  slotIndex: number;
  rune: RuneTemplate;
  slot: OpenSlot;
  slotType: CandidateSlotType;
  effectiveRangeUnits: number;
  cooldownSteps: number;
  cooldownRemainingSteps: number;
  xiangshengMultiplier: number;
  strategy: TargetingStrategy;
  attackBase: number;
  upgradeLevel: number;
  fusionRecipe: FusionRecipe | null;
  pendingDrawBonus: number | null;
}

interface MonsterEntity {
  entityId: number;
  monsterId: string;
  waveIndex: number;
  routeIndex: number;
  route: RouteGeometry;
  distanceUnits: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  attack: number;
  speedUnitsPerSecond: number;
  element: string;
  alive: boolean;
  template: MonsterTemplate;
}

export class CombatSimulation {
  private readonly config: GameConfig;
  private readonly map: GeneratedMap;
  private readonly bus: EventBus;
  private readonly rng: () => number;
  private readonly requiredPower: number;
  private readonly waveTemplateId: string;
  private readonly routeGeometries: RouteGeometry[];
  private readonly towers: RuneTower[];
  private readonly coreMaxHpValue: number;
  private readonly coreDef: number;
  private readonly lootMultiplierValue: number;
  private readonly activeWaves: ActiveWave[] = [];
  private readonly monsters: MonsterEntity[] = [];
  private readonly dispatchedWaveIndexes = new Set<number>();
  private readonly waveSpawnCounts = new Map<number, number>();
  private readonly waveResolvedCounts = new Map<number, number>();
  private readonly drawRuneReadySteps = new Map<number, number>();

  private nextEntityId = 1;
  private elapsedSteps = 0;
  private drawGlobalReadyStep = 0;
  private coreHpValue: number;
  private killsValue = 0;
  private leaksValue = 0;

  constructor(deps: CombatSimulationDeps) {
    this.config = deps.config;
    this.map = deps.map;
    this.bus = deps.bus;
    this.rng = deps.rng;
    this.requiredPower = deps.requiredPower;
    this.waveTemplateId = deps.waveTemplateId ?? this.defaultWaveTemplateId();
    this.routeGeometries = deps.map.routes.map(createRouteGeometry);
    this.towers = deps.loadout.map((entry) => this.createTower(entry, deps.loadout));

    const coreStats = deriveCoreStats(deps.config, deps.requiredPower);
    this.coreMaxHpValue = coreStats.maxHp;
    this.coreHpValue = coreStats.maxHp;
    this.coreDef = coreStats.def;
    this.lootMultiplierValue =
      deps.config.infinite.lootCompensation.byOpenSlotCount[String(deps.map.openSlots.length)] ?? 1;
  }

  get coreHp(): number {
    return this.coreHpValue;
  }

  spawnWave(waveIndex: number): void {
    const wave = this.findWave(waveIndex);
    const queue = flattenWaveEntries(wave.entries, wave.index);
    const spawnIntervalSeconds = wave.spawnIntervalSeconds ?? 0;

    this.dispatchedWaveIndexes.add(wave.index);
    this.activeWaves.push({
      waveIndex: wave.index,
      spawnIntervalSteps: Math.round(spawnIntervalSeconds * this.config.balance.battle.simulationFps),
      elapsedSteps: 0,
      nextSpawnIndex: 0,
      queue,
    });
  }

  step(): void {
    this.elapsedSteps += 1;
    this.spawnDueMonsters();
    this.advanceMonsters();
    this.fireReadyRunes();
  }

  isFieldCleared(): boolean {
    return this.activeWaves.every((wave) => wave.nextSpawnIndex >= wave.queue.length) && this.monstersAlive() === 0;
  }

  snapshot(): CombatSnapshot {
    return {
      coreHp: this.coreHpValue,
      coreMaxHp: this.coreMaxHpValue,
      kills: this.killsValue,
      leaks: this.leaksValue,
      monstersAlive: this.monstersAlive(),
      lootMultiplier: this.lootMultiplierValue,
      wavesCleared: this.wavesCleared(),
    };
  }

  getMonsterViews(): CombatMonsterView[] {
    return this.monsters.filter(isAlive).map((monster) => this.toMonsterView(monster));
  }

  applyRuneUpgrade(slotIndex: number): void {
    const tower = this.requireTower(slotIndex);
    tower.upgradeLevel += 1;
    tower.attackBase =
      tower.rune.lv1Attack *
      Math.pow(1 + this.config.balance.battle.runeUpgradeAttackGrowthPerLevel, tower.upgradeLevel);
  }

  applyFusion(slotIndex: number, recipe: FusionRecipe): void {
    const tower = this.requireTower(slotIndex);
    tower.fusionRecipe = recipe;
  }

  submitDraw(slotIndex: number, score: number): { tier: DrawTier; bonus: number } {
    const tower = this.requireTower(slotIndex);
    const cooldown = this.getDrawCooldown(slotIndex);

    if (!cooldown.ready) {
      throw new Error(`draw rune is cooling down for slot ${slotIndex}`);
    }

    const result = drawBonusForScore(score, this.config.balance.damageFormula.drawBonus);
    const cooldownSeconds = this.config.balance.battle.drawRuneCooldownSeconds;
    this.drawGlobalReadyStep = this.elapsedSteps + Math.round(cooldownSeconds.global * this.config.balance.battle.simulationFps);
    this.drawRuneReadySteps.set(
      slotIndex,
      this.elapsedSteps + Math.round(cooldownSeconds.perRune * this.config.balance.battle.simulationFps),
    );
    tower.pendingDrawBonus = result.bonus;
    this.bus.emit("draw.scored", { slotIndex, score, tier: result.tier });

    return result;
  }

  getDrawCooldown(slotIndex: number): DrawCooldownState {
    this.requireTower(slotIndex);
    const globalSteps = Math.max(0, this.drawGlobalReadyStep - this.elapsedSteps);
    const perRuneSteps = Math.max(0, (this.drawRuneReadySteps.get(slotIndex) ?? 0) - this.elapsedSteps);
    const remainingSteps = Math.max(globalSteps, perRuneSteps);

    return {
      ready: remainingSteps === 0,
      remainingSteps,
      remainingSeconds: remainingSteps / this.config.balance.battle.simulationFps,
      globalSteps,
      perRuneSteps,
    };
  }

  private defaultWaveTemplateId(): string {
    const template = this.config.waves.waveTemplates[0];

    if (template === undefined) {
      throw new Error("waves.waveTemplates must contain at least one template");
    }

    return template.id;
  }

  private createTower(entry: CombatLoadoutEntry, loadout: readonly CombatLoadoutEntry[]): RuneTower {
    const slot = this.map.openSlots[entry.slotIndex];

    if (slot === undefined) {
      throw new Error(`loadout slotIndex ${entry.slotIndex} is outside map.openSlots`);
    }

    const rune = this.findRune(entry.runeId);
    const slotType = this.findSlotType(slot.slotTypeId);
    const rangeValue = rune.range.kind === "global" ? slotType.rangeUnits : Math.min(rune.range.value, slotType.rangeUnits);

    return {
      slotIndex: entry.slotIndex,
      rune,
      slot,
      slotType,
      effectiveRangeUnits: rangeValue,
      cooldownSteps: Math.max(1, Math.round(this.config.balance.battle.simulationFps / rune.attackSpeedPerSecond)),
      cooldownRemainingSteps: 0,
      xiangshengMultiplier: this.resolveXiangshengMultiplier(entry, rune, loadout),
      strategy: resolveTargetingStrategy(rune.targetingStrategyId),
      attackBase: rune.lv1Attack,
      upgradeLevel: 0,
      fusionRecipe: null,
      pendingDrawBonus: null,
    };
  }

  private resolveXiangshengMultiplier(
    entry: CombatLoadoutEntry,
    rune: RuneTemplate,
    loadout: readonly CombatLoadoutEntry[],
  ): number {
    let hasPresence = false;

    for (const other of loadout) {
      if (other === entry) {
        continue;
      }

      const otherSlot = this.map.openSlots[other.slotIndex];
      if (otherSlot === undefined) {
        throw new Error(`loadout slotIndex ${other.slotIndex} is outside map.openSlots`);
      }

      const otherRune = this.findRune(other.runeId);
      if (this.config.balance.elements.xiangshengCycle[otherRune.element] !== rune.element) {
        continue;
      }

      hasPresence = true;

      if (
        distance(otherSlot.position, this.map.openSlots[entry.slotIndex].position) <=
        this.config.balance.battle.xiangshengAdjacencyMaxCanvasUnits
      ) {
        return this.config.balance.damageFormula.xiangshengMultipliers.generated;
      }
    }

    return hasPresence
      ? this.config.balance.damageFormula.xiangshengMultipliers.presence
      : this.config.balance.damageFormula.xiangshengMultipliers.neutral;
  }

  private findWave(waveIndex: number): WaveDefinition {
    const template = this.config.waves.waveTemplates.find((candidate) => candidate.id === this.waveTemplateId);

    if (template === undefined) {
      throw new Error(`waves.waveTemplates unknown template "${this.waveTemplateId}"`);
    }

    const wave = template.waves.find((candidate) => candidate.index === waveIndex);

    if (wave === undefined) {
      throw new Error(`waves.waveTemplates.${template.id} missing wave index ${waveIndex}`);
    }

    return wave;
  }

  private findRune(runeId: string): RuneTemplate {
    const rune = this.config.runes.runes.find((candidate) => candidate.id === runeId);

    if (rune === undefined) {
      throw new Error(`runes.runes unknown rune "${runeId}"`);
    }

    return rune;
  }

  private findMonster(monsterId: string): MonsterTemplate {
    const monster = this.config.monsters.monsters.find((candidate) => candidate.id === monsterId);

    if (monster === undefined) {
      throw new Error(`monsters.monsters unknown monster "${monsterId}"`);
    }

    return monster;
  }

  private findSlotType(slotTypeId: string): CandidateSlotType {
    const slotType = this.config.maps.candidateSlotTypes.find((candidate) => candidate.id === slotTypeId);

    if (slotType === undefined) {
      throw new Error(`maps.candidateSlotTypes unknown slot type "${slotTypeId}"`);
    }

    return slotType;
  }

  private spawnDueMonsters(): void {
    for (const wave of this.activeWaves) {
      while (wave.nextSpawnIndex < wave.queue.length && isSpawnDue(wave)) {
        const pending = wave.queue[wave.nextSpawnIndex];
        const monsterId = choose(pending.monsterPoolIds, this.rng, "wave entry monsterPoolIds");
        const template = this.findMonster(monsterId);
        const routeIndex = chooseRouteIndex(this.routeGeometries.length, this.rng);
        const element = choose(template.defaultElements, this.rng, `monsters.${template.id}.defaultElements`);

        this.spawnMonster({
          template,
          waveIndex: pending.waveIndex,
          routeIndex,
          distanceUnits: 0,
          hpCoefficientR: template.hpCoefficientR,
          element,
        });
        wave.nextSpawnIndex += 1;
      }

      wave.elapsedSteps += 1;
    }
  }

  private spawnMonster({
    template,
    waveIndex,
    routeIndex,
    distanceUnits,
    hpCoefficientR,
    element,
  }: {
    template: MonsterTemplate;
    waveIndex: number;
    routeIndex: number;
    distanceUnits: number;
    hpCoefficientR: number;
    element: string;
  }): MonsterEntity {
    const route = this.routeGeometries[routeIndex];

    if (route === undefined) {
      throw new Error(`map.routes missing route index ${routeIndex}`);
    }

    const maxHp = hpCoefficientR * this.requiredPower;
    const maxShield = template.shieldCoefficientR * this.requiredPower;
    const monster: MonsterEntity = {
      entityId: this.nextEntityId,
      monsterId: template.id,
      waveIndex,
      routeIndex,
      route,
      distanceUnits,
      hp: maxHp,
      maxHp,
      shield: maxShield,
      maxShield,
      attack: template.attackCoefficientR * this.requiredPower,
      speedUnitsPerSecond: template.speedUnitsPerSecond,
      element,
      alive: true,
      template,
    };

    this.nextEntityId += 1;
    this.monsters.push(monster);
    this.waveSpawnCounts.set(waveIndex, (this.waveSpawnCounts.get(waveIndex) ?? 0) + 1);
    this.bus.emit("monster.spawned", {
      entityId: monster.entityId,
      monsterId: monster.monsterId,
      waveIndex: monster.waveIndex,
      routeIndex: monster.routeIndex,
    });

    return monster;
  }

  private advanceMonsters(): void {
    for (const monster of this.monsters) {
      if (!monster.alive) {
        continue;
      }

      monster.distanceUnits += monster.speedUnitsPerSecond / this.config.balance.battle.simulationFps;

      if (monster.distanceUnits < monster.route.lengthUnits) {
        continue;
      }

      monster.alive = false;
      this.leaksValue += 1;
      this.recordWaveResolution(monster.waveIndex);
      const amount = coreDamage({
        atk: monster.attack,
        def: this.coreDef,
        relK: this.config.balance.defense.relK,
      });
      this.coreHpValue -= amount;
      this.bus.emit("monster.leaked", {
        entityId: monster.entityId,
        monsterId: monster.monsterId,
      });
      this.bus.emit("core.damaged", {
        amount,
        remainingHp: this.coreHpValue,
      });
    }
  }

  private fireReadyRunes(): void {
    for (const tower of this.towers) {
      if (tower.cooldownRemainingSteps > 0) {
        tower.cooldownRemainingSteps -= 1;
        if (tower.cooldownRemainingSteps > 0) {
          continue;
        }
      }

      const target = this.pickTarget(tower);
      if (target === undefined) {
        continue;
      }

      const monster = this.monsters.find((candidate) => candidate.entityId === target.entityId && candidate.alive);
      if (monster === undefined) {
        continue;
      }

      const damage = this.damageFor(tower, monster);
      this.bus.emit("rune.fired", {
        slotIndex: tower.slotIndex,
        runeId: tower.rune.id,
        targetEntityId: monster.entityId,
        damage,
      });
      tower.pendingDrawBonus = null;
      this.applyDamage(monster, damage);
      tower.cooldownRemainingSteps = tower.cooldownSteps;
    }
  }

  private pickTarget(tower: RuneTower): TargetableMonster | undefined {
    const candidates = this.monsters
      .filter(isAlive)
      .map((monster) => this.toMonsterView(monster))
      .filter((monster) => distance(tower.slot.position, monster.position) <= tower.effectiveRangeUnits);

    return tower.strategy(candidates);
  }

  private damageFor(tower: RuneTower, monster: MonsterEntity): number {
    const elementRelation = relation(tower.rune.element, monster.element);
    const drawBonus = tower.pendingDrawBonus ?? this.config.balance.damageFormula.drawBonus.base;

    return runeDamage({
      base: tower.attackBase,
      qualityMul: this.config.balance.damageFormula.qualityMultipliers.xia_pin,
      xiangshengMul: tower.xiangshengMultiplier,
      kezhiMul:
        tower.fusionRecipe === null
          ? this.config.balance.damageFormula.elementalMultipliers[elementRelation]
          : fusionKezhiMultiplier(tower.fusionRecipe, monster.element),
      drawBonus,
    });
  }

  private applyDamage(monster: MonsterEntity, damage: number): void {
    let remainingDamage = damage;

    if (monster.shield > 0) {
      const shieldDamage = Math.min(monster.shield, remainingDamage);
      monster.shield -= shieldDamage;
      remainingDamage -= shieldDamage;
    }

    monster.hp -= remainingDamage;

    if (monster.hp > 0) {
      return;
    }

    this.killMonster(monster);
  }

  private killMonster(monster: MonsterEntity): void {
    if (!monster.alive) {
      return;
    }

    monster.alive = false;
    this.killsValue += 1;
    this.recordWaveResolution(monster.waveIndex);
    this.bus.emit("monster.died", {
      entityId: monster.entityId,
      monsterId: monster.monsterId,
    });

    const onDeath = monster.template.onDeath;
    if (onDeath === null) {
      return;
    }

    const childTemplate = this.findMonster(onDeath.spawnMonsterId);
    for (let spawned = 0; spawned < onDeath.count; spawned += 1) {
      this.spawnMonster({
        template: childTemplate,
        waveIndex: monster.waveIndex,
        routeIndex: monster.routeIndex,
        distanceUnits: monster.distanceUnits,
        hpCoefficientR: onDeath.hpCoefficientR,
        element: choose(childTemplate.defaultElements, this.rng, `monsters.${childTemplate.id}.defaultElements`),
      });
    }
  }

  private toMonsterView(monster: MonsterEntity): CombatMonsterView {
    return {
      entityId: monster.entityId,
      monsterId: monster.monsterId,
      element: monster.element,
      hp: monster.hp,
      maxHp: monster.maxHp,
      shield: monster.shield,
      maxShield: monster.maxShield,
      remainingDistanceUnits: Math.max(0, monster.route.lengthUnits - monster.distanceUnits),
      position: pointAtDistance(monster.route, monster.distanceUnits),
      routeIndex: monster.routeIndex,
    };
  }

  private monstersAlive(): number {
    return this.monsters.filter(isAlive).length;
  }

  private wavesCleared(): number {
    let total = 0;

    for (const waveIndex of this.dispatchedWaveIndexes) {
      const spawned = this.waveSpawnCounts.get(waveIndex) ?? 0;
      const resolved = this.waveResolvedCounts.get(waveIndex) ?? 0;
      if (this.isWaveSpawnComplete(waveIndex) && resolved >= spawned) {
        total += 1;
      }
    }

    return total;
  }

  private isWaveSpawnComplete(waveIndex: number): boolean {
    const wave = this.activeWaves.find((candidate) => candidate.waveIndex === waveIndex);
    return wave !== undefined && wave.nextSpawnIndex >= wave.queue.length;
  }

  private recordWaveResolution(waveIndex: number): void {
    this.waveResolvedCounts.set(waveIndex, (this.waveResolvedCounts.get(waveIndex) ?? 0) + 1);
  }

  private requireTower(slotIndex: number): RuneTower {
    const tower = this.towers[slotIndex];

    if (tower === undefined) {
      throw new Error(`tower slotIndex ${slotIndex} is outside towers`);
    }

    return tower;
  }
}

function fusionKezhiMultiplier(recipe: FusionRecipe, monsterElement: string): number {
  if (monsterElement === recipe.advantage.target) {
    return recipe.advantage.multiplier;
  }

  if (monsterElement === recipe.disadvantage.source) {
    return recipe.disadvantage.multiplier;
  }

  return 1;
}

function deriveCoreStats(config: GameConfig, requiredPower: number): { maxHp: number; def: number } {
  const ratio = config.balance.playerDerivation.statRatio;
  const basePower = requiredPower * config.balance.playerDerivation.basePowerFrac;
  const unit = basePower / combatPower(ratio);

  return {
    maxHp: unit * ratio.hp,
    def: unit * ratio.def,
  };
}

function flattenWaveEntries(entries: readonly WaveEntry[], waveIndex: number): PendingSpawn[] {
  const queue: PendingSpawn[] = [];

  for (const entry of entries) {
    for (let count = 0; count < entry.totalCount; count += 1) {
      queue.push({
        monsterPoolIds: entry.monsterPoolIds,
        waveIndex,
      });
    }
  }

  return queue;
}

function isSpawnDue(wave: ActiveWave): boolean {
  return wave.spawnIntervalSteps === 0 || wave.elapsedSteps >= wave.nextSpawnIndex * wave.spawnIntervalSteps;
}

function choose<T>(items: readonly T[], rng: () => number, path: string): T {
  if (items.length === 0) {
    throw new Error(`${path} must not be empty`);
  }

  if (items.length === 1) {
    return items[0];
  }

  return items[Math.floor(rng() * items.length)];
}

function chooseRouteIndex(routeCount: number, rng: () => number): number {
  if (routeCount <= 0) {
    throw new Error("map.routes must not be empty");
  }

  if (routeCount === 1) {
    return 0;
  }

  return Math.floor(rng() * routeCount);
}

function isAlive(monster: MonsterEntity): boolean {
  return monster.alive;
}

function createRouteGeometry(points: Vec2[]): RouteGeometry {
  return {
    points,
    lengthUnits: polylineLength(points),
  };
}

function polylineLength(points: readonly Vec2[]): number {
  let total = 0;

  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1], points[index]);
  }

  return total;
}

function pointAtDistance(route: RouteGeometry, distanceUnits: number): Vec2 {
  if (distanceUnits <= 0) {
    return route.points[0];
  }

  let remaining = distanceUnits;

  for (let index = 1; index < route.points.length; index += 1) {
    const from = route.points[index - 1];
    const to = route.points[index];
    const segmentLength = distance(from, to);

    if (remaining <= segmentLength) {
      const t = segmentLength === 0 ? 0 : remaining / segmentLength;
      return {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
    }

    remaining -= segmentLength;
  }

  return route.points[route.points.length - 1];
}


function distanceToSegment(point: Vec2, from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : clamp(0, 1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq);
  const projected = {
    x: from.x + dx * t,
    y: from.y + dy * t,
  };

  return distance(point, projected);
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(min: number, max: number, value: number): number {
  return Math.max(min, Math.min(max, value));
}
