import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// T3 战斗状态机 · 验收锚点测试 —— 由 Claude(架构/监督者)编写，是 Task 3 的验收标尺。
//
// 角色契约(反套娃护栏)：
//   · Codex 在 Task 3 实现 src/game/battle/** 与 src/game/events/** 使本测试全部 PASS。
//   · Codex【不得修改本文件】。若认为契约有误，必须停下回报 Claude 评审，
//     不得自行改测试就标"通过"。
//
// 接口契约(由 Claude 钉死；变更须经 Claude 评审)：
//   events/EventBus.ts
//     export class EventBus {
//       on<K extends keyof BattleEventMap>(type: K, handler: (p: BattleEventMap[K]) => void): () => void  // 返回退订函数
//       emit<K extends keyof BattleEventMap>(type: K, payload: BattleEventMap[K]): void
//     }
//     export interface BattleEventMap {
//       "battle.prepStarted": { levelId: string }
//       "wave.started": { index: number }   // index 从 1 到 wavesPerLevel
//       "wave.ended":   { index: number }
//       "battle.settled": { victory: boolean; wavesCleared: number; totalSteps: number }
//     }
//   battle/BattleController.ts
//     export type BattlePhase = "prep" | "combat" | "settle"
//     export class BattleController {
//       constructor(deps: { config: GameConfig; bus: EventBus; levelId?: string })  // config 必须【注入】，不得内部 loadGameConfig
//       get phase(): BattlePhase
//       start(): void                 // 进入 prep
//       tick(realDtMs: number): void  // 喂真实帧间隔；内部按定步长(1000/simulationFps ms)累加推进
//     }
//
// 未落地前(目标文件不存在)自动 skip，不阻塞既有基线；落地后立即生效，违约即判 FAIL。
// 本文件是纯 headless 单测：全程不 import @babylonjs，验证战斗领域可无渲染跑完一局。
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const controllerPath = resolve(here, "../src/game/battle/BattleController.ts");
const busPath = resolve(here, "../src/game/events/EventBus.ts");
const configIndexPath = resolve(here, "../src/config/index.ts");

const busExists = existsSync(busPath);
const ready = busExists && existsSync(controllerPath);

// 变量 specifier 动态 import：避免 tsc 在目标文件尚不存在时静态报错(与 golden.formulas 同款技巧)。
async function load(path: string): Promise<any> {
  const spec = path;
  return import(spec);
}

async function loadConfig(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  return loadGameConfig();
}

interface RunResult {
  phases: string[]; // 阶段变迁轨迹(去重相邻)
  waveStarts: number;
  waveEnds: number;
  settled: Array<{ victory: boolean; wavesCleared: number; totalSteps: number }>;
}

// 用给定 config 与渲染帧间隔 dtMs 跑完整整一局，回收阶段轨迹与事件。
async function runOneBattle(config: any, dtMs: number): Promise<RunResult> {
  const { EventBus } = await load(busPath);
  const { BattleController } = await load(controllerPath);
  const bus = new EventBus();
  const rec: RunResult = { phases: [], waveStarts: 0, waveEnds: 0, settled: [] };
  bus.on("wave.started", () => { rec.waveStarts++; });
  bus.on("wave.ended", () => { rec.waveEnds++; });
  bus.on("battle.settled", (p: any) => { rec.settled.push(p); });

  const ctrl = new BattleController({ config, bus });
  ctrl.start();
  rec.phases.push(ctrl.phase);

  // 反复喂帧，推进到结算为止；guard 上限防未收敛的死循环。
  let guard = 0;
  while (ctrl.phase !== "settle" && guard++ < 500000) {
    ctrl.tick(dtMs);
    const cur = ctrl.phase;
    if (rec.phases[rec.phases.length - 1] !== cur) rec.phases.push(cur);
  }
  return rec;
}

describe("T3 · 状态机相序 prep→combat→settle(headless 跑完一局)", () => {
  it.skipIf(!ready)("一局的阶段轨迹恰为 prep→combat→settle，单向不可逆", async () => {
    const config = await loadConfig();
    const r = await runOneBattle(config, 1000 / 60);
    expect(r.phases).toEqual(["prep", "combat", "settle"]);
  });
});

