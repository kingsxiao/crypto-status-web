/**
 * K 线数据 — 秒级~周线多周期获取，四级容错：
 *   1. Binance 官方公共行情镜像 data-api.binance.vision（免鉴权、CORS 全开，
 *      无地域封锁；支持 1s 起 K 线。限流 6000 权重/分、K 线单次权重 2，
 *      浏览器端轮询远触不到上限）
 *   2. Binance 主站 api.binance.com（部分辖区 451 封锁，仅作二级）
 *   3. OKX REST /api/v5/market/candles（1s 起，300 根）
 *   4. CoinGecko market_chart（粒度粗：≤1 天 5 分钟、≤30 天小时级，渲染为折线）
 */

import { fetchCG } from "./cg"
import { fetchJSON, toNum } from "./http"

export interface Candle {
  time: number // ms
  open: number
  high: number
  low: number
  close: number
  volume: number | null // 计价货币成交量
}

export interface Interval {
  key: string
  binance?: string
  okx?: string
  cgDays?: number
}

// 界面取词走 i18n 的 coin.interval.*，这里只保留数据映射，不再硬编码中文标签
export const INTERVALS: Interval[] = [
  { key: "1s", binance: "1s", okx: "1s", cgDays: 1 },
  { key: "1m", binance: "1m", okx: "1m", cgDays: 1 },
  { key: "5m", binance: "5m", okx: "5m", cgDays: 1 },
  { key: "15m", binance: "15m", okx: "15m", cgDays: 1 },
  { key: "30m", binance: "30m", okx: "30m", cgDays: 1 },
  { key: "1h", binance: "1h", okx: "1H", cgDays: 30 },
  { key: "4h", binance: "4h", okx: "4H", cgDays: 30 },
  { key: "1d", binance: "1d", okx: "1D", cgDays: 365 },
  { key: "1w", binance: "1w", okx: "1W", cgDays: 365 },
]

/** K 线主源主机链：公共行情镜像优先，主站兜底 */
const BINANCE_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"]

export interface CandleResult {
  candles: Candle[]
  source: "binance" | "okx" | "coingecko-line"
  renderMode: "candles" | "line"
}

/* 同参并发去重（复刻 cg.ts 的 once 模式）：图表加载与观点区日线在默认
   1d 周期下参数完全一致，共享同一 in-flight Promise，不对同一 no-store
   接口重复发请求。键必须含 coinId+symbols+intervalKey 全集，缺一会串数据 */
const inflight = new Map<string, Promise<CandleResult>>()

export function fetchCandles(
  coinId: string,
  symbols: { binance: string; okx: string },
  intervalKey: string
): Promise<CandleResult> {
  const key = `${coinId}|${symbols.binance}|${symbols.okx}|${intervalKey}`
  const existing = inflight.get(key)
  if (existing) return existing
  const p = fetchCandlesOnce(coinId, symbols, intervalKey).finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}

async function fetchCandlesOnce(
  coinId: string,
  symbols: { binance: string; okx: string },
  intervalKey: string
): Promise<CandleResult> {
  const itv = INTERVALS.find((i) => i.key === intervalKey) ?? INTERVALS.find((i) => i.key === "1d")!

  /* 1/2) Binance：公共行情镜像 → 主站 */
  if (itv.binance) {
    for (const host of BINANCE_HOSTS) {
      try {
        const raw = await fetchJSON<(string | number)[][]>(
          `${host}/api/v3/klines?symbol=${symbols.binance}&interval=${itv.binance}&limit=500`
        )
        const candles = raw.map((k) => ({
          time: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: toNum(k[7]), // quote asset volume
        }))
        if (candles.length > 0) return { candles, source: "binance", renderMode: "candles" }
      } catch { /* 换下一主机 */ }
    }
  }

  /* 3) OKX */
  if (itv.okx) {
    try {
      const raw = await fetchJSON<{ data: string[][] }>(
        `https://www.okx.com/api/v5/market/candles?instId=${symbols.okx}&bar=${itv.okx}&limit=300`
      )
      // OKX 返回时间倒序；k[6] = volCcy（计价货币计的成交量，与 Binance 口径一致）
      const candles = raw.data
        .map((k) => ({
          time: Number(k[0]),
          open: Number(k[1]),
          high: Number(k[2]),
          low: Number(k[3]),
          close: Number(k[4]),
          volume: toNum(k[6]),
        }))
        .sort((a, b) => a.time - b.time)
      if (candles.length > 0) return { candles, source: "okx", renderMode: "candles" }
    } catch { /* 降级 */ }
  }

  /* 4) CoinGecko 折线兜底（days>90 才显式指定 interval=daily；days=1 时该参数会把数据压成 2 个点） */
  const days = itv.cgDays ?? 365
  const chart = await fetchCG<{ prices: [number, number][] }>(
    `/coins/${coinId}/market_chart?vs_currency=usd&days=${days}${days > 90 ? "&interval=daily" : ""}`
  )
  const candles: Candle[] = chart.prices.map(([t, p], i) => ({
    time: t,
    open: i === 0 ? p : chart.prices[i - 1][1],
    high: Math.max(p, i === 0 ? p : chart.prices[i - 1][1]),
    low: Math.min(p, i === 0 ? p : chart.prices[i - 1][1]),
    close: p,
    volume: null,
  }))
  return { candles, source: "coingecko-line", renderMode: "line" }
}

/**
 * 静默轮询节奏：短周期 K 线陈旧得快，按周期收紧。
 * 1s 周期 5s 一拉 ≈ 24 权重/分，远低于 Binance 6000 权重/分上限。
 */
export function pollIntervalMs(intervalKey: string): number {
  if (intervalKey === "1s") return 5_000
  if (intervalKey === "1m") return 15_000
  if (intervalKey === "5m") return 30_000
  return 60_000
}

/** 实时价合并到最后一根 K 线（仅用 price：24h 高低价与K线窗口口径不同，不参与合并） */
export function mergeLiveTick(candles: Candle[], live: { price: number } | undefined): Candle[] {
  if (!live || candles.length === 0) return candles
  const arr = [...candles]
  const last = { ...arr[arr.length - 1] }
  last.close = live.price
  last.high = Math.max(last.high, live.price)
  last.low = Math.min(last.low, live.price)
  arr[arr.length - 1] = last
  return arr
}
