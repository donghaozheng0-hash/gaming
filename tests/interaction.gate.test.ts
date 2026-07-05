/**
 * T7 尺子 · 局内成长与画符/融合交互(灵机 2/4/6 · 画符 50/80/95 · 雷冰毒融合 · R4 情报 · 债#5)
 * —— Claude 维护,Codex 只读。设计源:总设计 v3 §2.7/2.8/2.9/6.5;裁定 R4/R5。
 *
 * ── 接口契约(钉死) ──────────────────────────────────────────────
 * 1) src/game/battle/draw/scoring.ts
 *      export type DrawTier = "none" | "partial" | "full" | "perfect";
 *      export function drawBonusForScore(score: number, draw: GameConfig["balance"]["damageFormula"]["drawBonus"]):
 *        { tier: DrawTier; bonus: number }
 *    语义:score<partialMinScore→{none,0};[partialMin,full) 线性 0→fullBonus;
 *    ≥full→{full,fullBonus};≥perfect→{perfect,fullBonus}(完美只是表现档,数值同满额)。
 *
 * 2) src/game/battle/draw/recognition.ts
 *      export function scoreStroke(points: readonly Vec2[], template: readonly Vec2[]): number  // 0-100
 *    语义:确定性模板匹配($1 类:包围盒归一 + 重采样 32 点 + 平均点距→分数);
 *    平移/等比缩放不变;模板自拟合≥95;形状无关轨迹<50;禁 Math.random/Date。
 *
 * 3) CombatSimulation 扩三个公开方法(全部确定性,数值仍只走 src/game/formulas/runeDamage):
 *      applyRuneUpgrade(slotIndex: number): void
 *        // 该符攻击成长:base=lv1Attack×(1+battle.runeUpgradeAttackGrowthPerLevel)^级数(复利,进 runeDamage 的 base 参数)
 *      applyFusion(slotIndex: number, recipe: FusionRecipe): void
 *        // 元素置换为合成元素;此后 kezhiMul 改查融合克制:对 advantage.target=×1.6,
 *        // 对 disadvantage.source=×0.7,其余 ×1.0;该符 xiangsheng 档位冻结为融合前取值
 *      submitDraw(slotIndex: number, score: number): { tier: DrawTier; bonus: number }
 *        // 画符强化:该符下一发 drawBonus=bonus(只吃一发);冷却按步数:
 *        // 全局 drawRuneCooldownSeconds.global、单符 .perRune(×simulationFps 取整);冷却中 throw
 *
 * 4) src/game/battle/run/RunProgression.ts —— 灵机/五行精/升级/融合状态机
 *      new RunProgression({ config, bus, rng, simulation, loadout })
 *    - 订阅 wave.ended:index∈battle.lingjiGrantWaves → +1 灵机(上限 maxLingjiPointsPerRun),emit "lingji.granted"{waveIndex,total}
 *    - 五行精:index∈elementEssenceDrop.guaranteedWaves → 必掉 guaranteedAmount;其余波 rng()<extraDropChance → 掉 extraDropAmount;
 *      元素=FIVE[floor(rng()*5)](FIVE=metal,wood,water,fire,earth 顺序),emit "essence.dropped"{element,waveIndex};
 *      rng 消耗顺序钉死:非保底波=先 1 次 chance 判定,命中再 1 次元素;保底波=只 1 次元素(不再额外判定)
 *    - upgradeRune(slotIndex):消耗 1 灵机(不足 throw)→ simulation.applyRuneUpgrade,emit "rune.upgraded"{slotIndex,level} 与 "lingji.spent"{use:"upgrade",slotIndex}
 *    - fuseRune(slotIndex, recipeId):校验 配方∈unlockSchedule[0].recipeIds(否则 throw)、
 *      loadout 的符元素集合 ⊇ recipe.baseElements(否则 throw)、灵机 ≥1 且两族精各 ≥1(否则 throw);
 *      扣消耗 → simulation.applyFusion,emit "rune.fused"{slotIndex,recipeId} 与 "lingji.spent"{use:"fusion",slotIndex,recipeId}
 *    - state(): { lingjiPoints, essences: Record<ElementId,number>, upgradeLevels: number[], fusions: (string|null)[] }
 *
 * 5) src/game/battle/intel.ts —— R4 情报纯函数
 *      export function summarizeWaveElements(config: GameConfig, waveTemplateId?: string):
 *        { rows: Array<{ element: ElementId; potentialCount: number }>; bossWaveIndexes: number[] }
 *    语义:potentialCount[element]=Σ(该元素可能出现的 entry.totalCount)(怪池任一怪 defaultElements 含该元素);
 *    bossWaveIndexes=怪池含 tags:"boss" 怪的波 index;rows 按 FIVE 顺序、count=0 的元素也保留。
 *
 * 6) EventBus 扩(R5 埋点数据源):lingji.granted / lingji.spent / essence.dropped /
 *    rune.upgraded / rune.fused / draw.scored{slotIndex,score,tier};
 *    battle.settled 增可选 wavesDispatched(计时器口径);【债#5】wavesCleared 重定义=
 *    完全清场的出生波数(该波全部 spawned 怪已 died/leaked 才计 1;胜局=wavesPerLevel)。
 * ──────────────────────────────────────────────────────────────
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const scoringPath = resolve(here, "../src/game/battle/draw/scoring.ts");
const recognitionPath = resolve(here, "../src/game/battle/draw/recognition.ts");
const progressionPath = resolve(here, "../src/game/battle/run/RunProgression.ts");
const intelPath = resolve(here, "../src/game/battle/intel.ts");
const simPath = resolve(here, "../src/game/battle/combat/CombatSimulation.ts");
const configIndexPath = resolve(here, "../src/config/index.ts");

const ready =
  existsSync(scoringPath) && existsSync(recognitionPath) && existsSync(progressionPath) && existsSync(intelPath);

async function load(path: string): Promise<any> {
  return import(path);
}

async function loadConfig(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  return loadGameConfig();
}

async function clonedConfig(): Promise<any> {
  return structuredClone(await loadConfig());
}

// ── 契约锚点(独立推导字面量;fen_tian lv1Attack=120,下品×1,中性相生/克制) ──
const FEN_TIAN_BASE = 120;
const DRAW_FULL = 144; // 120×(1+0.2)
const DRAW_PARTIAL_65 = 132; // 65 分→(65-50)/(80-50)×0.2=0.10 → 120×1.1
const UPGRADED_ONE_LEVEL = 138; // 120×1.15
const THUNDER_VS_WATER = 192; // 120×1.6(融合克制取代五行克制)
const THUNDER_VS_EARTH = 84; // 120×0.7

/**
 * 受控战场:slot0=fen_tian(锚点符)+slot1=qing_teng(配方用木符);
 * 锚点纯净化:相生两档全部中和为 1(否则木符会给火符相生加成)、
 * 普通妖兵元素钉为 earth(火 vs 土=中性克制)——除非用例自行覆写。
 */