describe("T3 · 一局产出恰好一次结算事件(空 battle 默认胜利)", () => {
  it.skipIf(!ready)("battle.settled 恰 1 次；victory=true；wavesCleared=wavesPerLevel", async () => {
    const config = await loadConfig();
    const r = await runOneBattle(config, 1000 / 60);
    expect(r.settled.length).toBe(1);
    expect(r.settled[0].victory).toBe(true);
    expect(r.settled[0].wavesCleared).toBe(config.balance.battle.wavesPerLevel);
    expect(r.settled[0].totalSteps).toBeGreaterThan(0);
  });
});

describe("T3 · COMBAT 推进出完整波次事件流", () => {
  it.skipIf(!ready)("wave.started / wave.ended 各出现 wavesPerLevel 次", async () => {
    const config = await loadConfig();
    const r = await runOneBattle(config, 1000 / 60);
    expect(r.waveStarts).toBe(config.balance.battle.wavesPerLevel);
    expect(r.waveEnds).toBe(config.balance.battle.wavesPerLevel);
  });
});

describe("T3 · 定步长与渲染帧率解耦(掉帧不改变战斗结果 · 架构 §5.1)", () => {
  it.skipIf(!ready)("同一局用 60fps 与 20fps 帧间隔喂入，totalSteps 完全一致", async () => {
    const config = await loadConfig();
    const smooth = await runOneBattle(config, 1000 / 60); // 流畅
    const laggy = await runOneBattle(config, 1000 / 20);  // 卡顿(大帧间隔)
    expect(laggy.settled[0].totalSteps).toBe(smooth.settled[0].totalSteps);
    expect(laggy.waveStarts).toBe(smooth.waveStarts);
    expect(laggy.phases).toEqual(smooth.phases);
  });

  it.skipIf(!ready)("同 config 同输入重复两次，结果确定可复现", async () => {
    const config = await loadConfig();
    const a = await runOneBattle(config, 1000 / 60);
    const b = await runOneBattle(config, 1000 / 60);
    expect(b.settled[0].totalSteps).toBe(a.settled[0].totalSteps);
    expect(b.settled[0]).toEqual(a.settled[0]);
  });
});

describe("T3 · tick 率来自 config.balance.battle.simulationFps(非硬编码 30)", () => {
  it.skipIf(!ready)("把 simulationFps 翻倍，同样时长的 totalSteps 随之增多", async () => {
    const base = await loadConfig();
    // 深拷贝解冻后改 fps：证明步数由注入 config 决定，而非代码里写死的 30。
    const fast = structuredClone(base);
    fast.balance.battle.simulationFps = base.balance.battle.simulationFps * 2;

    const baseRun = await runOneBattle(base, 1000 / 60);
    const fastRun = await runOneBattle(fast, 1000 / 60);
    // fps 翻倍 → 每秒切更多 sim step → 总步数应严格多于基准(方向即证明"读 config")。
    expect(fastRun.settled[0].totalSteps).toBeGreaterThan(baseRun.settled[0].totalSteps);
  });
});

describe("T3 · EventBus 类型安全总线的基础正确性", () => {
  it.skipIf(!busExists)("on 返回的退订函数生效：退订后不再收到该事件", async () => {
    const { EventBus } = await load(busPath);
    const bus = new EventBus();
    let hits = 0;
    const off = bus.on("wave.started", () => { hits++; });
    bus.emit("wave.started", { index: 1 });
    off();
    bus.emit("wave.started", { index: 2 });
    expect(hits).toBe(1);
  });

  it.skipIf(!busExists)("多个订阅者都能收到同一事件", async () => {
    const { EventBus } = await load(busPath);
    const bus = new EventBus();
    let a = 0;
    let b = 0;
    bus.on("battle.settled", () => { a++; });
    bus.on("battle.settled", () => { b++; });
    bus.emit("battle.settled", { victory: true, wavesCleared: 7, totalSteps: 1 });
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});
