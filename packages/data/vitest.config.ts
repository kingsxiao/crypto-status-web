import { defineConfig } from "vitest/config"

// 取数层：node 环境（fetch/WS 用全局原生实现，测试可 vi.stubGlobal）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
  },
})
