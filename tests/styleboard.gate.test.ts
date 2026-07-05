/**
 * T7.0 尺子 · 雾山五行风格草图板(?styleboard=1)—— Claude 维护,Codex 只读。
 *
 * ── 接口契约 ────────────────────────────────────────────────────
 * 1) src/debug/gate.ts 追加:
 *      export function shouldShowStyleboard(search: string, isDev: boolean): boolean
 *    语义:仅 isDev && get("styleboard")==="1" → true(评审页按需打开,不默认出)。
 *
 * 2) src/debug/styleboard.ts:
 *      export const STYLEBOARD_SECTIONS: ReadonlyArray<{ id: "entry" | "hud" | "monsters" | "draw"; title: string }>
 *        (四板块钉死:入场界面/战斗HUD/怪物图鉴/画符交互示意)
 *      export interface MonsterSketchSpec {
 *        monsterId: string;   // 必须与 config.monsters.monsters 的 id 一一对应
 *        name: string;        // 中文名(可读 config)
 *        feature: string;     // 特征形状一句话(墨团剪影语言,中文非空)
 *      }
 *      export const MONSTER_SKETCH_SPECS: readonly MonsterSketchSpec[]
 *      export function mountStyleboard(opts: { config: GameConfig }): void   // DOM 全屏评审页(本尺子不测 DOM)
 *    纪律:paper/ink/朱砂/五行色必须读 config.visual palette(草图与游戏同色源);
 *    布局尺寸/笔触参数可 inline(草图即弃);零新增依赖;禁 Math.random(程序化笔触
 *    抖动用固定种子伪随机或确定性函数,评审图必须可复现)。
 * ──────────────────────────────────────────────────────────────
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const gatePath = resolve(here, "../src/debug/gate.ts");
const boardPath = resolve(here, "../src/debug/styleboard.ts");
const configIndexPath = resolve(here, "../src/config/index.ts");

const ready = existsSync(boardPath);

async function load(path: string): Promise<any> {
  return import(path);
}

describe("T7.0 · styleboard:评审页按需打开", () => {
  it.skipIf(!ready)("语义:仅 dev+styleboard=1 → true", async () => {
    const { shouldShowStyleboard } = await load(gatePath);
    expect(shouldShowStyleboard("?styleboard=1", true)).toBe(true);
    expect(shouldShowStyleboard("?seed=3&styleboard=1&debug=0", true)).toBe(true);
    expect(shouldShowStyleboard("", true)).toBe(false);
    expect(shouldShowStyleboard("?styleboard=0", true)).toBe(false);
    expect(shouldShowStyleboard("?styleboard=1", false)).toBe(false); // 生产永不
  });
});

describe("T7.0 · 草图覆盖:四板块 + 全怪图鉴", () => {
  it.skipIf(!ready)("STYLEBOARD_SECTIONS 恰为 entry/hud/monsters/draw 四板块", async () => {
    const { STYLEBOARD_SECTIONS } = await load(boardPath);
    expect(STYLEBOARD_SECTIONS.map((s: any) => s.id)).toEqual(["entry", "hud", "monsters", "draw"]);
    for (const s of STYLEBOARD_SECTIONS) expect(String(s.title).length).toBeGreaterThan(0);
  });

  it.skipIf(!ready)("MONSTER_SKETCH_SPECS 与 config 八怪 id 集合完全一致,特征文案非空", async () => {
    const { MONSTER_SKETCH_SPECS } = await load(boardPath);
    const { loadGameConfig } = await load(configIndexPath);
    const config = loadGameConfig();

    const specIds = MONSTER_SKETCH_SPECS.map((s: any) => s.monsterId).sort();
    const configIds = config.monsters.monsters.map((m: any) => m.id).sort();
    expect(specIds).toEqual(configIds); // 防漏怪/防写死数量漂移

    for (const spec of MONSTER_SKETCH_SPECS) {
      expect(String(spec.name).trim().length).toBeGreaterThan(0);
      expect(String(spec.feature).trim().length).toBeGreaterThan(0);
    }
  });
});
