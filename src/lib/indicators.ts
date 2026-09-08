/**
 * 指标引擎 — 基于 BTC 日线 + 市场情绪的多指标合成分析。
 *
 * 每个指标输出 [-2, +2] 的分数与权重，加权归一后得到 [-100, +100] 的
 * 综合多空分数，并给出看多 / 看空结论与牛熊周期判定。
 */

import type { LMsg, MessageKey } from "@/i18n"
import type { FearGreedEntry, MarketChart } from "./api"

/* ------------------------------ 文案 key 映射 ------------------------------ */

/** 牛熊周期 → 文案 key（label 由渲染层翻译，存储/计算仅携带中性枚举） */
export const REGIME_KEY: Record<Regime, { label: MessageKey; desc: MessageKey }> = {
  bull: { label: "regime.bull", desc: "regime.bull.desc" },
  bear: { label: "regime.bear", desc: "regime.bear.desc" },
  recovering: { label: "regime.recovering", desc: "regime.recovering.desc" },
  weakening: { label: "regime.weakening", desc: "regime.weakening.desc" },
}

/* ------------------------------ 基础数学函数 ------------------------------ */

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1)
  const out: number[] = []
  let prev = values[0]
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k)
    out.push(prev)
  }
  return out
}

/** 经典 Wilder RSI */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null
  let gain = 0
  let loss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) gain += d
    else loss -= d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** MACD(12,26,9)：返回最近一期的 dif / dea / histogram */
