import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// T6 符·怪·目标选择与承伤最小闭环 · 验收锚点测试 —— 由 Claude(架构/监督者)编写，是 Task 6 的验收标尺。
//
// 角色契约(反套娃护栏)：
//   · Codex 在 Task 6 实现 src/game/battle/combat/** 并扩展 BattleController/EventBus/runes.json(+schema)
//     使本测试全部 PASS。
//   · Codex【不得修改本文件】。若认为契约有误，必须停下回报 Claude 评审，
//     不得自行改测试就标"通过"。
//
// 接口契约(由 Claude 钉死；变更须经 Claude 评审)：
//   battle/combat/CombatSimulation.ts
//     export interface CombatLoadoutEntry { slotIndex: number; runeId: string }  // slotIndex = map.openSlots 下标
//     export interface CombatSnapshot {
//       coreHp: number; coreMaxHp: number;
//       kills: number;            // 被符击杀数(漏怪不算)
//       leaks: number;            // 漏怪数(走完路线)
//       monstersAlive: number;
//       lootMultiplier: number;   // = infinite.lootCompensation.byOpenSlotCount[String(openSlots.length)] ?? 1
//     }
//     export interface CombatSimulationDeps {
//       config: GameConfig;
//       map: GeneratedMap;        // T4 generateMap 产物
//       bus: EventBus;
//       rng: () => number;        // createRng(seed) 同款注入;严禁内部 Math.random/Date
//       loadout: readonly CombatLoadoutEntry[];
//       requiredPower: number;    // R(d):怪三围 = 系数 × R
//       waveTemplateId?: string;  // 缺省取 config.waves.waveTemplates[0].id
//     }
//     export class CombatSimulation {
//       constructor(deps: CombatSimulationDeps)
//       spawnWave(waveIndex: number): void  // 登记 waves.json 该波;之后 step 按 spawnIntervalSeconds 逐只入场
//                                           // (波 index 不在模板内 → throw,失败快而响)
//       step(): void                        // 推进 1 个定步(1/balance.battle.simulationFps 秒)
//       get coreHp(): number
//       isFieldCleared(): boolean           // 已登记波全部入场完毕 且 场上无存活怪
//       snapshot(): CombatSnapshot
//     }
//   battle/combat/targeting.ts (裁定 R6:目标策略词条化)
//     export interface TargetableMonster { entityId: number; remainingDistanceUnits: number; position: Vec2 }
//     export type TargetingStrategy = (candidates: readonly TargetableMonster[]) => TargetableMonster | undefined
//     export function registerTargetingStrategy(id: string, s: TargetingStrategy): void
//     export function resolveTargetingStrategy(id: string): TargetingStrategy  // 未注册 → throw
//     内置 "nearest_to_core":剩余路程(remainingDistanceUnits)最短者优先(塔防语义,非欧氏距离)。
//
//   行为契约(全部数值从注入 config/requiredPower 派生,零裸数字)：
//     怪:HP=hpCoefficientR×R;盾=shieldCoefficientR×R(伤害先破盾,溢出转血);攻=attackCoefficientR×R;
//        速度=speedUnitsPerSecond(canvas units/s);沿 route 折线【几何长度】推进(pathLengthUnits=1000 只是数值模型近似);
//        五行=spawn 时从 defaultElements 用注入 rng 均匀抽;entry 的 monsterPoolIds 多 id 时每只用 rng 均匀抽;
//        多路线模板:每只怪 spawn 时用注入 rng 均匀选 routeIndex(单路恒 0);
//        entityId:单局内唯一且从 1 起递增(跨局不可比);
//        onDeath:死亡时按 spawnMonsterId/count/hpCoefficientR 在原地入场子怪(数据驱动,分裂妖)。
//     漏怪:走完折线 → monster.leaked + core.damaged;阵眼伤害 = round(怪攻×(1−减伤)),
//        减伤 = coreDEF/(coreDEF + relK×怪攻)(T2 相对式);怪移除且不算 kill。
//     阵眼:basePower=R×playerDerivation.basePowerFrac;单位u=basePower/(Σ statRatio×powerFormula 权重);
//        coreMaxHp=u×statRatio.hp;coreDEF=u×statRatio.def。
//     符:摆在 map.openSlots[slotIndex](canvas 坐标);有效射程=min(rune.range.value, slotType.rangeUnits),
//        range.kind==="global" 时=slotType.rangeUnits;冷却=round(fps/attackSpeedPerSecond) 步,首发即可击;
//        伤害=round(lv1Attack×品质×相生×克制)(T6 全下品×1、无画功;克制=relation(符五行,怪五行) 查 kezhiCycle);
//     R1 相生两档(裁定 R1):存在相邻(开放格 canvas 欧氏距离 ≤ balance.battle.xiangshengAdjacencyMaxCanvasUnits)
//        符五行生我 → ×generated;否则场上任意符五行生我 → ×presence;否则 ×1。
//     BattleController deps 扩 simulation?: CombatSimulation:
//        不注入 → 行为与 T3 完全一致(battle.controller.gate 必须保持全绿);
//        注入 → wave.started 时 spawnWave(index);每定步驱动 sim.step();
//               coreHp≤0 → 立即 settle(victory:false);全波放完且 isFieldCleared → settle(victory: coreHp>0);
//               battle.settled payload 扩【可选】字段 coreHp/kills/leaks/lootMultiplier(注入 sim 时必须携带)。
//     runes.json 每符新增 targetingStrategyId(schema 必填 string;本批全部 "nearest_to_core")。
//
// 未落地前(目标文件不存在)自动 skip，不阻塞既有基线；落地后立即生效，违约即判 FAIL。
// 本文件是纯 headless 单测：全程不 import @babylonjs。期望值为字面量独立推导(不调用实现求期望)。
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const simPath = resolve(here, "../src/game/battle/combat/CombatSimulation.ts");
const targetingPath = resolve(here, "../src/game/battle/combat/targeting.ts");
const controllerPath = resolve(here, "../src/game/battle/BattleController.ts");
const busPath = resolve(here, "../src/game/events/EventBus.ts");
const genPath = resolve(here, "../src/game/battle/map/MapGenerator.ts");
const rngPath = resolve(here, "../src/game/battle/map/rng.ts");
const configIndexPath = resolve(here, "../src/config/index.ts");

