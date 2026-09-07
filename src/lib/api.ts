/**
 * 数据层 — 聚合多个公开数据源：
 *  1. CoinGecko  : 行情快照（价格/涨跌幅/市值/7日火花线）、BTC 365 日日线、全球市场概况
 *  2. alternative.me : 加密货币恐惧贪婪指数（情绪）
 *  3. Binance REST : CoinGecko 限流/不可用时的行情与日线兜底
 */

import { fetchJSON } from "@/lib/http"
import { TRADE_SYMBOLS } from "@/lib/realtime"

const CG = "https://api.coingecko.com/api/v3"
const FNG = "https://api.alternative.me/fng/"
const BINANCE = "https://api.binance.com/api/v3"

/* ---------------------------------- 类型 ---------------------------------- */

export interface Coin {
  id: string
  symbol: string
  name: string
  image: string
  current_price: number
  market_cap: number
  market_cap_rank: number
  total_volume: number
  high_24h: number
  low_24h: number
  ath: number
  ath_change_percentage: number | null
  circulating_supply: number
  sparkline_in_7d?: { price: number[] }
  price_change_percentage_1h_in_currency?: number | null
  price_change_percentage_24h_in_currency?: number | null
  price_change_percentage_7d_in_currency?: number | null
  price_change_percentage_30d_in_currency?: number | null
  /** 该条目来自兜底数据源（缺失市值/火花线等字段） */
  fallback?: boolean
}

export interface GlobalData {
  total_market_cap_usd: number
  total_volume_usd: number
  market_cap_change_24h_pct: number
  btc_dominance: number
  eth_dominance: number
  active_cryptocurrencies: number
}

export interface FearGreedEntry {
  value: number // 0-100
  classification: string
  timestamp: number // unix seconds
}

export interface MarketChart {
  prices: [number, number][] // [ts, price]
}

export interface Snapshot {
  coins: Coin[]
  global: GlobalData
  fng: FearGreedEntry[]
  btcChart: MarketChart
  fetchedAt: number
}

/* --------------------------------- 请求 ---------------------------------- */

const COIN_IDS = [
  "bitcoin", "ethereum", "tether", "binancecoin", "solana", "ripple",
  "usd-coin", "cardano", "dogecoin", "avalanche-2", "chainlink", "tron",
]

/** UI 侧的稳定币集合（表格「剔除稳定币」/涨跌广度统计用）；与 crossAsset 的广度口径(5 币)区分 */
export const STABLECOIN_IDS = new Set(["tether", "usd-coin"])

function fetchCoins(): Promise<Coin[]> {
  const url =
    `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc` +
    `&ids=${COIN_IDS.join(",")}&sparkline=true` +
    `&price_change_percentage=1h,24h,7d,30d`
  return fetchJSON<Coin[]>(url)
}

function fetchGlobal(): Promise<GlobalData> {
  return fetchJSON<{
    data: {
      total_market_cap: Record<string, number>
      total_volume: Record<string, number>
      market_cap_change_percentage_24h_usd: number
      market_cap_percentage: Record<string, number>
      active_cryptocurrencies: number
    }
  }>(`${CG}/global`).then((d) => ({
    total_market_cap_usd: d.data.total_market_cap.usd,
    total_volume_usd: d.data.total_volume.usd,
    market_cap_change_24h_pct:
      d.data.market_cap_change_percentage_24h_usd,
    btc_dominance: d.data.market_cap_percentage.btc,
    eth_dominance: d.data.market_cap_percentage.eth,
    active_cryptocurrencies: d.data.active_cryptocurrencies,
  }))
}

function fetchFng(): Promise<FearGreedEntry[]> {
  return fetchJSON<{ data: { value: string; value_classification: string; timestamp: string }[] }>(
    `${FNG}?limit=31`
  ).then((d) =>
    d.data.map((e) => ({
      value: Number(e.value),
      classification: e.value_classification,
      timestamp: Number(e.timestamp),
    }))
  )
}

function fetchBtcChart(): Promise<MarketChart> {
  return fetchJSON<MarketChart>(
    `${CG}/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily`
  )
}

/* --------------------- Binance REST 兜底（CoinGecko 限流时） --------------------- */

