import { describe, it, expect } from "vitest";

// 冒烟测试：保证验收用例框架本身可运行（即便领域层尚未实现，门禁也有一条绿色基线）。
describe("acceptance harness", () => {
  it("vitest 可运行", () => {
    expect(1 + 1).toBe(2);
  });
});