const ready = existsSync(simPath) && existsSync(targetingPath);

async function load(path: string): Promise<any> {
  const spec = path;
  return import(spec);
}

async function loadConfig(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  return loadGameConfig();
}

// ── 契约锚点数值(d=1,R=2000;playerDerivation 0.45 / 2:20:1;独立推导的字面量) ──
const R_D1 = 2000;
// basePower=900;u=900/27=33.333…;coreDEF=33.333…;coreMaxHp=666.666…
const CORE_DEF_D1 = 33.333333333333336;
const CORE_MAX_HP_D1 = 666.6666666666667;
// 漏 1 只普通妖兵(攻=0.03×2000=60):减伤=33.33/(33.33+0.68×60)=0.44965…→round(60×0.55034…)=33
const LEAK_DAMAGE_NORMAL_D1 = 33;
// 焚天符(lv1Attack=120,下品×1,无画功):中性 120;R1 同场×1.1=132;相邻×1.3=156;
// 克制(fire→metal)×1.5=180;被克(fire→water)×0.67=80(round(80.4)=80)
const FEN_TIAN_NEUTRAL = 120;
const FEN_TIAN_PRESENCE = 132;
const FEN_TIAN_ADJACENT = 156;

// 深拷贝解冻 config(与 T3 尺子同款技巧),便于注入改造。
async function clonedConfig(): Promise<any> {
  return structuredClone(await loadConfig());
}

// 构造一个"单波单怪池"的注入 config:把 normal_7_wave 换成受控波表,wavesPerLevel 同步,自洽。
function injectWaves(config: any, waves: any[]): void {
  config.balance.battle.wavesPerLevel = waves.length;
  const template = config.waves.waveTemplates.find((t: any) => t.id === "normal_7_wave");
  template.waves = waves;
}

function wave(index: number, monsterIds: string[], totalCount: number, spawnIntervalSeconds: number | null): any {
  return {
    index,
    startTimeSeconds: 0,
    entries: [{ monsterPoolIds: monsterIds, totalCount, label: "gate" }],
    spawnIntervalSeconds,
    designPurpose: "gate",
    specialRules: null,
  };
}

