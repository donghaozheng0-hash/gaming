import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// T4 地图路径与随机开放格位 · 验收锚点测试 —— 由 Claude(架构/监督者)编写，是 Task 4 的验收标尺。
//
// 角色契约(反套娃护栏)：
//   · Codex 在 Task 4 实现 src/game/battle/map/** 并扩展 src/config/maps.json(+schema)使本测试全部 PASS。
//   · Codex【不得修改本文件】。若认为契约有误，必须停下回报 Claude 评审，
//     不得自行改测试就标"通过"。
//
// 接口契约(由 Claude 钉死；变更须经 Claude 评审)：
//   battle/map/rng.ts
//     export function createRng(seed: number): () => number
//       // 种子化确定性 PRNG(建议 mulberry32)；返回 [0,1) 均匀数；同 seed 序列完全一致。
//       // 该文件内 PRNG 结构魔数允许行级 iso-ok 豁免；其余 map/** 文件零裸数字。
//   battle/map/MapGenerator.ts
//     export interface Vec2 { x: number; y: number }
//     export interface OpenSlot { slotTypeId: string; element: string; position: Vec2 }
//     export interface GeneratedMap {
//       poolId: string
//       templateId: string
//       archetype: string
//       routes: Vec2[][]        // 长度 === 模板 routeCount；几何逐点等于配置模板的 routes(运行时不发明坐标)
//       openSlots: OpenSlot[]   // 数量每局随机 ∈ [openSlotCountRange.min, openSlotCountRange.max]
//                               // (产品拍板 2026-07-02：原固定 6 改每局随机 2-3,格位稀缺化)；slotTypeId 互异
//     }
//     export function generateMap(opts: { config: GameConfig; seed: number; poolId?: string }): GeneratedMap
//       // poolId 缺省取 config.maps.mapPools[0]；config 必须【注入】，严禁内部 loadGameConfig / Math.random / Date。
//
//   配置扩展契约(src/config/maps.json + schema/maps.ts)：
//     randomization.openSlotCount 废除,改 openSlotCountRange: { min: number; max: number }
//                         // 1 ≤ min ≤ max 整数,schema 违反即抛；产品值 min=2,max=3
//     顶层新增 canvas: { widthUnits: number; heightUnits: number }  // 逻辑画布，全部坐标必须落在其内
//     pathTemplates[] 增补：
//       routes: Vec2[][]  // 长度 === routeCount；每条 ≥2 点；zigzag_path 的单条 ≥4 点(折线)；
//                         // dual_entry_merge 两条入口点不同、终点(阵眼)相同
//       candidateSlots: Array<{ slotTypeId: string; position: Vec2 }>
//                         // 互异、≥ openSlotCountRange.max+2，slotTypeId ∈ candidateSlotTypes；原 candidateSlotTypeIds 字段废除
//
// 未落地前(目标文件不存在)自动 skip，不阻塞既有基线；落地后立即生效，违约即判 FAIL。
// 本文件是纯 headless 单测：全程不 import @babylonjs。
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const genPath = resolve(here, "../src/game/battle/map/MapGenerator.ts");
const rngPath = resolve(here, "../src/game/battle/map/rng.ts");
const configIndexPath = resolve(here, "../src/config/index.ts");

const rngExists = existsSync(rngPath);
const ready = rngExists && existsSync(genPath);

// 变量 specifier 动态 import：避免 tsc 在目标文件尚不存在时静态报错(与 battle.controller.gate 同款技巧)。
async function load(path: string): Promise<any> {
  const spec = path;
  return import(spec);
}

async function loadConfig(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  return loadGameConfig();
}

async function gen(config: any, seed: number, poolId?: string): Promise<any> {
  const { generateMap } = await load(genPath);
  return generateMap({ config, seed, poolId });
}

function slotKey(m: any): string {
  return m.openSlots.map((s: any) => s.slotTypeId).sort().join("|");
}
function elementKey(m: any): string {
  return m.openSlots
    .map((s: any) => `${s.slotTypeId}:${s.element}`)
    .sort()
    .join("|");
}
function templateOf(config: any, m: any): any {
  const pool = config.maps.mapPools.find((p: any) => p.id === m.poolId);
  return pool.pathTemplates.find((t: any) => t.id === m.templateId);
}

describe("T4 · 种子化 RNG 基础契约", () => {
  it.skipIf(!rngExists)("同 seed 序列完全一致；值域 [0,1)；不同 seed 序列不同", async () => {
    const { createRng } = await load(rngPath);
    const take = (seed: number, n: number) => {
      const r = createRng(seed);
      return Array.from({ length: n }, () => r());
    };
    expect(take(123, 8)).toEqual(take(123, 8));
    expect(take(0, 8)).toEqual(take(0, 8)); // seed=0 边界也必须确定
    for (const v of take(123, 8)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(take(1, 8)).not.toEqual(take(2, 8));
  });
});

describe("T4 · 同 seed 可复现(验收标准·复现性)", () => {
  it.skipIf(!ready)("同 config 同 seed 两次生成，结果深度相等", async () => {
    const config = await loadConfig();
    const a = await gen(config, 42);
    const b = await gen(config, 42);
    expect(b).toEqual(a);
  });

  it.skipIf(!ready)("交错生成不同 seed 后重放，结果不受模块级隐藏状态污染", async () => {
    const config = await loadConfig();
    const first = await gen(config, 7);
    await gen(config, 8); // 中间插入别的 seed
    const replay = await gen(config, 7);
    expect(replay).toEqual(first);
  });
});

describe("T4 · 不同 seed 产生不同地图(验收标准·随机性)", () => {
  it.skipIf(!ready)("扫 seed 1..60：三套模板全部出现；开格数覆盖 [min,max]；开放格组合与五行分配多样", async () => {
    const config = await loadConfig();
    const { min, max } = config.maps.randomization.openSlotCountRange;
    const templates = new Set<string>();
    const counts = new Set<number>();
    const slotSets = new Set<string>();
    const elementSets = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const m = await gen(config, seed);
      templates.add(m.templateId);
      counts.add(m.openSlots.length);
      slotSets.add(`${m.templateId}#${slotKey(m)}`);
      elementSets.add(`${m.templateId}#${elementKey(m)}`);
    }
    // 池里 3 套模板(直进压迫/折线/双入口汇流)在 60 个 seed 内必须全部可达
    expect(templates.size).toBe(config.maps.mapPools[0].pathTemplates.length);
    // 开格数本身必须真随机：60 seed 内 min 与 max 两个端点都要出现(产品:2 与 3)
    expect(counts.has(min)).toBe(true);
    expect(counts.has(max)).toBe(true);
    // 开放格组合与五行分配都必须真随机(非固定)：60 seed 至少 10 种不同结果
    expect(slotSets.size).toBeGreaterThanOrEqual(10);
    expect(elementSets.size).toBeGreaterThanOrEqual(10);
  });
});