async function riggedBattle(config: any, waves: any[]) {
  const { CombatSimulation } = await load(simPath);
  const { EventBus } = await load(resolve(here, "../src/game/events/EventBus.ts"));
  const { generateMap } = await load(resolve(here, "../src/game/battle/map/MapGenerator.ts"));

  config.balance.damageFormula.xiangshengMultipliers = { neutral: 1, presence: 1, generated: 1 };
  const yaobing = config.monsters.monsters.find((m: any) => m.id === "normal_yaobing");
  if (yaobing.defaultElements.length > 1) yaobing.defaultElements = ["earth"];
  config.balance.battle.wavesPerLevel = waves.length;
  const template = config.waves.waveTemplates.find((t: any) => t.id === "normal_7_wave");
  template.waves = waves;

  const map = generateMap({ config, seed: 1 });
  const bus = new EventBus();
  const loadout = map.openSlots.map((_: any, slotIndex: number) => ({
    slotIndex,
    runeId: slotIndex === 0 ? "fen_tian" : "qing_teng",
  }));
  const simulation = new CombatSimulation({
    config,
    map,
    bus,
    rng: () => 0.5,
    loadout,
    requiredPower: config.balance.progressionCurves.endlessTower.basePower,
  });
  return { simulation, bus, loadout, map };
}

const singleMonsterWave = (index: number) => ({
  index,
  entries: [{ monsterPoolIds: ["normal_yaobing"], totalCount: 1 }],
  spawnIntervalSeconds: 0,
});