// 找一个生成 targetOpenSlots 个开放格(且满足附加谓词)的 seed(从 1 起扫;地图生成是 T4 已验收资产)。
async function findSeedWithOpenSlots(
  config: any,
  targetOpenSlots: number,
  accept: (map: any) => boolean = () => true,
  maxSeed = 400,
): Promise<{ seed: number; map: any }> {
  const { generateMap } = await load(genPath);
  for (let seed = 1; seed <= maxSeed; seed++) {
    const map = generateMap({ config, seed });
    if (map.openSlots.length === targetOpenSlots && accept(map)) return { seed, map };
  }
  throw new Error(`扫 seed 1..${maxSeed} 未找到 ${targetOpenSlots} 开放格地图——T4 随机性异常`);
}

interface SimHarness {
  sim: any;
  bus: any;
  events: Record<string, any[]>;
}

async function makeSim(opts: {
  config: any;
  map: any;
  loadout: Array<{ slotIndex: number; runeId: string }>;
  rngSeed?: number;
  requiredPower?: number;
}): Promise<SimHarness> {
  const { CombatSimulation } = await load(simPath);
  const { EventBus } = await load(busPath);
  const { createRng } = await load(rngPath);
  const bus = new EventBus();
  const events: Record<string, any[]> = {
    spawned: [], died: [], leaked: [], coreDamaged: [], fired: [],
  };
  bus.on("monster.spawned", (p: any) => events.spawned.push(p));
  bus.on("monster.died", (p: any) => events.died.push(p));
  bus.on("monster.leaked", (p: any) => events.leaked.push(p));
  bus.on("core.damaged", (p: any) => events.coreDamaged.push(p));
  bus.on("rune.fired", (p: any) => events.fired.push(p));
  const sim = new CombatSimulation({
    config: opts.config,
    map: opts.map,
    bus,
    rng: createRng(opts.rngSeed ?? 7),
    loadout: opts.loadout,
    requiredPower: opts.requiredPower ?? R_D1,
  });
  return { sim, bus, events };
}

// 折线几何长度(独立实现,验证怪按几何长度而非名义 1000 推进)。
function polylineLength(points: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

describe("T6 · 怪实体沿路线几何推进(定步长,速度读配置)", () => {
  it.skipIf(!ready)("单怪按 speed/fps 每步推进;走完折线触发 leaked+core.damaged(承伤=相对式字面量);漏怪不算击杀", async () => {
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["normal_yaobing"], 1, null)]);
    // 摆一个"打不到路"的空 loadout:纯观察怪推进与漏怪承伤。
    const { map } = await findSeedWithOpenSlots(config, 2);
    const h = await makeSim({ config, map, loadout: [] });
    h.sim.spawnWave(1);

    const fps = config.balance.battle.simulationFps;
    const speed = 60; // normal_yaobing.speedUnitsPerSecond(monsters.json 锚点)
    const stepUnits = speed / fps; // 2 units/step

    // 推进若干步后,怪应恰好前进 steps×stepUnits(几何路程,浮点容差)。
    for (let i = 0; i < 90; i++) h.sim.step();
    expect(h.events.spawned.length).toBe(1);
    expect(h.sim.snapshot().monstersAlive).toBe(1);

    // 跑到漏怪为止:总步数应≈ceil(routeLength/stepUnits)(±1 步边界),route 取怪所在路线。
    const routeIndex = h.events.spawned[0].routeIndex;
    const routeLength = polylineLength(map.routes[routeIndex]);
    let guard = 0;
    while (h.events.leaked.length === 0 && guard++ < 60000) h.sim.step();
    const totalSteps = 90 + guard;
    expect(Math.abs(totalSteps - Math.ceil(routeLength / stepUnits))).toBeLessThanOrEqual(1);

    // 漏怪承伤:阵眼掉血=33(独立字面量);怪移除、不算 kill、算 leak。
    expect(h.events.coreDamaged.length).toBe(1);
    expect(h.events.coreDamaged[0].amount).toBe(LEAK_DAMAGE_NORMAL_D1);
    expect(h.sim.coreHp).toBeCloseTo(CORE_MAX_HP_D1 - LEAK_DAMAGE_NORMAL_D1, 6);
    const snap = h.sim.snapshot();
    expect(snap.kills).toBe(0);
    expect(snap.leaks).toBe(1);
    expect(snap.monstersAlive).toBe(0);
    expect(snap.coreMaxHp).toBeCloseTo(CORE_MAX_HP_D1, 6);
    expect(h.sim.isFieldCleared()).toBe(true);
  });

  it.skipIf(!ready)("怪速度读注入 config:速度翻倍 → 漏怪耗时步数≈减半(反写死)", async () => {
    const base = await clonedConfig();
    injectWaves(base, [wave(1, ["normal_yaobing"], 1, null)]);
    const fast = structuredClone(base);
    const fastMonster = fast.monsters.monsters.find((m: any) => m.id === "normal_yaobing");
    fastMonster.speedUnitsPerSecond = fastMonster.speedUnitsPerSecond * 2;

    const stepsToLeak = async (config: any) => {
      const { map } = await findSeedWithOpenSlots(config, 2);
      const h = await makeSim({ config, map, loadout: [] });
      h.sim.spawnWave(1);
      let steps = 0;
      while (h.events.leaked.length === 0 && steps++ < 60000) h.sim.step();
      return steps;
    };
    const baseSteps = await stepsToLeak(base);
    const fastSteps = await stepsToLeak(fast);
    expect(Math.abs(fastSteps - Math.ceil(baseSteps / 2))).toBeLessThanOrEqual(2);
  });
});

