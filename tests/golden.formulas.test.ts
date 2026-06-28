import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// 黄金验收测试 —— 由 Claude(架构/监督者)编写，复现《符塔》总设计第五部分算例。
//
// 角色契约：
//   · Codex 在 Task 2 实现 src/game/formulas/** 使本测试全部 PASS。
//   · Codex【不得修改本文件的期望值】(663/995/1326/444/31)。若认为算例有误，必须回报 Claude 评审，不得自行改测试就标"通过"。这是反套娃的关键护栏。
//
// 接口契约(如需变更必须经 Claude 评审，不允许 Codex 单方面改签名)：
//   damage.runeDamage({ base, qualityMul, xiangshengMul, kezhiMul, drawBonus? }): number   // 四舍五入到整数
//   core.coreDamage({ atk, def, relK }): number                                                // 减伤 = def/(def + relK×怪攻)
//
// 公式层落地前测试自动 skip(不阻塞 Sprint 0 门禁)；落地后立即生效，错误即判 FAIL。
// ─────────────────────────────────────────────────────────────────────────────

const here = dirname(fileURLToPath(import.meta.url));
const damagePath = resolve(here, "../src/game/formulas/damage.ts");
const corePath = resolve(here, "../src/game/formulas/core.ts");

// 变量 specifier：避免 tsc 在目标文件尚不存在时静态报错。
async function load(path: string) {
  const spec = path;
  return import(spec);
}

describe("总设计算例 · 焚天符输出链路 (基础300 / 上品×1.7 / 相生×1.3)", () => {
  it.skipIf(!existsSync(damagePath))(
    "相生后 663；克制×1.5→995；圆满×2.0→1326；被克×0.67→444",
    async () => {
      const { runeDamage } = await load(damagePath);
      const fixed = { base: 300, qualityMul: 1.7, xiangshengMul: 1.3 };
      expect(runeDamage({ ...fixed, kezhiMul: 1 })).toBe(663);
      expect(runeDamage({ ...fixed, kezhiMul: 1.5 })).toBe(995);
      expect(runeDamage({ ...fixed, kezhiMul: 2.0 })).toBe(1326);
      expect(runeDamage({ ...fixed, kezhiMul: 0.67 })).toBe(444);
    },
  );
});

describe("总设计算例 · 阵眼承伤 (相对式减伤 relK=0.68，v4 无限模式修法)", () => {
  it.skipIf(!existsSync(corePath))(
    "DEF150 / 怪攻100 → 减伤 150/(150+0.68×100)=68.8% → 阵眼掉 31",
    async () => {
      const { coreDamage } = await load(corePath);
      expect(coreDamage({ atk: 100, def: 150, relK: 0.68 })).toBe(31);
    },
  );
});