describe("T7 · 画符评分纯函数(2.7 三档)", () => {
  it.skipIf(!ready)("锚点:49→none/0;50→partial/0;65→0.10;80→full/0.2;95→perfect/0.2", async () => {
    const { drawBonusForScore } = await load(scoringPath);
    const draw = (await loadConfig()).balance.damageFormula.drawBonus;

    expect(drawBonusForScore(49, draw)).toEqual({ tier: "none", bonus: 0 });
    expect(drawBonusForScore(50, draw)).toEqual({ tier: "partial", bonus: 0 });
    expect(drawBonusForScore(65, draw).bonus).toBeCloseTo(0.1, 10);
    expect(drawBonusForScore(80, draw)).toEqual({ tier: "full", bonus: 0.2 });
    expect(drawBonusForScore(95, draw)).toEqual({ tier: "perfect", bonus: 0.2 });
  });

  it.skipIf(!ready)("读注入配置(反写死):fullBonus 改 0.3 → 65 分给 0.15", async () => {
    const { drawBonusForScore } = await load(scoringPath);
    const draw = structuredClone((await loadConfig()).balance.damageFormula.drawBonus);
    draw.fullBonus = 0.3;
    expect(drawBonusForScore(65, draw).bonus).toBeCloseTo(0.15, 10);
    expect(drawBonusForScore(90, draw).bonus).toBeCloseTo(0.3, 10);
  });
});

describe("T7 · 笔迹识别(确定性 $1 类)", () => {
  it.skipIf(!ready)("模板自拟合≥95;平移+等比缩放不变≥90;确定性", async () => {
    const { scoreStroke } = await load(recognitionPath);
    const config = await loadConfig();
    const template = config.runes.runes.find((r: any) => r.id === "fen_tian").drawTemplate;

    const self = scoreStroke(template, template);
    expect(self).toBeGreaterThanOrEqual(95);
    const moved = template.map((p: any) => ({ x: p.x * 40 + 7, y: p.y * 40 + 3 }));
    expect(scoreStroke(moved, template)).toBeGreaterThanOrEqual(90);
    expect(scoreStroke(moved, template)).toBe(scoreStroke(moved, template));
  });

  it.skipIf(!ready)("异形轨迹<50:反向模板与直线都不成符", async () => {
    const { scoreStroke } = await load(recognitionPath);
    const config = await loadConfig();
    const template = config.runes.runes.find((r: any) => r.id === "fen_tian").drawTemplate;

    const reversed = [...template].reverse();
    const line = [{ x: 0.1, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.9 }];
    expect(scoreStroke(reversed, template)).toBeLessThan(50);
    expect(scoreStroke(line, template)).toBeLessThan(50);
  });
});

describe("T7 · CombatSimulation:画符增幅与冷却(按步数,确定性)", () => {
  it.skipIf(!ready)("满额画符:下一发 144(只吃一发,第二发回 120);draw.scored 事件携带 tier", async () => {
    const config = await clonedConfig();
    const { simulation, bus } = await riggedBattle(config, [singleMonsterWave(1)]);
    const damages: number[] = [];
    let scored: any = null;
    bus.on("rune.fired", (p: any) => { if (p.slotIndex === 0) damages.push(p.damage); });
    bus.on("draw.scored", (p: any) => (scored = p));

    simulation.spawnWave(1);
    const result = simulation.submitDraw(0, 88);
    expect(result).toEqual({ tier: "full", bonus: 0.2 });
    expect(scored).toMatchObject({ slotIndex: 0, score: 88, tier: "full" });

    for (let step = 0; step < 90 && damages.length < 2; step += 1) simulation.step();
    expect(damages[0]).toBe(DRAW_FULL);
    expect(damages[1]).toBe(FEN_TIAN_BASE);
  });

  it.skipIf(!ready)("冷却:单符 15s 内重画 throw;全局 5s 内画另一符 throw;过窗后放行", async () => {
    const config = await clonedConfig();
    const { simulation } = await riggedBattle(config, [singleMonsterWave(1)]);
    const fps = config.balance.battle.simulationFps;

    simulation.submitDraw(0, 88);
    expect(() => simulation.submitDraw(0, 88)).toThrow(); // 单符冷却
    expect(() => simulation.submitDraw(1, 88)).toThrow(); // 全局冷却(5s)
    for (let step = 0; step < 5 * fps + 1; step += 1) simulation.step();
    expect(() => simulation.submitDraw(1, 88)).not.toThrow(); // 全局窗过,另一符可画
    for (let step = 0; step < 10 * fps + 1; step += 1) simulation.step();
    expect(() => simulation.submitDraw(0, 88)).not.toThrow(); // 单符 15s 窗过
  });

  it.skipIf(!ready)("65 分部分加成:下一发 132(线性档进 runeDamage 的 drawBonus)", async () => {
    const config = await clonedConfig();
    const { simulation, bus } = await riggedBattle(config, [singleMonsterWave(1)]);
    const damages: number[] = [];
    bus.on("rune.fired", (p: any) => { if (p.slotIndex === 0) damages.push(p.damage); });

    simulation.spawnWave(1);
    simulation.submitDraw(0, 65);
    for (let step = 0; step < 90 && damages.length < 1; step += 1) simulation.step();
    expect(damages[0]).toBe(DRAW_PARTIAL_65);
  });
});