describe("T4 · 生成结果的结构合法性(逐 seed 全量校验)", () => {
  it.skipIf(!ready)("开放格数∈[min,max]、互异、来自模板候选、五行∈elementPool、坐标在画布内", async () => {
    const config = await loadConfig();
    const { openSlotCountRange, elementPool } = config.maps.randomization;
    const { widthUnits, heightUnits } = config.maps.canvas;
    for (let seed = 1; seed <= 30; seed++) {
      const m = await gen(config, seed);
      const tpl = templateOf(config, m);
      expect(tpl).toBeTruthy();
      expect(m.archetype).toBe(tpl.archetype);

      expect(m.openSlots.length).toBeGreaterThanOrEqual(openSlotCountRange.min);
      expect(m.openSlots.length).toBeLessThanOrEqual(openSlotCountRange.max);
      const ids = m.openSlots.map((s: any) => s.slotTypeId);
      expect(new Set(ids).size).toBe(m.openSlots.length); // 互异
      for (const slot of m.openSlots) {
        const candidate = tpl.candidateSlots.find((c: any) => c.slotTypeId === slot.slotTypeId);
        expect(candidate).toBeTruthy(); // 只能开模板候选里的格
        expect(slot.position).toEqual(candidate.position); // 坐标来自配置，运行时不发明
        expect(elementPool).toContain(slot.element);
        expect(slot.position.x).toBeGreaterThanOrEqual(0);
        expect(slot.position.x).toBeLessThanOrEqual(widthUnits);
        expect(slot.position.y).toBeGreaterThanOrEqual(0);
        expect(slot.position.y).toBeLessThanOrEqual(heightUnits);
      }

      // 路线几何逐点等于配置模板(运行时只选择、不发明坐标)
      expect(m.routes).toEqual(tpl.routes);
      for (const route of m.routes) {
        expect(route.length).toBeGreaterThanOrEqual(2);
        for (const p of route) {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.x).toBeLessThanOrEqual(widthUnits);
          expect(p.y).toBeGreaterThanOrEqual(0);
          expect(p.y).toBeLessThanOrEqual(heightUnits);
        }
      }
    }
  });
});

describe("T4 · 三种路径原型的几何契约", () => {
  it.skipIf(!ready)("直进/折线单路线；折线≥4点；双入口两条路线入口不同、终点汇流一致", async () => {
    const config = await loadConfig();
    const byTemplate: Record<string, any> = {};
    for (let seed = 1; seed <= 200 && Object.keys(byTemplate).length < 3; seed++) {
      const m = await gen(config, seed);
      byTemplate[m.templateId] ??= m;
    }
    const straight = byTemplate["straight_pressure"];
    const zigzag = byTemplate["zigzag_path"];
    const dual = byTemplate["dual_entry_merge"];
    expect(straight).toBeTruthy();
    expect(zigzag).toBeTruthy();
    expect(dual).toBeTruthy();

    expect(straight.routes.length).toBe(1);
    expect(zigzag.routes.length).toBe(1);
    expect(zigzag.routes[0].length).toBeGreaterThanOrEqual(4); // 折线：至少两个拐点

    expect(dual.routes.length).toBe(2); // 禁止固定只有一条路线(契约 forbidden)
    const [ra, rb] = dual.routes;
    expect(ra[0]).not.toEqual(rb[0]); // 两个入口不同
    expect(ra[ra.length - 1]).toEqual(rb[rb.length - 1]); // 终点(阵眼)汇流一致
  });
});

describe("T4 · 随机参数读 config 而非硬编码", () => {
  it.skipIf(!ready)("注入 openSlotCountRange={min:1,max:1} 的 config，开放格数量随之恒为 1", async () => {
    const base = await loadConfig();
    const patched = structuredClone(base);
    patched.maps.randomization.openSlotCountRange = { min: 1, max: 1 };
    const m = await gen(patched, 5);
    expect(m.openSlots.length).toBe(1);
  });

  it.skipIf(!ready)("注入单一 elementPool 的 config，全部开放格五行只能是该元素", async () => {
    const base = await loadConfig();
    const patched = structuredClone(base);
    patched.maps.randomization.elementPool = ["fire"];
    const m = await gen(patched, 9);
    for (const slot of m.openSlots) expect(slot.element).toBe("fire");
  });
});
