import { defineConfig } from "vitest/config"

// core 为纯逻辑包：node 环境，.tsx 无（组件测试留在 apps/web 与 @repo/react）
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