describe("T7 · RunProgression:灵机 2/4/6 与五行精(2.8)", () => {
  it.skipIf(!ready)("发放:wave.ended 2/4/6 各+1,上限 3;lingji.granted 事件", async () => {
    const config = await clonedConfig();
    const waves = [1, 2, 3, 4, 5, 6, 7].map(singleMonsterWave);
    const { simulation, bus, loadout } = await riggedBattle(config, waves);
    const { RunProgression } = await load(progressionPath);
    const granted: any[] = [];
    bus.on("lingji.granted", (p: any) => granted.push(p));
    const run = new RunProgression({ config, bus, rng: () => 0.99, simulation, loadout });

    for (let index = 1; index <= 7; index += 1) bus.emit("wave.ended", { index });
    expect(granted.map((g) => g.waveIndex)).toEqual(config.balance.battle.lingjiGrantWaves);
    expect(run.state().lingjiPoints).toBe(config.balance.battle.maxLingjiPointsPerRun);
  });

  it.skipIf(!ready)("五行精:3/6 波保底必掉;rng<0.3 时其他波额外掉;元素=FIVE[floor(rng×5)]", async () => {
    const config = await clonedConfig();
    const waves = [1, 2, 3, 4, 5, 6, 7].map(singleMonsterWave);

    // rng 恒 0.99:只保底波掉,元素=FIVE[4]=earth
    {
      const { simulation, bus, loadout } = await riggedBattle(structuredClone(config), waves);
      const { RunProgression } = await load(progressionPath);
      const drops: any[] = [];
      bus.on("essence.dropped", (p: any) => drops.push(p));
      const run = new RunProgression({ config, bus, rng: () => 0.99, simulation, loadout });
      for (let index = 1; index <= 7; index += 1) bus.emit("wave.ended", { index });
      expect(drops.map((d) => d.waveIndex)).toEqual(config.balance.battle.elementEssenceDrop.guaranteedWaves);
      expect(drops.every((d) => d.element === "earth")).toBe(true);
      expect(run.state().essences.earth).toBe(drops.length);
    }
    // rng 恒 0:每波都掉(保底+额外),元素=FIVE[0]=metal
    {
      const { simulation, bus, loadout } = await riggedBattle(structuredClone(config), waves);
      const { RunProgression } = await load(progressionPath);
      const drops: any[] = [];
      bus.on("essence.dropped", (p: any) => drops.push(p));
      new RunProgression({ config, bus, rng: () => 0, simulation, loadout });
      for (let index = 1; index <= 7; index += 1) bus.emit("wave.ended", { index });
      expect(drops.length).toBe(7);
      expect(drops.every((d) => d.element === "metal")).toBe(true);
    }
  });

  it.skipIf(!ready)("升级:消耗 1 灵机 → 该符下一发 138(复利进 base);无点数 throw", async () => {
    const config = await clonedConfig();
    const { simulation, bus, loadout } = await riggedBattle(config, [1, 2].map(singleMonsterWave));
    const { RunProgression } = await load(progressionPath);
    const run = new RunProgression({ config, bus, rng: () => 0.99, simulation, loadout });
    const damages: number[] = [];
    bus.on("rune.fired", (p: any) => { if (p.slotIndex === 0) damages.push(p.damage); });

    expect(() => run.upgradeRune(0)).toThrow(); // 还没有灵机点
    bus.emit("wave.ended", { index: 2 });
    run.upgradeRune(0);
    expect(run.state().lingjiPoints).toBe(0);
    expect(run.state().upgradeLevels[0]).toBe(1);

    simulation.spawnWave(1);
    for (let step = 0; step < 90 && damages.length < 1; step += 1) simulation.step();
    expect(damages[0]).toBe(UPGRADED_ONE_LEVEL);
  });
});

