import { defineConfig } from "vitest/config"

// 共享 react hooks/context 层：默认 node 覆盖纯逻辑，
// 组件/hook 测试经文件首行 @vitest-environment jsdom pragma 切环境
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
})
