import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// T5 水墨渲染占位场景 · 验收锚点测试 —— 由 Claude(架构/监督者)编写，是 Task 5 的验收标尺。
//
// 角色契约(反套娃护栏)：
//   · Codex 在 Task 5 实现 src/render/** 并扩展 visual.json(+schema)使本测试全部 PASS。
//   · Codex【不得修改本文件】。若认为契约有误，必须停下回报 Claude 评审。
//
// 接口契约(由 Claude 钉死；变更须经 Claude 评审)：
//   render/mapping.ts
//     export function canvasToWorld(
//       p: { x: number; y: number },
//       opts: { canvas: { widthUnits: number; heightUnits: number }; worldUnitsPerCanvasUnit: number },
//     ): { x: number; y: number; z: number }
//       // 纯函数：地图逻辑画布(左上原点,y 向下) → 世界坐标(纸面 XZ 平面,y=0)
//       // 世界X = (p.x - widthUnits/2) * u；世界Y = 0；世界Z = (heightUnits/2 - p.y) * u
//   render/battleScene.ts
//     export function createBattleScene(
//       engine: Engine,                                  // NullEngine 必须可跑(禁依赖 DOM/DynamicTexture)
//       deps: { config: GameConfig; map: GeneratedMap },  // 注入,严禁内部 loadGameConfig/generateMap
//     ): Scene
//   场景图契约(NullEngine 可机器验证)：
//     · scene.clearColor == palette.surface.paper(宣纸底)
//     · 存在名为 "paper" 的节点(纸面地面)
//     · 每条路线 i 存在名为 `route-${i}` 的节点,metadata.points 与 map.routes[i] 深等(墨线路径数据)
//     · 存在名为 "core" 的节点,位置 == canvasToWorld(路线终点)(阵眼)
//     · 每个开放格(每局随机 2-3 个,数量由地图层决定)存在名为 `slot-${slotTypeId}` 的节点：metadata { slotTypeId, element } 与
//       map.openSlots 一致、位置 == canvasToWorld(slot.position)、材质颜色(diffuse/emissive/albedo 任一)
//       == palette.elements[element].primary(五行色符位)
//   配置扩展契约(visual.json + schema/visual.ts)：
//     顶层新增 "scene" 段(全部为数值,schema 校验为正)：
//       { worldUnitsPerCanvasUnit, camera:{alphaDeg,betaDeg,radiusWorldUnits},
//         routeWidthCanvasUnits, slotRadiusCanvasUnits, coreRadiusCanvasUnits, paperMarginCanvasUnits }
//   颜色纪律(静态扫描,立即生效不 skip)：
//     src/render/**、src/ui/** 的 .ts 内禁止出现 hex 色值字面量或 rgb()/rgba() —— 颜色只能来自 visual.json。
//
// 未落地前(目标文件不存在)场景类用例自动 skip；静态扫描用例对已存在目录立即生效。
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scenePath = resolve(root, "src/render/battleScene.ts");
const mappingPath = resolve(root, "src/render/mapping.ts");
const configIndexPath = resolve(root, "src/config/index.ts");
const mapGenPath = resolve(root, "src/game/battle/map/MapGenerator.ts");

const mappingExists = existsSync(mappingPath);
const ready = mappingExists && existsSync(scenePath);

async function load(path: string): Promise<any> {
  const spec = path;
  return import(spec);
}

async function loadConfig(): Promise<any> {
  const { loadGameConfig } = await load(configIndexPath);
  return loadGameConfig();
}

async function makeMap(config: any, seed: number): Promise<any> {
  const { generateMap } = await load(mapGenPath);
  return generateMap({ config, seed });
}

async function buildScene(config: any, map: any): Promise<{ scene: any; BAB: any; engine: any }> {
  const BAB = await import("@babylonjs/core");
  const engine = new BAB.NullEngine();
  const { createBattleScene } = await load(scenePath);
  const scene = createBattleScene(engine, { config, map });
  return { scene, BAB, engine };
}

function hexOf(color: any): string {
  return String(color.toHexString()).toLowerCase().slice(0, 7);
}

// 收集材质上所有 Color3 类属性的 hex,用于"材质颜色 == 配置色"断言(兼容 Standard/PBR)。
function materialHexes(mesh: any): string[] {
  const m = mesh?.material;
  if (!m) return [];
  const out: string[] = [];
  for (const key of ["diffuseColor", "emissiveColor", "albedoColor", "ambientColor"]) {
    const c = (m as any)[key];
    if (c && typeof c.toHexString === "function") out.push(hexOf(c));
  }
  return out;
}

function listTs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