describe("T7 · 融合(2.9/6.5):雷=木+火,克制表取代五行克制", () => {
  async function fusedThunderBattle(monsterElement: string) {
    const config = await clonedConfig();
    // 受控:怪固定元素;fen_tian(火)+qing_teng(木) 满足雷配方
    config.monsters.monsters.find((m: any) => m.id === "normal_yaobing").defaultElements = [monsterElement];
    const { simulation, bus, loadout } = await riggedBattle(config, [1, 2].map(singleMonsterWave));
    const { RunProgression } = await load(progressionPath);
    const run = new RunProgression({ config, bus, rng: () => 0, simulation, loadout });
    // 凑材料:灵机 1 点 + 木/火精(rng=0 恒掉 metal,直接注入状态不可行 → 走 rng 序列)
    return { config, simulation, bus, run, loadout };
  }

  it.skipIf(!ready)("fuseRune 校验链:未开放配方 throw;元素不齐 throw;材料不足 throw", async () => {
    const { run } = await fusedThunderBattle("water");
    expect(() => run.fuseRune(0, "ghost")).toThrow(); // 幽未在首测开放集
    expect(() => run.fuseRune(0, "ice")).toThrow(); // 出战符无 metal/water 元素
    expect(() => run.fuseRune(0, "thunder")).toThrow(); // 配方满足但灵机/精不足
  });

  it.skipIf(!ready)("融合成功:消耗正确;融合符对 water 192、对 earth 84;rune.fused 事件", async () => {
    const config = await clonedConfig();
    config.monsters.monsters.find((m: any) => m.id === "normal_yaobing").defaultElements = ["water"];
    // rng 序列:精掉落轮流给 wood(idx1→0.2..0.4)与 fire(idx3→0.6..0.8)
    const rngValues = [0.25, 0.25, 0.65, 0.65, 0.25, 0.65];
    let rngAt = 0;
    const rng = () => rngValues[rngAt++ % rngValues.length];
    const { simulation, bus, loadout } = await riggedBattle(config, [1, 2, 3, 4, 5, 6, 7].map(singleMonsterWave));
    const { RunProgression } = await load(progressionPath);
    const run = new RunProgression({ config, bus, rng, simulation, loadout });
    let fused: any = null;
    bus.on("rune.fused", (p: any) => (fused = p));

    for (let index = 1; index <= 7; index += 1) bus.emit("wave.ended", { index }); // 3 灵机+若干精
    const before = run.state();
    expect(before.essences.wood).toBeGreaterThanOrEqual(1);
    expect(before.essences.fire).toBeGreaterThanOrEqual(1);

    run.fuseRune(0, "thunder");
    const after = run.state();
    expect(after.lingjiPoints).toBe(before.lingjiPoints - 1);
    expect(after.essences.wood).toBe(before.essences.wood - 1);
    expect(after.essences.fire).toBe(before.essences.fire - 1);
    expect(after.fusions[0]).toBe("thunder");
    expect(fused).toMatchObject({ slotIndex: 0, recipeId: "thunder" });

    const damages: number[] = [];
    bus.on("rune.fired", (p: any) => { if (p.slotIndex === 0) damages.push(p.damage); });
    simulation.spawnWave(1);
    for (let step = 0; step < 90 && damages.length < 1; step += 1) simulation.step();
    expect(damages[0]).toBe(THUNDER_VS_WATER);
  });

  it.skipIf(!ready)("融合克制的另一面:雷对 earth 怪 84(被土 ×0.7)", async () => {
    const config = await clonedConfig();
    config.monsters.monsters.find((m: any) => m.id === "normal_yaobing").defaultElements = ["earth"];
    const rngValues = [0.25, 0.25, 0.65, 0.65, 0.25, 0.65];
    let rngAt = 0;
    const { simulation, bus, loadout } = await riggedBattle(config, [1, 2, 3, 4, 5, 6, 7].map(singleMonsterWave));
    const { RunProgression } = await load(progressionPath);
    const run = new RunProgression({ config, bus, rng: () => rngValues[rngAt++ % rngValues.length], simulation, loadout });
    for (let index = 1; index <= 7; index += 1) bus.emit("wave.ended", { index });
    run.fuseRune(0, "thunder");

    const damages: number[] = [];
    bus.on("rune.fired", (p: any) => { if (p.slotIndex === 0) damages.push(p.damage); });
    simulation.spawnWave(1);
    for (let step = 0; step < 90 && damages.length < 1; step += 1) simulation.step();
    expect(damages[0]).toBe(THUNDER_VS_EARTH);
  });
});

