import { defineConfig } from "vitest/config";

// 领域层是无渲染(headless)的，单测跑在 node 环境即可。
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
