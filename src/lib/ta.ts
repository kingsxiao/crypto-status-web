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

/** MACD 序列：DIF / DEA / HIST */
export function macdSeries(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = emaSeriesFill(values, fast)
  const emaSlow = emaSeriesFill(values, slow)
  const n = values.length
  const dif: Series = new Array(n).fill(null)
  for (let i = 0; i < n; i++) dif[i] = emaFast[i] - emaSlow[i]
  // DEA 为 DIF 的 EMA（自 DIF 首个有效点起算）
  const firstIdx = slow - 1
  const dea: Series = new Array(n).fill(null)
  const hist: Series = new Array(n).fill(null)
  if (n > firstIdx) {
  const k = 2 / (signal + 1)
  let prev: number = dif[firstIdx] as number
  dea[firstIdx] = prev
  for (let i = firstIdx + 1; i < n; i++) {
    prev = (dif[i] as number) * k + prev * (1 - k)
    dea[i] = prev
  }
    for (let i = firstIdx; i < n; i++) hist[i] = (dif[i] as number) - (dea[i] as number)
  }
  return { dif, dea, hist }
}

/** 全量填充的 EMA（内部用：从首个值直接递推，避免 null 参与运算） */
function emaSeriesFill(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
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
