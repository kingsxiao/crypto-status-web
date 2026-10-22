/**
 * 领域类型唯一事实源（先行从取数层抽出，消除 indicators/verdict 对 api
 * 的类型反向依赖环）。取数层（@repo/data/api、crossAsset/fetch）与展示层
 * 一律从此处 import type。
 */

/* ------------------------------ 行情快照域 ------------------------------ */

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

/* ------------------------------ 跨资产域 ------------------------------ */

export interface StablecoinData {
  mcap: number
  chg24h: number
  chg7d: number
  chg30d: number
}

export interface DerivativesData {
  btcFundingPct8h: number
  ethFundingPct8h: number
  btcLsRatio: number
  btcLsTrend: number[]
}

export interface BreadthData {
  /** top50 市值加权 7d 涨跌幅（%） */
  chg7d: number
  /** 剔除 BTC/ETH/稳定币后的山寨市值加权 7d 涨跌幅（%） */
  altChg7d: number
  /** 7d 上涨家数占比 0-1 */
  advancing: number
  total: number
}

export interface CrossAssetData {
  fetchedAt: number
  stablecoin: StablecoinData | null
  derivatives: DerivativesData | null
  breadth: BreadthData | null
}