describe("T5 · 颜色纪律：渲染/UI 代码零硬编码色值(颜色只能来自 visual.json)", () => {
  it("src/render/**、src/ui/** 无 hex 色值/rgb() 字面量", () => {
    const files = [...listTs(resolve(root, "src/render")), ...listTs(resolve(root, "src/ui"))];
    const colorRe = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/;
    const violations: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      src.split("\n").forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "");
        if (colorRe.test(code)) violations.push(`${f.slice(root.length + 1)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(violations, `硬编码颜色:\n${violations.join("\n")}`).toEqual([]);
  });
});

describe("T5 · canvasToWorld 坐标映射(纸面 XZ,画布左上原点)", () => {
  it.skipIf(!mappingExists)("中心→原点、角点对称、y 恒为 0、线性缩放", async () => {
    const { canvasToWorld } = await load(mappingPath);
    const opts = { canvas: { widthUnits: 1000, heightUnits: 1000 }, worldUnitsPerCanvasUnit: 0.01 };
    expect(canvasToWorld({ x: 500, y: 500 }, opts)).toEqual({ x: 0, y: 0, z: 0 });
    expect(canvasToWorld({ x: 0, y: 0 }, opts)).toEqual({ x: -5, y: 0, z: 5 });
    expect(canvasToWorld({ x: 1000, y: 1000 }, opts)).toEqual({ x: 5, y: 0, z: -5 });
    const doubled = { ...opts, worldUnitsPerCanvasUnit: 0.02 };
    expect(canvasToWorld({ x: 1000, y: 500 }, doubled)).toEqual({ x: 10, y: 0, z: 0 });
  });
});

describe("T5 · 场景基底：宣纸底色与纸面节点", () => {
  it.skipIf(!ready)("clearColor == palette.surface.paper；存在 paper 节点", async () => {
    const config = await loadConfig();
    const map = await makeMap(config, 11);
    const { scene, BAB } = await buildScene(config, map);
    const paper = BAB.Color3.FromHexString(config.visual.palette.surface.paper);
    expect(hexOf(scene.clearColor)).toBe(hexOf(paper));
    expect(scene.getNodeByName("paper")).toBeTruthy();
  });
});

describe("T5 · 墨线路径与阵眼", () => {
  it.skipIf(!ready)("route-i 节点携带与地图深等的路径点；core 位于路线终点映射处", async () => {
    const config = await loadConfig();
    const map = await makeMap(config, 11);
    const { scene } = await buildScene(config, map);
    const { canvasToWorld } = await load(mappingPath);
    for (let i = 0; i < map.routes.length; i++) {
      const node = scene.getNodeByName(`route-${i}`);
      expect(node, `缺少 route-${i}`).toBeTruthy();
      expect(node.metadata?.points).toEqual(map.routes[i]);
    }
    const core = scene.getNodeByName("core");
    expect(core).toBeTruthy();
    const end = map.routes[0][map.routes[0].length - 1];
    const expected = canvasToWorld(end, {
      canvas: config.maps.canvas,
      worldUnitsPerCanvasUnit: config.visual.scene.worldUnitsPerCanvasUnit,
    });
    expect(core.position.x).toBeCloseTo(expected.x, 5);
    expect(core.position.z).toBeCloseTo(expected.z, 5);
  });
});

describe("T5 · 开放格(每局随机 2-3 个)与五行色符位", () => {
  it.skipIf(!ready)("每个开放格有 slot 节点：metadata/位置/材质五行色与配置一致", async () => {
    const config = await loadConfig();
    const map = await makeMap(config, 11);
    const { scene } = await buildScene(config, map);
    const { canvasToWorld } = await load(mappingPath);
    const range = config.maps.randomization.openSlotCountRange;
    expect(map.openSlots.length).toBeGreaterThanOrEqual(range.min);
    expect(map.openSlots.length).toBeLessThanOrEqual(range.max);
    for (const slot of map.openSlots) {
      const node = scene.getNodeByName(`slot-${slot.slotTypeId}`);
      expect(node, `缺少 slot-${slot.slotTypeId}`).toBeTruthy();
      expect(node.metadata?.slotTypeId).toBe(slot.slotTypeId);
      expect(node.metadata?.element).toBe(slot.element);
      const expected = canvasToWorld(slot.position, {
        canvas: config.maps.canvas,
        worldUnitsPerCanvasUnit: config.visual.scene.worldUnitsPerCanvasUnit,
      });
      expect(node.position.x).toBeCloseTo(expected.x, 5);
      expect(node.position.z).toBeCloseTo(expected.z, 5);
      const expectedHex = String(config.visual.palette.elements[slot.element].primary).toLowerCase();
      expect(
        materialHexes(node),
        `slot-${slot.slotTypeId} 材质色应含五行色 ${expectedHex}`,
      ).toContain(expectedHex);
    }
  });
});

describe("T5 · 视觉参数读 config 而非写死", () => {
  it.skipIf(!ready)("篡改 visual 的火色与缩放,场景材质色与格位坐标随之变化", async () => {
    const base = await loadConfig();
    const patched = structuredClone(base);
    patched.maps.randomization.elementPool = ["fire"];
    patched.visual.palette.elements.fire.primary = "#123456";
    patched.visual.scene.worldUnitsPerCanvasUnit = base.visual.scene.worldUnitsPerCanvasUnit * 2;

    const map = await makeMap(patched, 13);
    const { scene } = await buildScene(patched, map);
    const { canvasToWorld } = await load(mappingPath);
    for (const slot of map.openSlots) {
      const node = scene.getNodeByName(`slot-${slot.slotTypeId}`);
      expect(materialHexes(node)).toContain("#123456");
      const expected = canvasToWorld(slot.position, {
        canvas: patched.maps.canvas,
        worldUnitsPerCanvasUnit: patched.visual.scene.worldUnitsPerCanvasUnit,
      });
      expect(node.position.x).toBeCloseTo(expected.x, 5);
      expect(node.position.z).toBeCloseTo(expected.z, 5);
    }
  });
});