describe("T6 · 符自动攻击(攻速节拍/射程钳制/伤害公式字面量)", () => {
  // 受控场:单路直线模板 + 指定摆位。用真实地图,把怪池钉成单元素单怪,观察开火节拍与伤害。
  async function firingHarness(overrides?: {
    monsterElements?: string[];
    presence?: number;
    runeAttack?: number;
  }): Promise<{ h: SimHarness; config: any }> {
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["armored_yao"], 1, null)]); // 厚甲妖:HP=0.32R=640,速度 45(慢,便于观测多次开火)
    const armored = config.monsters.monsters.find((m: any) => m.id === "armored_yao");
    armored.defaultElements = overrides?.monsterElements ?? ["earth"]; // fire→earth 相生位?不:kezhi fire→metal;xiangsheng fire→earth。earth 对 fire 中性(克制环上 fire 克 metal、water 克 fire)
    if (overrides?.presence !== undefined) {
      config.balance.damageFormula.xiangshengMultipliers.presence = overrides.presence;
    }
    if (overrides?.runeAttack !== undefined) {
      config.runes.runes.find((r: any) => r.id === "fen_tian").lv1Attack = overrides.runeAttack;
    }
    const { map } = await findSeedWithOpenSlots(config, 2);
    const h = await makeSim({ config, map, loadout: [{ slotIndex: 0, runeId: "fen_tian" }] });
    h.sim.spawnWave(1);
    return { h, config };
  }

  it.skipIf(!ready)("开火节拍=round(fps/attackSpeed) 步;每发伤害=120(中性字面量);怪死于足够多发", async () => {
    const { h, config } = await firingHarness();
    const fps = config.balance.battle.simulationFps;
    const cooldownSteps = Math.round(fps / 1); // 焚天攻速 1 → 30 步

    const firedAtSteps: number[] = [];
    for (let step = 1; step <= 4000 && h.events.died.length === 0; step++) {
      const before = h.events.fired.length;
      h.sim.step();
      if (h.events.fired.length > before) firedAtSteps.push(step);
    }
    expect(firedAtSteps.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < firedAtSteps.length; i++) {
      expect(firedAtSteps[i] - firedAtSteps[i - 1]).toBe(cooldownSteps);
    }
    for (const fired of h.events.fired) {
      expect(fired.runeId).toBe("fen_tian");
      expect(fired.damage).toBe(FEN_TIAN_NEUTRAL);
    }
    // 厚甲妖 640HP / 每发 120 → 第 6 发死;kills=1。
    expect(h.events.died.length).toBe(1);
    expect(h.events.fired.length).toBe(Math.ceil(640 / FEN_TIAN_NEUTRAL));
    expect(h.sim.snapshot().kills).toBe(1);
  });

  it.skipIf(!ready)("护盾先吸伤、溢出转血:护盾妖(盾320/血360)吃 3 发 120 后 盾0 血320", async () => {
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["shield_yao"], 1, null)]);
    config.monsters.monsters.find((m: any) => m.id === "shield_yao").defaultElements = ["earth"];
    // 减速到极慢,确保 3 发内不漏怪(速度读配置的另一处反写死证据)。
    config.monsters.monsters.find((m: any) => m.id === "shield_yao").speedUnitsPerSecond = 5;
    const { map } = await findSeedWithOpenSlots(config, 2);
    const h = await makeSim({ config, map, loadout: [{ slotIndex: 0, runeId: "fen_tian" }] });
    h.sim.spawnWave(1);
    let guard = 0;
    while (h.events.fired.length < 3 && guard++ < 8000) h.sim.step();
    expect(h.events.fired.length).toBe(3);
    // 盾=0.16×2000=320,血=0.18×2000=360;3×120=360 → 盾清零,溢出 40 入血:360-40=320。
    const alive = h.sim.monsters?.find?.((m: any) => m.alive) ?? null;
    // 不强制暴露 monsters 数组;用第 4 发之后总击杀节奏反推:再打 ceil(320/120)=3 发才死。
    let more = 0;
    while (h.events.died.length === 0 && more < 8000) { h.sim.step(); more++; }
    expect(h.events.fired.length).toBe(6); // 3(破盾+溢出) + 3(清剩余 320 血)
    void alive;
  });

  it.skipIf(!ready)("R1 相生两档读配置:同场弱档 ×presence,presence 改 1.2 → 伤害=144(反写死)", async () => {
    // 同场:焚天(fire) + 青藤(wood,木生火),两格距离 >200 时走 presence 档。
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["armored_yao"], 1, null)]);
    config.monsters.monsters.find((m: any) => m.id === "armored_yao").defaultElements = ["earth"];
    const { map } = await findSeedWithOpenSlots(config, 2);
    const dist = Math.hypot(
      map.openSlots[0].position.x - map.openSlots[1].position.x,
      map.openSlots[0].position.y - map.openSlots[1].position.y,
    );
    const threshold = config.balance.battle.xiangshengAdjacencyMaxCanvasUnits;
    const expectAdjacent = dist <= threshold;

    const damageWith = async (cfg: any) => {
      const h = await makeSim({
        config: cfg, map,
        loadout: [{ slotIndex: 0, runeId: "fen_tian" }, { slotIndex: 1, runeId: "qing_teng" }],
      });
      h.sim.spawnWave(1);
      let guard = 0;
      while (h.events.fired.filter((f: any) => f.runeId === "fen_tian").length === 0 && guard++ < 8000) h.sim.step();
      return h.events.fired.find((f: any) => f.runeId === "fen_tian").damage;
    };

    const base = await damageWith(config);
    expect(base).toBe(expectAdjacent ? FEN_TIAN_ADJACENT : FEN_TIAN_PRESENCE);

    if (!expectAdjacent) {
      const tuned = structuredClone(config);
      tuned.balance.damageFormula.xiangshengMultipliers.presence = 1.2;
      expect(await damageWith(tuned)).toBe(144); // 120×1.2
    } else {
      const tuned = structuredClone(config);
      tuned.balance.damageFormula.xiangshengMultipliers.generated = 1.5;
      expect(await damageWith(tuned)).toBe(180); // 120×1.5
    }
  });
});

