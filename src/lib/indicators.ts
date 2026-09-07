/**
 * 指标引擎 — 基于 BTC 日线 + 市场情绪的多指标合成分析。
 *
 * 每个指标输出 [-2, +2] 的分数与权重，加权归一后得到 [-100, +100] 的
 * 综合多空分数，并给出看多 / 看空结论与牛熊周期判定。
 */

import type { FearGreedEntry, MarketChart } from "./api"

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
  name: string
  /** 展示用的当前读数 */
  display: string
  /** [-2, +2] 分数，正=看多，负=看空 */
  score: number
  /** 归一化权重 */
  weight: number
  /** 一句话解读 */
  verdict: string
  /** 逻辑类型：趋势跟随 / 动能 / 逆向情绪 */
  kind: "trend" | "momentum" | "sentiment" | "position"
}

export type Regime = "bull" | "bear" | "recovering" | "weakening"

export interface Analysis {
  indicators: IndicatorResult[]
  /** [-100, +100] */
  composite: number
  signal: {
    label: string
    level: "strong-long" | "long" | "neutral" | "short" | "strong-short"
  }
  regime: {
    state: Regime
    label: string
    description: string
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

export function analyze(btcChart: MarketChart, fng: FearGreedEntry[]): Analysis | null {
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
  const ath = Math.max(...prices)
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

  const regimeMeta: Record<Regime, { label: string; description: string }> = {
    bull: { label: "牛市", description: "价格站上 200 日均线，50 日均线在 200 日上方，趋势结构完整" },
    bear: { label: "熊市", description: "价格跌破 200 日均线，50 日均线在 200 日下方，下降趋势确立" },
    recovering: { label: "修复期", description: "价格重新站上 200 日均线，但均线尚未金叉，趋势待确认" },
    weakening: { label: "转弱期", description: "价格跌破 200 日均线，但均线尚未死叉，可能是深度回调" },
  }

  /* 各指标 */
  const trend = scoreTrend(price, ma200)
  const cross = scoreCross(ma50, ma200)
  const indicators: IndicatorResult[] = []

  indicators.push({
    key: "trend",
    name: "价格 vs 200日均线",
    display: `${trend.pct >= 0 ? "+" : ""}${trend.pct.toFixed(1)}%`,
    score: trend.score,
    weight: 22,
    verdict:
      trend.pct >= 0
        ? `价格高于 200 日均线 ${Math.abs(trend.pct).toFixed(1)}%，长期趋势偏多`
        : `价格低于 200 日均线 ${Math.abs(trend.pct).toFixed(1)}%，长期趋势承压`,
    kind: "trend",
  })

  indicators.push({
    key: "cross",
    name: "均线交叉（50/200）",
    display: golden ? "金叉形态" : "死叉形态",
    score: cross.score,
    weight: 14,
    verdict: golden
      ? `50 日均线高于 200 日均线 ${Math.abs(cross.pct).toFixed(1)}%，金叉结构维持`
      : `50 日均线低于 200 日均线 ${Math.abs(cross.pct).toFixed(1)}%，死叉结构维持`,
    kind: "trend",
  })

  if (rsi14 !== null) {
    indicators.push({
      key: "rsi",
      name: "RSI（14日）",
      display: rsi14.toFixed(1),
      score: scoreRsi(rsi14),
      weight: 16,
      verdict:
        rsi14 >= 75 ? "已进入超买区，短期回调风险上升（逆势减分）"
        : rsi14 >= 60 ? "多头动能强劲，处于强势区间"
        : rsi14 >= 50 ? "动能略偏多头"
        : rsi14 >= 45 ? "动能中性"
        : rsi14 >= 25 ? "空头动能占优，走势偏弱"
        : "已进入超卖区，存在超跌反弹机会（逆势加分）",
      kind: "momentum",
    })
  }

  if (m) {
    const s = scoreMacd({ ...m, price })
    indicators.push({
      key: "macd",
      name: "MACD（12/26/9）",
      display: `${m.hist >= 0 ? "+" : ""}${(m.hist / price * 100).toFixed(2)}%`,
      score: s,
      weight: 16,
      verdict:
        m.hist > 0
          ? m.hist > m.prevHist
            ? "MACD 红柱放大，多头动能在增强"
            : "MACD 红柱收敛，多头动能减弱"
          : m.hist < m.prevHist
            ? "MACD 绿柱放大，空头动能在增强"
            : "MACD 绿柱收敛，空头动能减弱",
      kind: "momentum",
    })
  }

  indicators.push({
    key: "momentum",
    name: "价格动量（7/30日）",
    display: `7D ${chg7 >= 0 ? "+" : ""}${chg7.toFixed(1)}% · 30D ${chg30 >= 0 ? "+" : ""}${chg30.toFixed(1)}%`,
    score: scoreMomentum(chg7, chg30),
    weight: 12,
    verdict:
      chg30 >= 0 ? "近一月收涨，中期资金流入迹象" : "近一月收跌，中期资金流出迹象",
    kind: "momentum",
  })

  if (latestFng !== null) {
    indicators.push({
      key: "sentiment",
      name: "恐惧贪婪指数",
      display: `${latestFng} · ${fng[0].classification}`,
      score: scoreSentiment(latestFng),
      weight: 10,
      verdict:
        latestFng <= 25 ? "市场极度恐惧，历史上往往是布局区间（逆向加分）"
        : latestFng <= 45 ? "市场情绪偏恐惧，逆向视角偏积极"
        : latestFng < 55 ? "市场情绪中性"
        : latestFng < 75 ? "市场情绪偏贪婪，需警惕过热"
        : "市场极度贪婪，历史上往往是风险区间（逆向减分）",
      kind: "sentiment",
    })
  }

  indicators.push({
    key: "ath",
    name: "距历史高点位置",
    display: `${drawdown.toFixed(1)}%`,
    score: scoreAthPosition(drawdown),
    weight: 10,
    verdict:
      drawdown >= -5 ? "逼近历史高点，市场处于强势周期"
      : drawdown >= -30 ? "距高点回撤温和，处于高位震荡区"
      : drawdown >= -55 ? "回撤较深，市场信心受损"
      : "深度回撤，处于周期底部区域",
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

  const labels: Record<Analysis["signal"]["level"], string> = {
    "strong-long": "强烈看多",
    long: "看多",
    neutral: "中性观望",
    short: "看空",
    "strong-short": "强烈看空",
  }

  return {
    indicators,
    composite,
    signal: { label: labels[level], level },
    regime: {
      state: regime,
      label: regimeMeta[regime].label,
      description: regimeMeta[regime].description,
      days,
      priceVsMa200: trend.pct,
      ma50VsMa200: cross.pct,
    },
    btc: { price, ma50, ma200, rsi14, drawdownFromAth: drawdown },
  }
}
