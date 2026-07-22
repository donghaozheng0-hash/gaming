import type { GameConfig } from "../../../config";
import type { ElementId, FusedElementId } from "../../../config/schema/common";
import type { FusionRecipe } from "../../../config/schema/fusion";
import type { EventBus } from "../../events/EventBus";
import type { CombatLoadoutEntry, CombatSimulation } from "../combat/CombatSimulation";

export interface RunProgressionDeps {
  config: GameConfig;
  bus: EventBus;
  rng: () => number;
  simulation: CombatSimulation;
  loadout: readonly CombatLoadoutEntry[];
}

export interface RunProgressionState {
  lingjiPoints: number;
  essences: Record<ElementId, number>;
  upgradeLevels: number[];
  fusions: Array<FusedElementId | null>;
}

export class RunProgression {
  private readonly config: GameConfig;
  private readonly bus: EventBus;
  private readonly rng: () => number;
  private readonly simulation: CombatSimulation;
  private readonly loadout: readonly CombatLoadoutEntry[];
  private readonly upgradeLevels: number[];
  private readonly fusions: Array<FusedElementId | null>;
  private readonly essences: Record<ElementId, number>;

  private lingjiPoints = 0;

  constructor({ config, bus, rng, simulation, loadout }: RunProgressionDeps) {
    this.config = config;
    this.bus = bus;
    this.rng = rng;
    this.simulation = simulation;
    this.loadout = loadout;
    this.upgradeLevels = loadout.map(() => 0);
    this.fusions = loadout.map(() => null);
    this.essences = Object.fromEntries(config.balance.elements.ids.map((element) => [element, 0])) as Record<
      ElementId,
      number
    >;

    this.bus.on("wave.ended", ({ index }) => {
      this.handleWaveEnded(index);
    });
  }

  upgradeRune(slotIndex: number): void {
    this.requireSlot(slotIndex);
    if (this.lingjiPoints < 1) {
      throw new Error("not enough lingji points");
    }

    this.lingjiPoints -= 1;
    this.upgradeLevels[slotIndex] += 1;
    this.simulation.applyRuneUpgrade(slotIndex);
    this.bus.emit("rune.upgraded", { slotIndex, level: this.upgradeLevels[slotIndex] });
    this.bus.emit("lingji.spent", { use: "upgrade", slotIndex });
  }

  fuseRune(slotIndex: number, recipeId: string): void {
    this.requireSlot(slotIndex);
    const recipe = this.findOpenRecipe(recipeId);
    this.requireLoadoutElements(recipe);
    this.requireFusionCost(recipe);

    this.lingjiPoints -= recipe.cost.lingjiPoints;
    for (const element of this.config.balance.elements.ids) {
      this.essences[element] -= recipe.cost.essences[element] ?? 0;
    }

    this.fusions[slotIndex] = recipe.id;
    this.simulation.applyFusion(slotIndex, recipe);
    this.bus.emit("rune.fused", { slotIndex, recipeId: recipe.id });
    this.bus.emit("lingji.spent", { use: "fusion", slotIndex, recipeId: recipe.id });
  }

  state(): RunProgressionState {
    return {
      lingjiPoints: this.lingjiPoints,
      essences: { ...this.essences },
      upgradeLevels: [...this.upgradeLevels],
      fusions: [...this.fusions],
    };
  }

  private handleWaveEnded(waveIndex: number): void {
    const battle = this.config.balance.battle;

    if (battle.lingjiGrantWaves.includes(waveIndex)) {
      this.lingjiPoints = Math.min(battle.maxLingjiPointsPerRun, this.lingjiPoints + 1);
      this.bus.emit("lingji.granted", { waveIndex, total: this.lingjiPoints });
    }

    this.resolveEssenceDrop(waveIndex);
  }

  private resolveEssenceDrop(waveIndex: number): void {
    const drop = this.config.balance.battle.elementEssenceDrop;
    const guaranteed = drop.guaranteedWaves.includes(waveIndex);

    if (guaranteed) {
      this.dropEssence(waveIndex, drop.guaranteedAmount);
      return;
    }

    if (this.rng() < drop.extraDropChance) {
      this.dropEssence(waveIndex, drop.extraDropAmount);
    }
  }

  private dropEssence(waveIndex: number, amount: number): void {
    const element = this.config.balance.elements.ids[
      Math.floor(this.rng() * this.config.balance.elements.ids.length)
    ];
    this.essences[element] += amount;
    this.bus.emit("essence.dropped", { element, waveIndex });
  }

  private findOpenRecipe(recipeId: string): FusionRecipe {
    const firstUnlock = this.config.fusion.unlockSchedule[0];
    if (firstUnlock === undefined || !firstUnlock.recipeIds.includes(recipeId as FusedElementId)) {
      throw new Error(`fusion recipe "${recipeId}" is not open in this run`);
    }

    const recipe = this.config.fusion.recipes.find((candidate) => candidate.id === recipeId);
    if (recipe === undefined) {
      throw new Error(`fusion.recipes unknown recipe "${recipeId}"`);
    }

    return recipe;
  }

  private requireLoadoutElements(recipe: FusionRecipe): void {
    const elements = new Set(this.loadout.map((entry) => this.findRune(entry.runeId).element));

    for (const element of recipe.baseElements) {
      if (!elements.has(element)) {
        throw new Error(`fusion recipe "${recipe.id}" requires ${element}`);
      }
    }
  }

  private requireFusionCost(recipe: FusionRecipe): void {
    if (this.lingjiPoints < recipe.cost.lingjiPoints) {
      throw new Error("not enough lingji points");
    }

    for (const element of this.config.balance.elements.ids) {
      const required = recipe.cost.essences[element] ?? 0;
      if (this.essences[element] < required) {
        throw new Error(`not enough ${element} essence`);
      }
    }
  }

  private requireSlot(slotIndex: number): void {
    if (this.loadout[slotIndex] === undefined) {
      throw new Error(`loadout slotIndex ${slotIndex} is outside loadout`);
    }
  }

  private findRune(runeId: string): GameConfig["runes"]["runes"][number] {
    const rune = this.config.runes.runes.find((candidate) => candidate.id === runeId);

    if (rune === undefined) {
      throw new Error(`runes.runes unknown rune "${runeId}"`);
    }

    return rune;
  }
}