export function macd(values: number[]) {
  if (values.length < 35) return null
  const ema12 = emaSeries(values, 12)
  const ema26 = emaSeries(values, 26)
  const dif = ema12.map((v, i) => v - ema26[i])
  const dea = emaSeries(dif, 9)
  const n = values.length - 1
  return {
    dif: dif[n],
    dea: dea[n],
    hist: dif[n] - dea[n],
    prevHist: dif[n - 1] - dea[n - 1],
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/* ------------------------------- 指标结构 ------------------------------- */

export interface IndicatorResult {
  key: string
  /** 指标名（可翻译消息，渲染层经 tm() 还原） */
  name: LMsg
  /** 展示用读数：纯数字串直接展示，含词汇时为可翻译消息 */
  display: string | LMsg
  /** [-2, +2] 分数，正=看多，负=看空 */
  score: number
  /** 归一化权重 */
  weight: number
  /** 一句话解读（可翻译消息） */
  verdict: LMsg
  /** 逻辑类型：趋势跟随 / 动能 / 逆向情绪 */
  kind: "trend" | "momentum" | "sentiment" | "position"
}

export type Regime = "bull" | "bear" | "recovering" | "weakening"

export interface Analysis {
  indicators: IndicatorResult[]
  /** [-100, +100] */
  composite: number
  signal: {
    level: "strong-long" | "long" | "neutral" | "short" | "strong-short"
  }
  regime: {
    state: Regime
    days: number
    priceVsMa200: number
    ma50VsMa200: number
  }
  btc: {
    price: number
    ma50: number | null
    ma200: number | null
    rsi14: number | null
    drawdownFromAth: number
  }
}

/* ------------------------------ 单指标评分 ------------------------------ */

export function scoreTrend(price: number, ma200: number) {
  const dev = (price - ma200) / ma200
  const score = clamp(dev / 0.18, -2, 2)
  const pct = dev * 100
  return { score, pct }
}

export function scoreCross(ma50: number, ma200: number) {
  const dev = (ma50 - ma200) / ma200
  return { score: clamp(dev / 0.1, -2, 2), pct: dev * 100 }
}

export function scoreRsi(v: number) {
  // 45–75 视为多头动能区；>75 超买减分（逆势），<25 超卖加分（逆势）
  let score: number
  if (v >= 75) score = -1
  else if (v >= 60) score = 1.5
  else if (v >= 50) score = 1
  else if (v >= 45) score = 0
  else if (v >= 35) score = -0.5
  else if (v >= 25) score = -1.5
  else score = 0.5
  return score
}

export function scoreMacd(m: { hist: number; prevHist: number; dif: number; price: number }) {
  const { hist, prevHist, dif } = m
  const expanding = Math.abs(hist) > Math.abs(prevHist)
  let score: number
  if (hist > 0) score = expanding ? 2 : 1
  else score = expanding ? -2 : -1
  // DIF 深度低于零轴时上方修复意义有限，略降权表述
  void dif
  return score
}

export function scoreMomentum(chg7: number, chg30: number) {
  const blended = chg7 * 0.4 + chg30 * 0.6
  return clamp(blended / 15, -2, 2)
}

export function scoreSentiment(fng: number) {
  // 逆向指标：极度恐惧是机会，极度贪婪是风险
  if (fng <= 20) return 2
  if (fng <= 40) return 1
  if (fng < 60) return 0
  if (fng < 80) return -1
  return -2
}

export function scoreAthPosition(drawdownPct: number) {
  // 距历史高点越近，市场越强势（趋势跟随视角）
  if (drawdownPct >= -5) return 1.5
  if (drawdownPct >= -20) return 1
  if (drawdownPct >= -40) return -0.5
  if (drawdownPct >= -60) return -1.5
  return -2
}

/* -------------------------------- 主分析 -------------------------------- */

/**
 * 主分析。`athFromSnapshot` 为 CoinGecko 的全史 ATH（快照里 BTC 条目）：
 * 标签承诺的是「距历史高点」，仅用一年窗口最大值在 ATH 早于窗口时
 * （周期顶后的漫长熊市）会显著低估回撤；字段缺失（Binance 兜底路径为 0）
 * 时自动退回窗口高点。
 */
export function analyze(btcChart: MarketChart, fng: FearGreedEntry[], athFromSnapshot?: number): Analysis | null {
  const prices = btcChart.prices.map(([, p]) => p)
  if (prices.length < 210) return null

  const price = prices[prices.length - 1]
  const ma50 = sma(prices, 50)
  const ma200 = sma(prices, 200)
  if (!ma50 || !ma200) return null

  const rsi14 = rsi(prices, 14)
  const m = macd(prices)

  const chg7 = ((price - prices[prices.length - 8]) / prices[prices.length - 8]) * 100
  const chg30 = ((price - prices[prices.length - 31]) / prices[prices.length - 31]) * 100

  const latestFng = fng[0]?.value ?? null
  const windowMax = Math.max(...prices)
  const ath = athFromSnapshot && athFromSnapshot > 0 ? Math.max(athFromSnapshot, windowMax) : windowMax
  const drawdown = ((price - ath) / ath) * 100

  /* 牛熊周期判定（趋势结构） */
  const above200 = price > ma200
  const golden = ma50 > ma200
  let regime: Regime
  if (above200 && golden) regime = "bull"
  else if (!above200 && !golden) regime = "bear"
  else if (above200 && !golden) regime = "recovering"
  else regime = "weakening"

  // 当前状态持续天数：从最后一个交易日向前找最近一次状态翻转
  const stateAt = (i: number) => {
    if (i < 205) return regime
    const p = prices[i]
    const m50 = prices.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50
    const m200 = prices.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200
    const a = p > m200
    const g = m50 > m200
    if (a && g) return "bull" as Regime
    if (!a && !g) return "bear" as Regime
    if (a && !g) return "recovering" as Regime
    return "weakening" as Regime
  }
  let days = 1
  for (let i = prices.length - 1; i >= 205 && stateAt(i) === regime; i--) days++

  /* 各指标 */
  const trend = scoreTrend(price, ma200)
  const cross = scoreCross(ma50, ma200)
  const indicators: IndicatorResult[] = []

  indicators.push({
    key: "trend",
    name: { key: "ind.trend.name" },
    display: `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`,
    score: trend.score,
    weight: 22,
    verdict:
      trend.pct >= 0
        ? { key: "ind.trend.vAbove", params: { pct: Math.abs(trend.pct).toFixed(1) } }
        : { key: "ind.trend.vBelow", params: { pct: Math.abs(trend.pct).toFixed(1) } },
    kind: "trend",
  })

  indicators.push({
    key: "cross",
    name: { key: "ind.cross.name" },
    display: { key: golden ? "ind.cross.golden" : "ind.cross.dead" },
    score: cross.score,
    weight: 14,
    verdict: golden
      ? { key: "ind.cross.vGolden", params: { pct: Math.abs(cross.pct).toFixed(1) } }
      : { key: "ind.cross.vDead", params: { pct: Math.abs(cross.pct).toFixed(1) } },
    kind: "trend",
  })

  if (rsi14 !== null) {
    indicators.push({
      key: "rsi",
      name: { key: "ind.rsi.name" },
      display: rsi14.toFixed(1),
      score: scoreRsi(rsi14),
      weight: 16,
      verdict: {
        key:
          rsi14 >= 75 ? "ind.rsi.v1"
          : rsi14 >= 60 ? "ind.rsi.v2"
          : rsi14 >= 50 ? "ind.rsi.v3"
          : rsi14 >= 45 ? "ind.rsi.v4"
          : rsi14 >= 25 ? "ind.rsi.v5"
          : "ind.rsi.v6",
      },
      kind: "momentum",
    })
  }

  if (m) {
    const s = scoreMacd({ ...m, price })
    indicators.push({
      key: "macd",
      name: { key: "ind.macd.name" },
      display: `${m.hist >= 0 ? "+" : ""}${(m.hist / price * 100).toFixed(2)}%`,
      score: s,
      weight: 16,
      verdict: {
        key:
          m.hist > 0
            ? m.hist > m.prevHist ? "ind.macd.vExpandUp" : "ind.macd.vFadeUp"
            : m.hist < m.prevHist ? "ind.macd.vExpandDown" : "ind.macd.vFadeDown",
      },
      kind: "momentum",
    })
  }

  indicators.push({
    key: "momentum",
    name: { key: "ind.momentum.name" },
    display: `7D ${chg7 >= 0 ? "+" : ""}${chg7.toFixed(1)}% · 30D ${chg30 >= 0 ? "+" : ""}${chg30.toFixed(1)}%`,
    score: scoreMomentum(chg7, chg30),
    weight: 12,
    verdict: { key: chg30 >= 0 ? "ind.momentum.vUp" : "ind.momentum.vDown" },
    kind: "momentum",
  })

  if (latestFng !== null) {
    indicators.push({
      key: "sentiment",
      name: { key: "ind.sentiment.name" },
      display: { key: "ind.sentiment.display", params: { value: latestFng, class: fng[0].classification } },
      score: scoreSentiment(latestFng),
      weight: 10,
      verdict: {
        key:
          latestFng <= 25 ? "ind.sentiment.v1"
          : latestFng <= 45 ? "ind.sentiment.v2"
          : latestFng < 55 ? "ind.sentiment.v3"
          : latestFng < 75 ? "ind.sentiment.v4"
          : "ind.sentiment.v5",
      },
      kind: "sentiment",
    })
  }

  indicators.push({
    key: "ath",
    name: { key: "ind.ath.name" },
    display: `${drawdown.toFixed(1)}%`,
    score: scoreAthPosition(drawdown),
    weight: 10,
    verdict: {
      key:
        drawdown >= -5 ? "ind.ath.v1"
        : drawdown >= -30 ? "ind.ath.v2"
        : drawdown >= -55 ? "ind.ath.v3"
        : "ind.ath.v4",
    },
    kind: "position",
  })

  /* 加权合成 */
  const wSum = indicators.reduce((a, i) => a + i.weight, 0)
  const raw = indicators.reduce((a, i) => a + i.score * i.weight, 0)
  const composite = Math.round((raw / (wSum * 2)) * 100)

  const level: Analysis["signal"]["level"] =
    composite >= 40 ? "strong-long"
    : composite >= 15 ? "long"
    : composite > -15 ? "neutral"
    : composite > -40 ? "short"
    : "strong-short"

  return {
    indicators,
    composite,
    signal: { level },
    regime: {
      state: regime,
      days,
      priceVsMa200: trend.pct,
      ma50VsMa200: cross.pct,
    },
    btc: { price, ma50, ma200, rsi14, drawdownFromAth: drawdown },
  }
}
