import type { Page, Route } from "@playwright/test"

/**
 * E2E 冒烟的网络层封闭（hermetic）。
 *
 * 动机：GitHub Actions runner 是美区云 IP —— Binance 两级源 451 地域封锁，
 * CoinGecko / alternative.me 对云 IP 有按分钟的限流，套件跑到中途就会开始
 * 429，任何依赖真实外部 API 的断言在 CI 里都会随机摇摆（实测：同一用例
 * 相邻两次 CI 一过一挂）。CI 门禁的职责是拦住「应用自身」的回归，所以这里
 * 把快照与 K 线的全部上游替换为确定性 fixture。
 *
 * 真实数据源的联通性、降级链与字段契约由单元测试（realtime/crossAsset/
 * kline 解析）+ 本地手工冒烟覆盖，不在这里重复。
 */

const DAY = 86_400_000
const NOW = Date.now()

/** 确定性价格走动：无随机，任何环境生成同一序列 */
function walk(n: number, from: number, to: number, wobble = 0.05): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1)
    const base = from + (to - from) * t
    out.push(base * (1 + Math.sin(i / 5) * wobble * 0.3 + Math.sin(i / 13) * wobble))
  }
  return out
}

function svgAvatar(letter: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#171717"/><text x="16" y="21" font-size="14" fill="#fff" text-anchor="middle" font-family="monospace">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/* ------------------------- CoinGecko /coins/markets ------------------------- */

interface CoinSeed {
  id: string
  symbol: string
  name: string
  rank: number
  price: number
  mcap: number
  chg24: number
}

const COIN_SEEDS: CoinSeed[] = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", rank: 1, price: 78386.74, mcap: 1.55e12, chg24: -0.25 },
  { id: "ethereum", symbol: "eth", name: "Ethereum", rank: 2, price: 3120.5, mcap: 3.75e11, chg24: -1.2 },
  { id: "tether", symbol: "usdt", name: "Tether", rank: 3, price: 1.0, mcap: 1.4e11, chg24: 0.02 },
  { id: "binancecoin", symbol: "bnb", name: "BNB", rank: 4, price: 745.2, mcap: 1.07e11, chg24: -0.8 },
  { id: "solana", symbol: "sol", name: "Solana", rank: 5, price: 178.4, mcap: 8.6e10, chg24: 2.4 },
  { id: "ripple", symbol: "xrp", name: "XRP", rank: 6, price: 2.35, mcap: 1.35e11, chg24: 3.1 },
  { id: "usd-coin", symbol: "usdc", name: "USDC", rank: 7, price: 1.0, mcap: 6.2e10, chg24: 0.01 },
  { id: "cardano", symbol: "ada", name: "Cardano", rank: 8, price: 0.82, mcap: 2.9e10, chg24: 4.2 },
  { id: "dogecoin", symbol: "doge", name: "Dogecoin", rank: 9, price: 0.24, mcap: 3.6e10, chg24: 5.5 },
  { id: "avalanche-2", symbol: "avax", name: "Avalanche", rank: 10, price: 32.1, mcap: 1.3e10, chg24: 1.8 },
  { id: "chainlink", symbol: "link", name: "Chainlink", rank: 11, price: 21.4, mcap: 1.4e10, chg24: -0.6 },
  { id: "tron", symbol: "trx", name: "TRON", rank: 12, price: 0.28, mcap: 2.4e10, chg24: 0.9 },
]

const COINS_JSON = COIN_SEEDS.map((c) => ({
  id: c.id,
  symbol: c.symbol,
  name: c.name,
  image: svgAvatar(c.symbol.slice(0, 1).toUpperCase()),
  current_price: c.price,
  market_cap: c.mcap,
  market_cap_rank: c.rank,
  total_volume: c.mcap * 0.03,
  high_24h: c.price * 1.012,
  low_24h: c.price * 0.988,
  ath: c.price * 1.42,
  ath_change_percentage: -29.6,
  circulating_supply: c.mcap / c.price,
  sparkline_in_7d: { price: walk(48, c.price * 0.9, c.price) },
  price_change_percentage_1h_in_currency: c.chg24 / 10,
  price_change_percentage_24h_in_currency: c.chg24,
  price_change_percentage_7d_in_currency: c.chg24 * 2.2,
  price_change_percentage_30d_in_currency: c.chg24 * 3.5,
}))

/* ------------------------------ CG /global ------------------------------ */

const GLOBAL_JSON = {
  data: {
    total_market_cap: { usd: 2.65e12 },
    total_volume: { usd: 9.8e10 },
    market_cap_change_percentage_24h_usd: -3.37,
    market_cap_percentage: { btc: 58.5, eth: 12.1 },
    active_cryptocurrencies: 16842,
  },
}

/* ------------------------ CG /coins/:id/market_chart ------------------------ */

