/**
 * T6.1 尺子 · dev 调参台(?debug=1)—— Claude 维护,Codex 只读。
 *
 * ── 接口契约(施工按此实现,断言钉死) ─────────────────────────────────
 * 1) src/debug/gate.ts
 *      export function shouldLoadDebugPanel(search: string, isDev: boolean): boolean
 *    语义(2026-07-05 产品拍板:试运行期实时调参):dev 构建【默认加载】,
 *    仅 URLSearchParams(search).get("debug")==="0" 时显式关闭;!isDev 恒 false。
 *    main.ts 只在其为 true 时动态 import("./debug/panel");生产构建永远零加载。
 *
 * 2) src/debug/panelModel.ts —— 面板纯逻辑核(零 DOM,零 Babylon)
 *      export type KnobOverrides = Partial<Record<NumericKnobKey, number>>
 *        (NumericKnobKey = Knobs 中值为 number 的键,由映射类型从 Knobs 派生,禁止手抄字符串并集)
 *      export interface PanelModel {
 *        knobs: Knobs;              // 覆写生效后的旋钮
 *        overrides: KnobOverrides;  // 回显(原样)
 *        lines: string[];           // 与 CLI 逐字同源
 *        sections: BalanceSection[];
 *        failures: string[];
 *        ok: boolean;
 *      }
 *      export function computePanelModel(tables: BalanceTables, overrides?: KnobOverrides): PanelModel
 *    规则:K = deriveKnobs(tables) 后浅覆写数值键;未知键 throw(失败快而响);
 *    不得改传入 tables;曲线判定只来自 scripts/balance-core.mjs 的 runBalanceModel
 *    (单一真相源——在 src/debug 内复制任何公式=违约)。
 *
 * 3) src/game/battle/combat/defaultLoadout.ts —— 从 main.ts 抽出共享
 *      export function buildDefaultLoadout(config: GameConfig, map: GeneratedMap): CombatLoadoutEntry[]
 *    语义与 T6 main.ts 现实现等价:逐格取 slotType.recommendedRuneIds 首个未占用合法符,
 *    否则全符表兜底;main.ts 与 replay 共用此实现(禁止两份拷贝)。
 *
 * 4) src/debug/replay.ts —— 债#6 校准回放(真模拟,非解析模型)
 *      export interface WaveReplayRow {
 *        waveIndex: number;   // 1..wavesPerLevel
 *        spawned: number;     // 出生波归属(onDeath 分裂子代继承父波)
 *        kills: number;       // 按怪的出生波归属
 *        leaks: number;       // 同上
 *        shotsFired: number;  // 按目标怪的出生波归属(经 rune.fired.targetEntityId 映射)
 *      }
 *      export interface ReplayResult {
 *        rows: WaveReplayRow[];                    // 长度 = wavesPerLevel
 *        settled: { victory: boolean; coreHp: number; kills: number; leaks: number;
 *                   lootMultiplier: number; totalSteps: number; wavesCleared: number };
 *        totals: { spawned: number; kills: number; leaks: number; shotsFired: number };
 *      }
 *      export function replayBattle(opts: {
 *        config: GameConfig; seed: number; requiredPower: number;
 *        loadout?: readonly CombatLoadoutEntry[];   // 缺省 = buildDefaultLoadout(config, generateMap(seed))
 *        waveTemplateId?: string;
 *      }): ReplayResult
 *    实现约束:内部只准装配真实 generateMap/CombatSimulation/BattleController(全注入),
 *    统计只准来自 EventBus 事件订阅;禁 Math.random/Date/performance.now;跑至 settle。
 *
 * 5) src/debug/panel.ts —— DOM 薄壳(本尺子不测 DOM,验收走 L3 人眼):
 *    渲染 sections 红绿 + 旋钮编辑重算 + 回放表格与容量曲线对照(债#6)
 *    + 常驻横幅"仅试运行,不落地;落地须 balance-sim 全绿后由 Claude 落配置"。
 * ──────────────────────────────────────────────────────────────────
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const gatePath = resolve(here, "../src/debug/gate.ts");
const modelPath = resolve(here, "../src/debug/panelModel.ts");
const replayPath = resolve(here, "../src/debug/replay.ts");
const loadoutPath = resolve(here, "../src/game/battle/combat/defaultLoadout.ts");
const corePath = resolve(here, "../scripts/balance-core.mjs");
const configIndexPath = resolve(here, "../src/config/index.ts");

const ready =
  existsSync(gatePath) && existsSync(modelPath) && existsSync(replayPath) && existsSync(loadoutPath);

async function load(path: string): Promise<any> {
  return import(path);
}

async function loadTables(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  const c = loadGameConfig();
  return {
    tables: {
      balance: c.balance,
      infinite: c.infinite,
      fatigue: c.fatigue,
      monsters: c.monsters,
      waves: c.waves,
      runes: c.runes,
    },
    config: c,
  };
}

describe("T6.1 · gate:dev 默认加载调试面板,?debug=0 显式关闭", () => {
  it.skipIf(!ready)("语义:dev 默认 true;debug=0 关闭;生产恒 false", async () => {
    const { shouldLoadDebugPanel } = await load(gatePath);
    expect(shouldLoadDebugPanel("", true)).toBe(true); // 试运行期:启动即自动调出(产品拍板 2026-07-05)
    expect(shouldLoadDebugPanel("?seed=7", true)).toBe(true);
    expect(shouldLoadDebugPanel("?debug=1", true)).toBe(true);
    expect(shouldLoadDebugPanel("?debug=0", true)).toBe(false); // 唯一显式关闭口(截图门禁用)
    expect(shouldLoadDebugPanel("?seed=7&debug=0", true)).toBe(false);
    expect(shouldLoadDebugPanel("", false)).toBe(false); // 生产构建永不加载
    expect(shouldLoadDebugPanel("?debug=1", false)).toBe(false);
  });
});

describe("T6.1 · panelModel:与 CLI 数值核逐字同源(单一真相源自证)", () => {
  it.skipIf(!ready)("无覆写基线:lines/sections/failures/ok 与直接跑 balance-core 深等", async () => {
    const { computePanelModel } = await load(modelPath);
    const core = await load(corePath);
    const { tables } = await loadTables();

    const panel = computePanelModel(tables);
    const direct = core.runBalanceModel(core.deriveKnobs(tables));

    expect(panel.lines).toEqual(direct.lines);
    expect(panel.sections).toEqual(direct.sections);
    expect(panel.failures).toEqual(direct.failures);
    expect(panel.ok).toBe(direct.ok);
    expect(panel.ok).toBe(true); // 当前配置六曲线全绿是前提
  });

  it.skipIf(!ready)("覆写生效:depthGrowth=1.5 → wall 节翻红且 failures 非空;relK=5 → mitigation 翻红", async () => {
    const { computePanelModel } = await load(modelPath);
    const { tables } = await loadTables();

    const broken = computePanelModel(tables, { depthGrowth: 1.5 });
    expect(broken.knobs.depthGrowth).toBe(1.5);
    expect(broken.sections.find((s: any) => s.id === "wall")?.ok).toBe(false);
    expect(broken.ok).toBe(false);
    expect(broken.failures.length).toBeGreaterThan(0);

    const mit = computePanelModel(tables, { relK: 5 });
    expect(mit.sections.find((s: any) => s.id === "mitigation")?.ok).toBe(false);
  });

  it.skipIf(!ready)("纯函数:不改传入 tables;未知旋钮键 throw;覆写后再跑基线仍全绿", async () => {
    const { computePanelModel } = await load(modelPath);
    const { tables } = await loadTables();
    const before = JSON.stringify(tables);

    computePanelModel(tables, { depthGrowth: 1.5 });
    expect(JSON.stringify(tables)).toBe(before); // 覆写不落表

    expect(() => computePanelModel(tables, { notAKnob: 3 } as any)).toThrow();

    const again = computePanelModel(tables);
    expect(again.ok).toBe(true); // 无状态残留
  });
});

describe("T6.1 · replay:真实模拟回放(债#6 校准的数据侧)", () => {
  it.skipIf(!ready)("确定性:同 config/seed/requiredPower 两次回放 rows+settled+totals 深等", async () => {
    const { replayBattle } = await load(replayPath);
    const { config } = await loadTables();
    const R = config.balance.progressionCurves.endlessTower.basePower;

    const a = replayBattle({ config, seed: 1, requiredPower: R });
    const b = replayBattle({ config, seed: 1, requiredPower: R });
    expect(a).toEqual(b);
    expect(a.rows.length).toBe(config.balance.battle.wavesPerLevel);
  });

  it.skipIf(!ready)("真值自证:totals/settled 与测试内独立驱动的 BattleController+CombatSimulation 一致", async () => {
    const { replayBattle } = await load(replayPath);
    const { buildDefaultLoadout } = await load(loadoutPath);
    const { CombatSimulation } = await load(resolve(here, "../src/game/battle/combat/CombatSimulation.ts"));
    const { BattleController } = await load(resolve(here, "../src/game/battle/BattleController.ts"));
    const { EventBus } = await load(resolve(here, "../src/game/events/EventBus.ts"));
    const { generateMap } = await load(resolve(here, "../src/game/battle/map/MapGenerator.ts"));
    const { createRng } = await load(resolve(here, "../src/game/battle/map/rng.ts"));
    const { config } = await loadTables();
    const R = config.balance.progressionCurves.endlessTower.basePower;

    const replayed = replayBattle({ config, seed: 1, requiredPower: R });

    // 独立复算(与 replay 同注入,不经 replay 代码路径):
    const map = generateMap({ config, seed: 1 });
    const bus = new EventBus();
    const loadout = buildDefaultLoadout(config, map);
    let fired = 0;
    let spawned = 0;
    let settled: any = null;
    bus.on("rune.fired", () => (fired += 1));
    bus.on("monster.spawned", () => (spawned += 1));
    bus.on("battle.settled", (p: any) => (settled = p));
    const sim = new CombatSimulation({ config, map, bus, rng: createRng(1), loadout, requiredPower: R });
    const battle = new BattleController({ config, bus, simulation: sim });
    battle.start();
    const stepMs = 1000 / config.balance.battle.simulationFps;
    for (let i = 0; i < 30 * 60 * 30 && battle.phase !== "settle"; i++) battle.tick(stepMs);

    expect(settled).not.toBeNull();
    expect(replayed.settled.victory).toBe(settled.victory);
    expect(replayed.settled.coreHp).toBe(settled.coreHp);
    expect(replayed.settled.kills).toBe(settled.kills);
    expect(replayed.settled.leaks).toBe(settled.leaks);
    expect(replayed.settled.lootMultiplier).toBe(settled.lootMultiplier);
    expect(replayed.totals.shotsFired).toBe(fired);
    expect(replayed.totals.spawned).toBe(spawned);
    expect(replayed.totals.kills).toBe(settled.kills);
    expect(replayed.totals.leaks).toBe(settled.leaks);

    // 分波守恒:各波 spawned/kills/leaks/shots 求和 = totals;死+漏 ≤ 生
    const sum = (k: keyof (typeof replayed.rows)[number]) =>
      replayed.rows.reduce((acc: number, r: any) => acc + r[k], 0);
    expect(sum("spawned")).toBe(replayed.totals.spawned);
    expect(sum("kills")).toBe(replayed.totals.kills);
    expect(sum("leaks")).toBe(replayed.totals.leaks);
    expect(sum("shotsFired")).toBe(replayed.totals.shotsFired);
    expect(replayed.totals.kills + replayed.totals.leaks).toBeLessThanOrEqual(replayed.totals.spawned);
  });

  it.skipIf(!ready)("读注入 config(反写死):全怪速度×2 → 回放结果必变且清场不晚于基线", async () => {
    const { replayBattle } = await load(replayPath);
    const { config } = await loadTables();
    const R = config.balance.progressionCurves.endlessTower.basePower;

    const base = replayBattle({ config, seed: 1, requiredPower: R });

    const fast = structuredClone(config);
    for (const m of fast.monsters.monsters) m.speedUnitsPerSecond *= 2;
    const fastResult = replayBattle({ config: fast, seed: 1, requiredPower: R });

    expect(fastResult.rows).not.toEqual(base.rows);
    expect(fastResult.settled.totalSteps).toBeLessThanOrEqual(base.settled.totalSteps);
  });

  it.skipIf(!ready)("默认摆位共享:缺省 loadout = buildDefaultLoadout;逐格互异且首选推荐符", async () => {
    const { replayBattle } = await load(replayPath);
    const { buildDefaultLoadout } = await load(loadoutPath);
    const { generateMap } = await load(resolve(here, "../src/game/battle/map/MapGenerator.ts"));
    const { config } = await loadTables();
    const R = config.balance.progressionCurves.endlessTower.basePower;

    const map = generateMap({ config, seed: 1 });
    const loadout = buildDefaultLoadout(config, map);

    // 结构:逐格 slotIndex 对齐、符 id 合法且互异
    const runeIds = new Set(config.runes.runes.map((r: any) => r.id));
    expect(loadout.map((e: any) => e.slotIndex)).toEqual(map.openSlots.map((_: any, i: number) => i));
    for (const entry of loadout) expect(runeIds.has(entry.runeId)).toBe(true);
    expect(new Set(loadout.map((e: any) => e.runeId)).size).toBe(loadout.length);

    // 首格必为其 slotType 推荐表中的首个合法符(语义锚,防退化为随手取符)
    const slot0Type = config.maps.candidateSlotTypes.find(
      (t: any) => t.id === map.openSlots[0].slotTypeId,
    );
    const firstKnown = slot0Type.recommendedRuneIds.find((id: string) => runeIds.has(id));
    expect(loadout[0].runeId).toBe(firstKnown);

    // 缺省与显式传入同一 loadout 的回放深等(证明共用同一实现)
    const implicit = replayBattle({ config, seed: 1, requiredPower: R });
    const explicit = replayBattle({ config, seed: 1, requiredPower: R, loadout });
    expect(implicit).toEqual(explicit);
  });
});