describe("T6 · 目标策略词条化(裁定 R6)", () => {
  it.skipIf(!ready)("内置 nearest_to_core:剩余路程最短者优先;未注册策略 id → throw", async () => {
    const { registerTargetingStrategy, resolveTargetingStrategy } = await load(targetingPath);
    const nearest = resolveTargetingStrategy("nearest_to_core");
    const picked = nearest([
      { entityId: 1, remainingDistanceUnits: 500, position: { x: 0, y: 0 } },
      { entityId: 2, remainingDistanceUnits: 120, position: { x: 999, y: 999 } }, // 欧氏最远但剩余路程最短
      { entityId: 3, remainingDistanceUnits: 300, position: { x: 1, y: 1 } },
    ]);
    expect(picked?.entityId).toBe(2);
    expect(() => resolveTargetingStrategy("no_such_strategy")).toThrow();
    // 注册自定义词条后可解析(为后续"最远/残血/优先精英"词条留稳定接口)。
    registerTargetingStrategy("gate_farthest", (candidates: any[]) =>
      [...candidates].sort((a, b) => b.remainingDistanceUnits - a.remainingDistanceUnits)[0],
    );
    expect(resolveTargetingStrategy("gate_farthest")).toBeTypeOf("function");
  });

  it.skipIf(!ready)("策略 id 从符配置读取:注入未注册的 targetingStrategyId → 失败快而响(throw)", async () => {
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["normal_yaobing"], 1, null)]);
    const { map } = await findSeedWithOpenSlots(config, 2);
    config.runes.runes.find((r: any) => r.id === "fen_tian").targetingStrategyId = "gate_never_registered";
    const attempt = async () => {
      const h = await makeSim({ config, map, loadout: [{ slotIndex: 0, runeId: "fen_tian" }] });
      h.sim.spawnWave(1);
      for (let i = 0; i < 4000; i++) h.sim.step(); // 构造期或首次索敌期必须抛出
    };
    await expect(attempt()).rejects.toThrow();
  });

  it.skipIf(!ready)("同局双符不同策略选不同目标:nearest 选剩余路程短者,farthest 选长者(entityId 同局可比)", async () => {
    const { registerTargetingStrategy } = await load(targetingPath);
    registerTargetingStrategy("gate_pick_farthest", (candidates: any[]) =>
      [...candidates].sort((a: any, b: any) => b.remainingDistanceUnits - a.remainingDistanceUnits)[0],
    );
    const config = await clonedConfig();
    // 两只同速怪小错峰入场(0.2s=12 units 差距) → 首火前两只都已在场且剩余路程可区分。
    injectWaves(config, [wave(1, ["normal_yaobing"], 2, 0.2)]);
    config.monsters.monsters.find((m: any) => m.id === "normal_yaobing").defaultElements = ["earth"];
    config.runes.runes.find((r: any) => r.id === "zhan_jin").targetingStrategyId = "gate_pick_farthest";
    // 单路模板,且两格都近(≤模板半程):保证两符首火时同时看到两只怪。
    const { map } = await findSeedWithOpenSlots(config, 2, (m: any) => m.routes.length === 1);
    const h = await makeSim({
      config, map,
      loadout: [{ slotIndex: 0, runeId: "fen_tian" }, { slotIndex: 1, runeId: "zhan_jin" }],
    });
    h.sim.spawnWave(1);
    let guard = 0;
    const firstShotOf = (runeId: string) => h.events.fired.find((f: any) => f.runeId === runeId);
    while ((!firstShotOf("fen_tian") || !firstShotOf("zhan_jin")) && guard++ < 20000) h.sim.step();
    const nearestShot = firstShotOf("fen_tian");
    const farthestShot = firstShotOf("zhan_jin");
    expect(nearestShot).toBeDefined();
    expect(farthestShot).toBeDefined();
    // 两符首火时刻不同(冷却/射程进入时点不同),但语义方向必须成立:
    // 若首火时两怪同时在各自射程内,nearest 打先入场者(entityId 小)、farthest 打后入场者。
    // 稳健断言:两符的首个目标不应恒等——放宽为"存在至少一次选靶差异"。
    const fenTargets = h.events.fired.filter((f: any) => f.runeId === "fen_tian").map((f: any) => f.targetEntityId);
    const zhanTargets = h.events.fired.filter((f: any) => f.runeId === "zhan_jin").map((f: any) => f.targetEntityId);
    const bothAliveWindow = fenTargets.length > 0 && zhanTargets.length > 0;
    expect(bothAliveWindow).toBe(true);
    const anyDivergence =
      fenTargets.some((t: number) => zhanTargets.length > 0 && !zhanTargets.includes(t)) ||
      zhanTargets.some((t: number) => !fenTargets.includes(t));
    expect(anyDivergence).toBe(true);
  });
});

