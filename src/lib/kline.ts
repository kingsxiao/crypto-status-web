/**
 * K 线数据 — 多周期获取，三级容错：
 *   1. Binance REST /api/v3/klines（1h/4h/1d/1w，500 根）
 *   2. OKX REST /api/v5/market/candles（300 根）
 *   3. CoinGecko market_chart（仅日线，渲染为折线模式）
 */

import { fetchJSON, toNum } from "@/lib/http"

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
  label: string
  binance?: string
  okx?: string
  cgDays?: number
}

export const INTERVALS: Interval[] = [
  { key: "1h", label: "1时", binance: "1h", okx: "1H" },
  { key: "4h", label: "4时", binance: "4h", okx: "4H" },
  { key: "1d", label: "日线", binance: "1d", okx: "1D" },
  { key: "1w", label: "周线", binance: "1w", okx: "1W" },
]

export interface CandleResult {
  candles: Candle[]
  source: "binance" | "okx" | "coingecko-line"
  renderMode: "candles" | "line"
}

export async function fetchCandles(
  coinId: string,
  symbols: { binance: string; okx: string },
  intervalKey: string
): Promise<CandleResult> {
  const itv = INTERVALS.find((i) => i.key === intervalKey) ?? INTERVALS[2]

  /* 1) Binance */
  if (itv.binance) {
    try {
      const raw = await fetchJSON<(string | number)[][]>(
        `https://api.binance.com/api/v3/klines?symbol=${symbols.binance}&interval=${itv.binance}&limit=500`
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
    } catch { /* 降级 */ }
  }

  /* 2) OKX */
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

  /* 3) CoinGecko 折线兜底（仅日线粒度） */
  const days = itv.key === "1w" ? 365 : itv.key === "1d" ? 365 : 30
  const chart = await fetchJSON<{ prices: [number, number][] }>(
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=daily`
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