/** 兜底元数据：名称、代码与惯常市值排名 */
const FALLBACK_META: Record<string, { name: string; symbol: string; rank: number }> = {
  bitcoin: { name: "Bitcoin", rank: 1, symbol: "btc" },
  ethereum: { name: "Ethereum", rank: 2, symbol: "eth" },
  binancecoin: { name: "BNB", rank: 4, symbol: "bnb" },
  solana: { name: "Solana", rank: 5, symbol: "sol" },
  ripple: { name: "XRP", rank: 6, symbol: "xrp" },
  cardano: { name: "Cardano", rank: 8, symbol: "ada" },
  dogecoin: { name: "Dogecoin", rank: 9, symbol: "doge" },
  "avalanche-2": { name: "Avalanche", rank: 10, symbol: "avax" },
  chainlink: { name: "Chainlink", rank: 11, symbol: "link" },
  tron: { name: "TRON", rank: 12, symbol: "trx" },
}

/** 黑白风格的字母头像（data URI，兜底时替代 CoinGecko 图片） */
function letterAvatar(symbol: string): string {
  const ch = symbol.slice(0, 1).toUpperCase()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="none" stroke="%23888" stroke-width="3"/><text x="32" y="41" font-family="monospace" font-size="26" font-weight="bold" fill="%23888" text-anchor="middle">${ch}</text></svg>`
  return `data:image/svg+xml;utf8,${svg}`
}

interface BinanceTicker {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  highPrice: string
  lowPrice: string
  quoteVolume: string
}

async function fetchCoinsFromBinance(): Promise<Coin[]> {
  const binanceIds = Object.keys(TRADE_SYMBOLS)
  const symbols = binanceIds.map((id) => TRADE_SYMBOLS[id].binance)
  const url = `${BINANCE}/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
  const tickers = await fetchJSON<BinanceTicker[]>(url)

  const bySymbol = new Map(binanceIds.map((id) => [TRADE_SYMBOLS[id].binance, id]))
  return tickers
    .map((t): Coin | null => {
      const id = bySymbol.get(t.symbol)
      if (!id) return null
      const meta = FALLBACK_META[id]
      if (!meta) return null
      return {
        id,
        symbol: meta.symbol,
        name: meta.name,
        image: letterAvatar(meta.name),
        current_price: Number(t.lastPrice),
        market_cap: 0,
        market_cap_rank: meta.rank,
        total_volume: Number(t.quoteVolume),
        high_24h: Number(t.highPrice),
        low_24h: Number(t.lowPrice),
        ath: 0,
        ath_change_percentage: null,
        circulating_supply: 0,
        price_change_percentage_1h_in_currency: null,
        price_change_percentage_24h_in_currency: Number(t.priceChangePercent),
        price_change_percentage_7d_in_currency: null,
        price_change_percentage_30d_in_currency: null,
        fallback: true,
      } satisfies Coin
    })
    .filter((c): c is Coin => c !== null)
    .sort((a, b) => a.market_cap_rank - b.market_cap_rank)
}

async function fetchBtcChartFromBinance(): Promise<MarketChart> {
  // [openTime, open, high, low, close, volume, ...]
  const klines = await fetchJSON<(string | number)[][]>(
    `${BINANCE}/klines?symbol=BTCUSDT&interval=1d&limit=365`
  )
  return { prices: klines.map((k) => [Number(k[0]), Number(k[4])] as [number, number]) }
}

/** 并行拉取全部数据源；单一来源失败自动降级到 Binance 兜底 */
export async function fetchSnapshot(): Promise<Snapshot> {
  const [coinsR, globalR, fngR, chartR] = await Promise.allSettled([
    fetchCoins(),
    fetchGlobal(),
    fetchFng(),
    fetchBtcChart(),
  ])

  // 行情：CoinGecko → Binance 兜底 → 抛错
  let coins: Coin[]
  if (coinsR.status === "fulfilled") {
    coins = coinsR.value.sort((a, b) => a.market_cap_rank - b.market_cap_rank)
  } else {
    coins = await fetchCoinsFromBinance()
  }

  const global: GlobalData =
    globalR.status === "fulfilled"
      ? globalR.value
      : {
          total_market_cap_usd: 0,
          total_volume_usd: 0,
          market_cap_change_24h_pct: 0,
          btc_dominance: 0,
          eth_dominance: 0,
          active_cryptocurrencies: 0,
        }

  const fng: FearGreedEntry[] = fngR.status === "fulfilled" ? fngR.value : []

  // BTC 日线：CoinGecko → Binance 兜底 → 空数据
  let btcChart: MarketChart
  if (chartR.status === "fulfilled") {
    btcChart = chartR.value
  } else {
    try {
      btcChart = await fetchBtcChartFromBinance()
    } catch {
      btcChart = { prices: [] }
    }
  }

  return { coins, global, fng, btcChart, fetchedAt: Date.now() }
}