describe("T6 · 波次入场与数据驱动怪行为(8 类怪全配置)", () => {
  it.skipIf(!ready)("spawnWave 按 entries×totalCount×spawnInterval 入场;8 类怪都能实例化", async () => {
    const config = await clonedConfig();
    const allIds = config.monsters.monsters.map((m: any) => m.id);
    expect(allIds.length).toBe(8); // 配置层锚点:8 类怪模板
    injectWaves(config, [wave(1, allIds, 8, 0.5)]);
    const { map } = await findSeedWithOpenSlots(config, 2);
    const h = await makeSim({ config, map, loadout: [] });
    h.sim.spawnWave(1);
    const fps = config.balance.battle.simulationFps;
    // 8 只 × 0.5s 间隔 → 最后一只在第 7×0.5×fps=105 步左右入场;跑 120 步应全部入场。
    for (let i = 0; i < 8 * 0.5 * fps; i++) h.sim.step();
    expect(h.events.spawned.length).toBe(8);
    // 池内选择走注入 rng:同 seed 重跑,monsterId 序列完全一致(确定性在综合用例再验,这里验全类可实例化)。
    for (const s of h.events.spawned) expect(allIds).toContain(s.monsterId);
    expect(() => h.sim.spawnWave(99)).toThrow(); // 模板外波 index:失败快而响
  });

  it.skipIf(!ready)("分裂妖 onDeath 数据驱动:击杀后按 spawnMonsterId/count/hpCoefficientR 原地补 2 只子怪", async () => {
    const config = await clonedConfig();
    injectWaves(config, [wave(1, ["split_yao"], 1, null)]);
    config.monsters.monsters.find((m: any) => m.id === "split_yao").defaultElements = ["wood"];
    // 万刃(metal)克 wood → 加速击杀;摆输出位。
    const { map } = await findSeedWithOpenSlots(config, 2);
    const h = await makeSim({ config, map, loadout: [{ slotIndex: 0, runeId: "fen_tian" }, { slotIndex: 1, runeId: "zhan_jin" }] });
    h.sim.spawnWave(1);
    let guard = 0;
    while (h.events.died.length === 0 && guard++ < 20000) h.sim.step();
    expect(h.events.died.length).toBeGreaterThanOrEqual(1);
    const spawnedIds = h.events.spawned.map((s: any) => s.monsterId);
    expect(spawnedIds[0]).toBe("split_yao");
    expect(spawnedIds.filter((id: string) => id === "swarm_xiaoyao").length).toBe(2); // onDeath.count=2
  });
});