describe("T7 · 债#5:wavesCleared=完全清场口径;wavesDispatched=计时器口径", () => {
  it.skipIf(!ready)("第 1 波全清、第 2 波存活漏怪判负 → wavesCleared=1,wavesDispatched=2", async () => {
    const config = await clonedConfig();
    // 第 1 波 1 只弱怪(会被击杀);第 2 波 6 只快怪(漏怪磨死阵眼)
    const waves = [
      { index: 1, entries: [{ monsterPoolIds: ["normal_yaobing"], totalCount: 1 }], spawnIntervalSeconds: 0 },
      { index: 2, entries: [{ monsterPoolIds: ["fast_yao"], totalCount: 40 }], spawnIntervalSeconds: 1 },
    ];
    const { simulation, bus } = await riggedBattle(config, waves);
    const { BattleController } = await load(resolve(here, "../src/game/battle/BattleController.ts"));
    let settled: any = null;
    bus.on("battle.settled", (p: any) => (settled = p));
    const battle = new BattleController({ config, bus, simulation });
    battle.start();
    const stepMs = 1000 / config.balance.battle.simulationFps;
    for (let i = 0; i < 30 * 60 * 10 && battle.phase !== "settle"; i += 1) battle.tick(stepMs);

    expect(settled).not.toBeNull();
    expect(settled.victory).toBe(false);
    expect(settled.wavesDispatched).toBe(2);
    expect(settled.wavesCleared).toBe(1); // 只有第 1 波被完全处决(全清=died∪leaked)
  });

  it.skipIf(!ready)("胜局:wavesCleared=wavesPerLevel 且=wavesDispatched", async () => {
    const config = await clonedConfig();
    const waves = [1, 2].map(singleMonsterWave);
    const { simulation, bus } = await riggedBattle(config, waves);
    const { BattleController } = await load(resolve(here, "../src/game/battle/BattleController.ts"));
    let settled: any = null;
    bus.on("battle.settled", (p: any) => (settled = p));
    const battle = new BattleController({ config, bus, simulation });
    battle.start();
    const stepMs = 1000 / config.balance.battle.simulationFps;
    for (let i = 0; i < 30 * 60 * 10 && battle.phase !== "settle"; i += 1) battle.tick(stepMs);

    expect(settled.victory).toBe(true);
    expect(settled.wavesCleared).toBe(2);
    expect(settled.wavesDispatched).toBe(2);
  });
});

describe("T7 · R4 情报纯函数", () => {
  it.skipIf(!ready)("受控波表:元素潜在计数与 boss 波索引与手算一致;五元素全保留", async () => {
    const { summarizeWaveElements } = await load(intelPath);
    const config = await clonedConfig();
    const template = config.waves.waveTemplates.find((t: any) => t.id === "normal_7_wave");
    template.waves = [
      { index: 1, entries: [{ monsterPoolIds: ["normal_yaobing"], totalCount: 5 }], spawnIntervalSeconds: 0 },
      { index: 2, entries: [{ monsterPoolIds: ["chapter_boss"], totalCount: 1 }], spawnIntervalSeconds: 0 },
    ];
    config.balance.battle.wavesPerLevel = 2;
    // 手算:normal_yaobing defaultElements=[wood,earth]→wood+5,earth+5;
    // chapter_boss defaultElements 含 metal,water(双阶段)→各+1;boss 波=[2]
    const result = summarizeWaveElements(config, "normal_7_wave");
    expect(result.bossWaveIndexes).toEqual([2]);
    expect(result.rows.map((r: any) => r.element)).toEqual(["metal", "wood", "water", "fire", "earth"]);
    const byElement = Object.fromEntries(result.rows.map((r: any) => [r.element, r.potentialCount]));
    const yaobing = config.monsters.monsters.find((m: any) => m.id === "normal_yaobing");
    const boss = config.monsters.monsters.find((m: any) => m.id === "chapter_boss");
    for (const element of ["metal", "wood", "water", "fire", "earth"]) {
      const expected = (yaobing.defaultElements.includes(element) ? 5 : 0) + (boss.defaultElements.includes(element) ? 1 : 0);
      expect(byElement[element]).toBe(expected);
    }
  });
});
