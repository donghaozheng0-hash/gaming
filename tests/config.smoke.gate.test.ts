// 配置层冒烟门禁 —— Claude 验收尺子，Codex 只读（等同 golden 测试，禁止修改/删除/skip）。
// 钉死 ConfigService 的对外契约：src/config 必须导出 loadGameConfig(): GameConfig，
// 它加载全部 14 张表、校验通过、对真实数据不抛错、并对结果做（深）Object.freeze。
// 与 scripts/check-config.mjs 互补：那把尺子验"数据"，这把尺子验"加载器代码确实存在且行为正确"。
import { describe, expect, it } from "vitest";

const EXPECTED_TABLES = [
  "balance",
  "runes",
  "monsters",
  "levels",
  "waves",
  "maps",
  "fusion",
  "cultivation",
  "economy",
  "progression",
  "visual",
  "infinite",
  "dungeons",
  "fatigue",
] as const;

describe("配置层门禁 · ConfigService 冒烟（Claude 尺子，Codex 只读）", () => {
  it("src/config 导出 loadGameConfig，加载真实配置成功、含 14 张表、且被 Object.freeze", async () => {
    let mod: Record<string, unknown>;
    try {
      mod = (await import("../src/config")) as Record<string, unknown>;
    } catch (e) {
      throw new Error(
        "无法导入 src/config —— ConfigService 入口缺失或编译失败（DoD#3 未交付）。原始错误：" +
          (e as Error).message,
      );
    }

    expect(typeof mod.loadGameConfig, "src/config 必须导出 loadGameConfig()").toBe("function");

    const load = mod.loadGameConfig as () => Record<string, unknown>;
    const cfg = load(); // 对真实合法配置不得抛错

    for (const table of EXPECTED_TABLES) {
      expect(cfg[table], `GameConfig 缺少表 "${table}"`).toBeDefined();
    }

    expect(Object.isFrozen(cfg), "GameConfig 顶层必须被 Object.freeze").toBe(true);
    // 抽查一张表的冻结深度，证明不是只冻了最外层包壳
    expect(
      Object.isFrozen(cfg.balance),
      "balance 子表必须被冻结（要求深冻结，业务不可改配置）",
    ).toBe(true);
  });
});