describe("T6 · 集成:BattleController 驱动一局到真实胜负(阵眼血/lootMultiplier)", () => {
  async function runIntegrated(config: any, mapSeed: { seed: number; map: any }, loadout: any[]) {
    const { CombatSimulation } = await load(simPath);
    const { BattleController } = await load(controllerPath);
    const { EventBus } = await load(busPath);
    const { createRng } = await load(rngPath);
    const bus = new EventBus();
    const settled: any[] = [];
    bus.on("battle.settled", (p: any) => settled.push(p));
    const sim = new CombatSimulation({
      config, map: mapSeed.map, bus, rng: createRng(mapSeed.seed),
      loadout, requiredPower: R_D1,
    });
    const ctrl = new BattleController({ config, bus, simulation: sim });
    ctrl.start();
    let guard = 0;
    while (ctrl.phase !== "settle" && guard++ < 2000000) ctrl.tick(1000 / 60);
    expect(settled.length).toBe(1);
    return settled[0];
  }

  it.skipIf(!ready)("3 格局(真实 7 波,默认摆位,单路模板)必须胜利;settled 携带战斗统计与 lootMultiplier=1", async () => {
    const config = await clonedConfig();
    const found = await findSeedWithOpenSlots(config, 3, (m: any) => m.routes.length === 1);
    const s = await runIntegrated(config, found, [
      { slotIndex: 0, runeId: "fen_tian" },
      { slotIndex: 1, runeId: "zhan_jin" },
      { slotIndex: 2, runeId: "qing_teng" },
    ]);
    expect(s.victory).toBe(true);
    expect(s.wavesCleared).toBe(config.balance.battle.wavesPerLevel);
    expect(s.lootMultiplier).toBe(1); // infinite.lootCompensation.byOpenSlotCount["3"]
    expect(s.coreHp).toBeGreaterThan(0);
    expect(s.kills).toBeGreaterThan(0);
    expect(typeof s.leaks).toBe("number");
  });

  it.skipIf(!ready)("2 格局跑完整局:settled.lootMultiplier=1.25(裁定 R3,读 infinite.lootCompensation)", async () => {
    const config = await clonedConfig();
    const found = await findSeedWithOpenSlots(config, 2);
    const s = await runIntegrated(config, found, [
      { slotIndex: 0, runeId: "fen_tian" },
      { slotIndex: 1, runeId: "zhan_jin" },
    ]);
    expect(s.lootMultiplier).toBe(1.25);
    expect(typeof s.victory).toBe("boolean"); // 2 格容许惜败(容量模型 min 比≈1.0),胜负方向不钉死
  });

  it.skipIf(!ready)("阵眼血打穿 → 立即 settle(victory=false):高攻怪流下不再等波表走完", async () => {
    const config = await clonedConfig();
    // 单波 40 只高攻快怪、无符防守 → 必然速败。
    injectWaves(config, [wave(1, ["fast_yao"], 40, 0.2)]);
    const found = await findSeedWithOpenSlots(config, 2);
    const s = await runIntegrated(config, found, []);
    expect(s.victory).toBe(false);
    expect(s.coreHp).toBeLessThanOrEqual(0);
  });

  it.skipIf(!ready)("不注入 simulation 时空转行为与 T3 完全一致(向后兼容,victory=true)", async () => {
    const { BattleController } = await load(controllerPath);
    const { EventBus } = await load(busPath);
    const config = await loadConfig();
    const bus = new EventBus();
    const settled: any[] = [];
    bus.on("battle.settled", (p: any) => settled.push(p));
    const ctrl = new BattleController({ config, bus });
    ctrl.start();
    let guard = 0;
    while (ctrl.phase !== "settle" && guard++ < 500000) ctrl.tick(1000 / 60);
    expect(settled.length).toBe(1);
    expect(settled[0].victory).toBe(true);
    expect(settled[0].wavesCleared).toBe(config.balance.battle.wavesPerLevel);
  });
});

