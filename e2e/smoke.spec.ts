import { expect, test, type Route } from "@playwright/test"

/**
 * 全站冒烟：首页出价 → 行情表 → 币种K线 → 换算器 → 创建预警。
 * 只断言「数据到位后的稳定结构」，不断言具体行情数值。
 * 注意：本项目用 HashRouter，路由一律带 #/。
 * K 线用例 mock 上游（Binance 美区 451 / CG 云 IP 限流会让 CI 不稳定），
 * 其余用例走真实外部 API。
 */

/** Binance /api/v3/klines 响应格式：[openTime, o, h, l, c, vol, closeTime, quoteVol, ...] */
function binanceKlinesFixture(url: URL): (string | number)[][] {
  const unitMs: Record<string, number> = { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8 }
  const iv = url.searchParams.get("interval") ?? "1d"
  const step = (parseInt(iv, 10) || 1) * (unitMs[iv.replace(/^\d+/, "")] ?? 8.64e7)
  const rows: (string | number)[][] = []
  const t0 = Date.now() - 120 * step
  for (let i = 0; i < 120; i++) {
    const open = 78000 + Math.sin(i / 7) * 1500 + Math.sin(i / 23) * 800
    const close = 78000 + Math.sin((i + 1) / 7) * 1500 + Math.sin((i + 1) / 23) * 800
    const hi = Math.max(open, close) * 1.002
    const lo = Math.min(open, close) * 0.998
    rows.push([
      t0 + i * step,
      open.toFixed(2),
      hi.toFixed(2),
      lo.toFixed(2),
      close.toFixed(2),
      "100",
      t0 + (i + 1) * step - 1,
      "1000",
    ])
  }
  return rows
}

async function fulfillKlines(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(binanceKlinesFixture(new URL(route.request().url()))),
  })
}

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
    // K 线走 fixture：两级 Binance 源在部分辖区 451、CG 兜底对云 IP 限流，
    // mock 后断言与地域/限流解耦；页面其余数据仍走真实 API。
    await page.route("**/api/v3/klines*", fulfillKlines)
    await page.goto("/#/coin/bitcoin")
    // CandleChart 的 svg 带 aria-label
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
