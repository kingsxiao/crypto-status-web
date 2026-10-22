/**
 * 序列版技术指标库 — 与 K 线数组等长输出，暖机期前置 null。
 * 用于详情页图表叠加与副图渲染。
 */

export type Series = (number | null)[]

export function smaSeries(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  let sum = 0
  for (let i = 0; i < values.length; i++) {
    sum += values[i]
    if (i >= period) sum -= values[i - period]
    if (i >= period - 1) out[i] = sum / period
  }
  return out
}

export function emaSeries(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null)
  const k = 2 / (period + 1)
  let prev = 0
  let seed = 0
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      seed += values[i]
      continue
    }
    if (i === period - 1) {
      seed += values[i]
      prev = seed / period
      out[i] = prev
      continue
    }
    prev = values[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

/** 布林带 (20, 2)：返回 mid / upper / lower */
export function bollSeries(values: number[], period = 20, mult = 2) {
  const mid = smaSeries(values, period)
  const upper: Series = new Array(values.length).fill(null)
  const lower: Series = new Array(values.length).fill(null)
  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i]
    if (m == null) continue
    let sq = 0
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) ** 2
    const sd = Math.sqrt(sq / period)
    upper[i] = m + mult * sd
    lower[i] = m - mult * sd
  }
  return { mid, upper, lower }
}

/** Wilder RSI 序列 */
export function rsiSeries(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null)
  if (values.length < period + 1) return out
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

/**
 * MACD 序列：DIF / DEA / HIST。
 * DIF = EMA(fast) − EMA(slow)，两条 EMA 都走带暖机的 emaSeries，
 * 因此 DIF/DEA/HIST 统一从 slow−1 起有值 —— 旧实现从第 0 点就
 * 用未收敛的 EMA 递推 DIF，与文件头「暖机期前置 null」的承诺不符。
 */
export function macdSeries(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = emaSeries(values, fast)
  const emaSlow = emaSeries(values, slow)
  const n = values.length
  const dif: Series = new Array(n).fill(null)
  const dea: Series = new Array(n).fill(null)
  const hist: Series = new Array(n).fill(null)
  const k = 2 / (signal + 1)
  let prev: number | null = null
  for (let i = slow - 1; i < n; i++) {
    const f = emaFast[i]
    const s = emaSlow[i]
    if (f == null || s == null) continue
    const d = f - s
    dif[i] = d
    // DEA 为 DIF 的 EMA，自 DIF 首个有效点起算
    prev = prev == null ? d : d * k + prev * (1 - k)
    dea[i] = prev
    hist[i] = d - prev
  }
  return { dif, dea, hist }
}

/** 斐波那契回撤档位（0=趋势终点，1=趋势起点，TradingView 惯例） */
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const

export interface AutoFib {
  /** up=低点在先高点在后（上涨波段回撤）；down=高点在先低点在后 */
  direction: "up" | "down"
  startIndex: number
  endIndex: number
  startPrice: number
  endPrice: number
  levels: { ratio: number; price: number }[]
}

/**
 * 自动斐波那契回撤：在给定K线区间内自动匹配波段起点与终点 ——
 * 起止价取区间摆动高点 high 与摆动低点 low，出现先后决定趋势方向；
 * 档位价格 = 终点价 − 波幅 × ratio（0% 在终点、100% 在起点）。
 * 区间内无有效摆动（数据不足或价格持平）返回 null。
 */
export function autoFibonacci(candles: { high: number; low: number }[]): AutoFib | null {
  let iH = -1
  let iL = -1
  let hi = -Infinity
  let lo = Infinity
  for (let i = 0; i < candles.length; i++) {
    if (candles[i].high > hi) {
      hi = candles[i].high
      iH = i
    }
    if (candles[i].low < lo) {
      lo = candles[i].low
      iL = i
    }
  }
  if (iH < 0 || iL < 0 || iH === iL || !(hi > lo)) return null
  const direction: "up" | "down" = iL < iH ? "up" : "down"
  const startPrice = direction === "up" ? lo : hi
  const endPrice = direction === "up" ? hi : lo
  const startIndex = direction === "up" ? iL : iH
  const endIndex = direction === "up" ? iH : iL
  const levels = FIB_RATIOS.map((ratio) => ({ ratio, price: endPrice - (endPrice - startPrice) * ratio }))
  return { direction, startIndex, endIndex, startPrice, endPrice, levels }
}

/** KDJ（9,3,3）：返回 K / D / J */
export function kdjSeries(highs: number[], lows: number[], closes: number[], period = 9, k = 3, d = 3) {
  const n = closes.length
  const rsv: number[] = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - period + 1)
    let hh = -Infinity
    let ll = Infinity
    for (let j = from; j <= i; j++) {
      hh = Math.max(hh, highs[j])
      ll = Math.min(ll, lows[j])
    }
    rsv[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100
  }
  const K: Series = new Array(n).fill(null)
  const D: Series = new Array(n).fill(null)
  const J: Series = new Array(n).fill(null)
  let pk = 50
  let pd = 50
  for (let i = 0; i < n; i++) {
    pk = ((k - 1) * pk + rsv[i]) / k
    pd = ((d - 1) * pd + pk) / d
    K[i] = pk
    D[i] = pd
    J[i] = 3 * pk - 2 * pd
  }
  return { k: K, d: D, j: J }
}
