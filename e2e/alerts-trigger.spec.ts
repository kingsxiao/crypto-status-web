import { expect, test, type Route } from "@playwright/test"

/**
 * 稳定币预警触发回归 — 修复「创建成功但永不触发」的核心场景：
 *
 *   存量 tether 预警（tether 不在实时推送集 TRADE_SYMBOLS 内，旧引擎拿不到
 *   价、静默失效）在快照价越过阈值后应转入历史并弹出 toast。
 *
 * 自含 mock（沿用 8e0cc68 的封闭化模式，不改 mocks.ts）：行情快照全部走
 * 确定性 fixture，tether 定价 1.0008，预注入规则的阈值 0.9995 → 快照到达
 * 即应触发。WebSocket 经 routeWebSocket 一并拦死（不连真实服务器），复现
 * WS 全静止的处境（CI 云 IP 被防火 / 用户侧断网于交易所）：tickers 恒空，
 * 触发只能由快照驱动 —— 若 AlertEngine 的 effect 不依赖快照，用例必然超时。
 */

const TETHER_PRICE = 1.0008
/** 预注入规则的阈值：低于快照价 → above 条件（现价 ≥ 目标）立即成立 */
const RULE_TARGET = 0.9995

const DAY = 86_400_000

function coinJson(
  id: string,
  symbol: string,
  name: string,
  rank: number,
  price: number,
): Record<string, unknown> {
  return {
    id,
    symbol,
    name,
    image: "",
    current_price: price,
    market_cap: price * 1e6,
    market_cap_rank: rank,
    total_volume: price * 1e4,
    high_24h: price * 1.005,
    low_24h: price * 0.995,
    ath: price * 1.5,
    ath_change_percentage: -33.3,
    circulating_supply: 1e6,
    sparkline_in_7d: { price: Array.from({ length: 48 }, (_, i) => price * (0.98 + (i / 47) * 0.02)) },
    price_change_percentage_1h_in_currency: 0.01,
    price_change_percentage_24h_in_currency: 0.02,
    price_change_percentage_7d_in_currency: 0.05,
    price_change_percentage_30d_in_currency: 0.1,
  }
}

const COINS_JSON = [
  coinJson("bitcoin", "btc", "Bitcoin", 1, 68000),
  coinJson("ethereum", "eth", "Ethereum", 2, 3500),
  // tether 在快照里、但不在实时推送集 —— 模拟存量脏规则的真实处境
  coinJson("tether", "usdt", "Tether", 3, TETHER_PRICE),
]

const GLOBAL_JSON = {
  data: {
    total_market_cap: { usd: 2.65e12 },
    total_volume: { usd: 9.8e10 },
    market_cap_change_percentage_24h_usd: -3.37,
    market_cap_percentage: { btc: 58.5, eth: 12.1 },
    active_cryptocurrencies: 16842,
  },
}

const BTC_CHART_JSON = {
  prices: Array.from({ length: 365 }, (_, i) => [
    Date.now() - (365 - i) * DAY,
    60000 + i * 20,
  ]),
}

const FNG_JSON = {
  data: Array.from({ length: 31 }, (_, i) => ({
    value: "50",
    value_classification: "Neutral",
    timestamp: String(Math.round((Date.now() - (30 - i) * DAY) / 1000)),
  })),
}

/** Binance REST 兜底（WS 不可达时的轮询）直接 451 —— 贴近 CI 美区云 IP 的真实处境：
 *  两级 WS 与降级轮询全部失败，tickers 恒空，唯快照可驱动触发 */
const BINANCE_BLOCKED = (route: Route) =>
  route.fulfill({ status: 451, contentType: "application/json", body: "{}" })

function json(body: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
}

test.beforeEach(async ({ page }) => {
  // WebSocket 拦死：路由后不连真实服务器（不调用 connectToServer），两条 WS
  // 源都收不到任何推送，应用按 8s 首消息超时逐级降级（Binance→OKX→REST
  // 轮询，轮询已被 mock 成 451）→ tickers 恒空，触发只能靠快照价兜底
  await page.routeWebSocket(/stream\.binance\.com|ws\.okx\.com/, () => {})

  // 网络层封闭：快照各源 + Binance REST 兜底全部替换为确定性 fixture
  await page.route("**/api.coingecko.com/api/v3/coins/markets*", (r) => json(COINS_JSON)(r))
  await page.route("**/api.coingecko.com/api/v3/global*", (r) => json(GLOBAL_JSON)(r))
  await page.route("**/api.coingecko.com/api/v3/coins/*/market_chart*", (r) => json(BTC_CHART_JSON)(r))
  await page.route("**/alternative.me/fng*", (r) => json(FNG_JSON)(r))
  await page.route("**/api.binance.com/api/v3/ticker/24hr*", BINANCE_BLOCKED)
  await page.route("**/api.binance.com/api/v3/klines*", (r) => json([])(r))

  // 预注入存量 tether 预警（不绕过 UI 创建 —— 本用例验证的就是 UI 过滤之前的
  // 历史规则在引擎侧恢复可触发）：localStorage 键见 src/lib/storage.ts
  await page.addInitScript(
    ({ target }) => {
      localStorage.setItem(
        "crypto-status:alerts",
        JSON.stringify([
          {
            id: "tether-e2e",
            coinId: "tether",
            symbol: "USDT",
            kind: "above",
            price: target,
            createdAt: Date.now(),
            status: "active",
            triggeredAt: null,
            triggeredPrice: null,
          },
        ]),
      )
    },
    { target: RULE_TARGET },
  )
})

test.describe("稳定币预警触发（快照价兜底）", () => {
  test("预注入的 tether 预警在快照价越过阈值后转入历史，toast 恰好一次", async ({ page }) => {
    await page.goto("/#/alerts")
    // 等快照到位（下拉出现选项即快照已落库）
    await expect(page.locator("#al-coin option")).not.toHaveCount(0, { timeout: 45_000 })

    // toast 先于其 9s 自动消退断言：标题含 USDT，且恰好一条（规则转 triggered
    // 后后续 tick 不再重复触发）
    const toasts = page.locator('div[role="status"]').filter({ hasText: "USDT" })
    await expect(toasts).toHaveCount(1)

    // 规则转入触发历史（进行中表格消失，历史表出现 USDT 行）
    await expect(page.getByText("暂无进行中的预警")).toBeVisible()
    const historyRow = page.locator("table tbody tr").filter({ hasText: "USDT" })
    await expect(historyRow).toHaveCount(1)
    await expect(historyRow).toContainText(`$${RULE_TARGET}`)
  })

  test("创建下拉只列可实时触发的币：不含 tether，深链脏值不显示空白", async ({ page }) => {
    await page.goto("/#/alerts")
    await expect(page.locator("#al-coin option")).not.toHaveCount(0, { timeout: 45_000 })
    // 快照里有 tether，但下拉不列（可选集 = 实时推送集）
    await expect(page.locator("#al-coin option").filter({ hasText: "Tether" })).toHaveCount(0)

    // 深链直达 ?coin=tether：coinId 不在可选集，受控 select 回退首个可选币
    await page.goto("/#/alerts?coin=tether")
    await expect(page.locator("#al-coin option")).not.toHaveCount(0, { timeout: 45_000 })
    await expect(page.locator("#al-coin")).toHaveValue("bitcoin")
  })
})
