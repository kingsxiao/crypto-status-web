import { defineConfig, devices } from "@playwright/test"

/**
 * E2E 冒烟测试 — 走真实构建产物（vite preview），依赖外部行情 API。
 * 数据源有三级容错，断言只锚「有数据渲染出来」而非具体价格值。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:4173",
    // 中文断言依赖 locale（zh 文案按 navigator.language 取词）
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        port: 4173,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