const BTC_PRICES_JSON = {
  prices: walk(365, 30000, 78386, 0.08).map((p, i) => [
    Math.round(NOW - (365 - i) * DAY),
    Number(p.toFixed(2)),
  ]),
}

/* -------------------------- alternative.me /fng -------------------------- */

const FNG_JSON = {
  // alternative.me 返回最新在前：data[0] = 今天（69 → Greed），data[30] = 30 天前。
  // wobble 是乘法系数（0.05 = ±5%）：此前误传 6（±600%）会把指数推到
  // 341/100 的越界值，情绪页标尺直接溢出
  data: walk(31, 69, 52, 0.06).map((v, i) => ({
    value: String(Math.round(v)),
    value_classification: v > 60 ? "Greed" : v > 45 ? "Neutral" : "Fear",
    timestamp: String(Math.round((NOW - i * DAY) / 1000)),
  })),
}

/* ------------------- Binance /api/v3/klines（含 vision 镜像） ------------------- */

/** Binance kline 行：[openTime, o, h, l, c, vol, closeTime, quoteVol, ...] */
function binanceKlines(url: URL): (string | number)[][] {
  const unitMs: Record<string, number> = { s: 1e3, m: 6e4, h: 3.6e6, d: DAY, w: 7 * DAY }
  const iv = url.searchParams.get("interval") ?? "1d"
  const step = (parseInt(iv, 10) || 1) * (unitMs[iv.replace(/^\d+/, "")] ?? DAY)
  const closes = walk(120, 74000, 78386, 0.015)
  const t0 = NOW - 120 * step
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1]
    return [
      t0 + i * step,
      open.toFixed(2),
      (Math.max(open, close) * 1.002).toFixed(2),
      (Math.min(open, close) * 0.998).toFixed(2),
      close.toFixed(2),
      "100",
      t0 + (i + 1) * step - 1,
      "1000",
    ]
  })
}

/* -------- 跨资产判断页三源（Defillama / Binance fapi / CG top50 广度） -------- */

/** Defillama 稳定币全史（60 点，fetch 侧要求 ≥9 点且 ago(30) 可回看） */
const STABLECOIN_JSON = walk(60, 1.18e11, 1.32e11).map((v, i) => ({
  date: Math.round((NOW - (59 - i) * DAY) / 1000),
  totalCirculatingUSD: { peggedUSD: Math.round(v) },
}))

/** 资金费率（8h）：0.012% 的中性偏多水平 */
const FUNDING_JSON = { lastFundingRate: "0.00012" }

/** 多空账户比 8 日序列：1.2 → 1.6 缓步转多 */
const LS_RATIO_JSON = walk(8, 1.2, 1.6).map((v) => ({ longShortRatio: v.toFixed(3) }))

/** CG top50 广度行：fetch 侧要求 ≥20 行有效（market_cap + 7d 涨跌），
 *  sin 摆动给出确定性的涨跌混合（不与快照 COINS_JSON 共用 —— 那份只有 12 行） */
const BREADTH_JSON = Array.from({ length: 50 }, (_, i) => ({
  id: `mock-rank-${i + 1}`,
  market_cap: Math.round(5e11 / (i + 1)),
  price_change_percentage_7d_in_currency: Number((Math.sin(i / 4) * 8).toFixed(2)),
}))

/* --------------------------------- 挂载 --------------------------------- */

function json(body: unknown) {
  return (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
}

export async function installApiMocks(page: Page): Promise<void> {
  await page.route("**/api/v3/coins/markets*", (route) => {
    // 跨资产广度请求带 per_page=50（需 ≥20 行有效），与快照的 ids= 请求分流
    const perPage = new URL(route.request().url()).searchParams.get("per_page")
    return (perPage === "50" ? json(BREADTH_JSON) : json(COINS_JSON))(route)
  })
  await page.route("**/api/v3/global*", json(GLOBAL_JSON))
  await page.route("**/api/v3/coins/*/market_chart*", json(BTC_PRICES_JSON))
  await page.route("**/api/v3/klines*", (route) =>
    json(binanceKlines(new URL(route.request().url())))(route)
  )
  // 注意 fng 路由必须写全 origin 且以 /** 结尾：实际 URL 是 /fng/（带尾斜杠
  // + query），Playwright glob 里段内 **/单 * 都不跨 /，简写 fng* 会静默放行
  // 真实请求（情绪页断言因此在真实 API 上摇摆，实测验证仅此 pattern 拦得住）
  await page.route("https://api.alternative.me/fng/**", json(FNG_JSON))
  // 跨资产判断页三源（fapi 与 Binance 现货一样有云 IP 地域封锁，必须 mock）
  await page.route("**/stablecoins.llama.fi/stablecoincharts/all*", json(STABLECOIN_JSON))
  await page.route("**/fapi/v1/premiumIndex*", json(FUNDING_JSON))
  await page.route("**/futures/data/globalLongShortAccountRatio*", json(LS_RATIO_JSON))
}
