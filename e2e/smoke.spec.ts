import { expect, test } from "@playwright/test"

import { installApiMocks } from "./mocks"

/**
 * 全站冒烟：首页出价 → 行情表 → 币种K线 → 换算器 → 创建预警。
 * 只断言「数据到位后的稳定结构」，不断言具体行情数值。
 * 注意：本项目用 HashRouter，路由一律带 #/。
 *
 * 全部外部行情 API 在网络层被替换为确定性 fixture（见 mocks.ts）——
 * CI（美区云 IP）上 Binance 451 / CG 云 IP 限流会让真实依赖随机失败。
 * WebSocket 实时流保持真实连接：连不上时应用本就走快照价兜底，断言不依赖它。
 */

test.beforeEach(async ({ page }) => {
  await installApiMocks(page)
})

test.describe("crypto-status-web 冒烟", () => {
  test("首页加载出实时价格与导航", async ({ page }) => {
    await page.goto("/#/")
    // 实时/快照价格任一到位即算通过（Binance WS 或 CG 快照兜底）
    await expect(page.locator("main")).toContainText(/\$\d/, { timeout: 45_000 })
    // 顶部导航可跳转行情页
    await page.click('a[href="#/markets"]')
    await expect(page).toHaveURL(/#\/markets/)
  })

  test("行情页：表格渲染 ≥5 行，搜索可过滤", async ({ page }) => {
    await page.goto("/#/markets")
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 45_000 })
    const rows = page.locator("table tbody tr")
    expect(await rows.count()).toBeGreaterThanOrEqual(5)

    // 搜索 BTC 只剩 Bitcoin 一行
    await page.getByPlaceholder("搜索币种 / 代码").fill("BTC")
    await expect(page.locator("table tbody tr")).toHaveCount(1)
    // 点行进入详情
    await page.locator("table tbody tr").first().click()
    await expect(page).toHaveURL(/#\/coin\/bitcoin/)
  })

  test("币种详情：K线图渲染并带读数条", async ({ page }) => {
    await page.goto("/#/coin/bitcoin")
    // CandleChart 的 svg 带 aria-label；K 线来自 mocks 的确定性 fixture
    await expect(page.locator("svg[aria-label]").first()).toBeVisible({ timeout: 45_000 })
    // 读数条含开高低收标签（zh 文案）
    await expect(page.locator("main")).toContainText("开")
    await expect(page.locator("main")).toContainText("收")
  })

  test("换算器：输入数量折算 USD", async ({ page }) => {
    await page.goto("/#/converter")
    await page.locator("#cv-crypto-amount").fill("1")
    // 等任一价格到位后出现 ≈ 折算结果（含 $ 或数字）
    await expect(page.locator("main")).toContainText(/[$≈]\s*\d|≈/, { timeout: 45_000 })
  })

  test("预警页：创建预警后出现在进行中列表", async ({ page }) => {
    await page.goto("/#/alerts")
    // 等币种下拉有快照数据
    await expect(page.locator("#al-coin option")).not.toHaveCount(0, { timeout: 45_000 })
    // 目标价给一个远离现价的值，避免立即触发转历史
    await page.locator("#al-price").fill("999999999")
    await page.click('button:has-text("创建预警")')
    // 进行中表格出现 BTC 行
    await expect(page.locator("table tbody tr").filter({ hasText: "BTC" }).first()).toBeVisible()
  })
})