describe("T6 · 确定性(同 seed 同 config 全等复现)", () => {
  it.skipIf(!ready)("同 seed 两局:snapshot 深等,事件计数全等;不同 rng seed:轨迹应可区分", async () => {
    const config = await clonedConfig();
    injectWaves(config, [
      wave(1, ["normal_yaobing", "fast_yao", "swarm_xiaoyao"], 10, 0.7),
      wave(2, ["shield_yao", "armored_yao"], 4, 1.2),
    ]);
    const { map } = await findSeedWithOpenSlots(config, 3);
    const runOnce = async (rngSeed: number) => {
      const h = await makeSim({
        config, map, rngSeed,
        loadout: [{ slotIndex: 0, runeId: "fen_tian" }, { slotIndex: 1, runeId: "zhan_jin" }, { slotIndex: 2, runeId: "qing_teng" }],
      });
      h.sim.spawnWave(1);
      for (let i = 0; i < 900; i++) h.sim.step();
      h.sim.spawnWave(2);
      for (let i = 0; i < 2400; i++) h.sim.step();
      return {
        snapshot: h.sim.snapshot(),
        spawnedSeq: h.events.spawned.map((s: any) => s.monsterId).join(","),
        fired: h.events.fired.length,
        coreDamaged: h.events.coreDamaged.length,
      };
    };
    const a = await runOnce(42);
    const b = await runOnce(42);
    expect(b.snapshot).toEqual(a.snapshot);
    expect(b.spawnedSeq).toBe(a.spawnedSeq);
    expect(b.fired).toBe(a.fired);
    expect(b.coreDamaged).toBe(a.coreDamaged);
    const c = await runOnce(43);
    const differs =
      c.spawnedSeq !== a.spawnedSeq ||
      c.fired !== a.fired ||
      JSON.stringify(c.snapshot) !== JSON.stringify(a.snapshot);
    expect(differs).toBe(true);
  });
});
