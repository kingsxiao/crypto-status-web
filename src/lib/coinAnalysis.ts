/**
 * 通用币种多指标观点引擎 — 仅依赖日线收盘/成交量序列，任何币种可算。
 *
 * 八项指标各自给出 [-2, +2] 分与一句话观点，加权归一为 [-100, +100] 综合分，
 * 输出 看多/偏多/中性/偏空/看空 结论与多空计数。
 * 与 indicators.ts 的 analyze() 共用评分函数，保证口径一致。
 */

import {
  clamp,
  macd,
  rsi,
  sma,
  scoreAthPosition,
  scoreCross,
  scoreMacd,
  scoreMomentum,
  scoreRsi,
  scoreTrend,
  type IndicatorResult,
} from "./indicators"

export type VerdictLevel = "strong-long" | "long" | "neutral" | "short" | "strong-short"

export interface CoinAnalysis {
  indicators: IndicatorResult[]
  /** [-100, +100] */
  composite: number
  verdict: { label: string; level: VerdictLevel }
  counts: { bull: number; bear: number; neutral: number }
  /** 数据不足等原因导致的部分指标缺失说明，null = 完整 */
  note: string | null
}

const VERDICT_LABELS: Record<VerdictLevel, string> = {
  "strong-long": "强烈看多",
  long: "看多",
  neutral: "中性观望",
  short: "看空",
  "strong-short": "强烈看空",
}

export function verdictOfComposite(composite: number): CoinAnalysis["verdict"] {
  const level: VerdictLevel =
    composite >= 40 ? "strong-long"
    : composite >= 15 ? "long"
    : composite > -15 ? "neutral"
    : composite > -40 ? "short"
    : "strong-short"
  return { label: VERDICT_LABELS[level], level }
}

/** 单指标得分 → 判定文案 */
export function verdictOfScore(score: number): { text: string; tone: "bull" | "bear" | "neutral" } {
  if (score >= 1.2) return { text: "看多", tone: "bull" }
  if (score >= 0.25) return { text: "偏多", tone: "bull" }
  if (score > -0.25) return { text: "中性", tone: "neutral" }
  if (score > -1.2) return { text: "偏空", tone: "bear" }
  return { text: "看空", tone: "bear" }
}

/** BOLL(20,2) 通道内位置 → 分数：上轨外超买逆势减分，下轨外超卖逆势加分 */
function scoreBollPosition(price: number, mid: number, band: number) {
  const pos = band > 0 ? clamp((price - mid) / band, -1.6, 1.6) : 0
  let score: number
  if (pos > 1.0) score = -0.5 // 超买（逆势）
  else if (pos > 0.35) score = 1
  else if (pos > -0.35) score = 0
  else if (pos > -1.0) score = -1
  else score = 0.5 // 超卖（逆势）
  return { score, pos }
}

/** 量价配合：近5日均量相对20日均量 × 近5日涨跌方向 */
function scoreVolumePrice(chg5: number, volRatio: number) {
  const rising = chg5 >= 0
  if (volRatio >= 1.15) return { score: rising ? 1.5 : -1.5, tag: rising ? "放量上涨" : "放量下跌" }
  if (volRatio <= 0.85) return { score: rising ? 0.5 : -0.5, tag: rising ? "缩量上涨" : "缩量下跌" }
  return { score: rising ? 1 : -1, tag: rising ? "温和放量上涨" : "温和缩量下跌" }
}

/**
 * @param closes   日线收盘价序列（升序，末尾为最新；可传实时价替换末位）
 * @param volumes  日线成交量序列（与 closes 等长；允许 null 元素或整体为 null）
 */
export function analyzeCoin(
  closes: number[],
  volumes: (number | null)[] | null
): CoinAnalysis | null {
  const prices = closes.filter((v) => Number.isFinite(v))
  if (prices.length < 60) return null

  const price = prices[prices.length - 1]
  const ma50 = sma(prices, 50)
  const ma200 = sma(prices, 200)
  const rsi14 = rsi(prices, 14)
  const m = macd(prices)

  const chg7 = ((price - prices[prices.length - 8]) / prices[prices.length - 8]) * 100
  const chg30 = ((price - prices[prices.length - 31]) / prices[prices.length - 31]) * 100

  // BOLL(20,2)
  const bollMid = sma(prices, 20)
  const bollUpper: number | null = (() => {
    if (!bollMid || prices.length < 20) return null
    const slice = prices.slice(-20)
    const variance = slice.reduce((a, v) => a + (v - bollMid) ** 2, 0) / 20
    return bollMid + 2 * Math.sqrt(variance)
  })()

  // 量能（仅当成交量序列有效）
  const validVols = volumes?.filter((v): v is number => v != null && v > 0) ?? []
  const hasVolume = validVols.length >= 25 && volumes != null && volumes.length === prices.length
  let volInd: IndicatorResult | null = null
  if (hasVolume) {
    const vols = volumes as number[]
    const avg5 = vols.slice(-5).reduce((a, b) => a + b, 0) / 5
    const avg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / 20
    const chg5 = ((price - prices[prices.length - 6]) / prices[prices.length - 6]) * 100
    const vp = scoreVolumePrice(chg5, avg20 > 0 ? avg5 / avg20 : 1)
    volInd = {
      key: "volume",
      name: "量价配合（5/20日）",
      display: `${vp.tag} · 量比 ${(avg5 / (avg20 || 1)).toFixed(2)}`,
      score: vp.score,
      weight: 10,
      verdict:
        vp.tag === "放量上涨" ? "成交量放大且价格上涨，多头进攻得到量能确认"
        : vp.tag === "放量下跌" ? "成交量放大且价格下跌，抛压沉重需警惕"
        : vp.tag === "缩量上涨" ? "价格上涨但量能萎缩，上行动力存疑"
        : vp.tag === "缩量下跌" ? "价格下跌但量能萎缩，抛压趋于衰竭"
        : chg5 >= 0 ? "量价温和配合，走势平稳偏多" : "量价温和回落，走势平稳偏空",
      kind: "momentum",
    }
  }

  // 距一年高点（序列内自洽口径）
  const yearHigh = Math.max(...prices.slice(-365))
  const drawdown = ((price - yearHigh) / yearHigh) * 100

  const indicators: IndicatorResult[] = []
  const missing: string[] = []

  /* 1. 价格 vs MA200 */
  if (ma200) {
    const t = scoreTrend(price, ma200)
    indicators.push({
      key: "trend",
      name: "价格 vs 200日均线",
      display: `${t.pct >= 0 ? "+" : ""}${t.pct.toFixed(1)}%`,
      score: t.score,
      weight: 22,
      verdict:
        t.pct >= 0
          ? `价格高于 200 日均线 ${Math.abs(t.pct).toFixed(1)}%，长期趋势偏多`
          : `价格低于 200 日均线 ${Math.abs(t.pct).toFixed(1)}%，长期趋势承压`,
      kind: "trend",
    })
  } else missing.push("MA200（数据不足 200 日）")

  /* 2. 均线交叉 */
  if (ma50 && ma200) {
    const c = scoreCross(ma50, ma200)
    const golden = ma50 > ma200
    indicators.push({
      key: "cross",
      name: "均线交叉（50/200）",
      display: golden ? "金叉形态" : "死叉形态",
      score: c.score,
      weight: 14,
      verdict: golden
        ? `50 日均线高于 200 日均线 ${Math.abs(c.pct).toFixed(1)}%，金叉结构维持`
        : `50 日均线低于 200 日均线 ${Math.abs(c.pct).toFixed(1)}%，死叉结构维持`,
      kind: "trend",
    })
  } else missing.push("均线交叉（数据不足）")

  /* 3. RSI */
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

  /* 4. MACD */
  if (m) {
    indicators.push({
      key: "macd",
      name: "MACD（12/26/9）",
      display: `${m.hist >= 0 ? "+" : ""}${((m.hist / price) * 100).toFixed(2)}%`,
      score: scoreMacd({ ...m, price }),
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
  } else missing.push("MACD（数据不足 35 日）")

  /* 5. 动量 */
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

  /* 6. BOLL 位置 */
  if (bollMid && bollUpper) {
    const band = bollUpper - bollMid
    const b = scoreBollPosition(price, bollMid, band)
    indicators.push({
      key: "boll",
      name: "布林带位置（20,2）",
      display:
        b.pos > 1 ? "上轨上方" : b.pos > 0.35 ? "中轨上方" : b.pos > -0.35 ? "中轨附近" : b.pos > -1 ? "中轨下方" : "下轨下方",
      score: b.score,
      weight: 10,
      verdict:
        b.pos > 1 ? "价格突破布林上轨，短期过热（逆势减分）"
        : b.pos > 0.35 ? "价格运行于布林中上轨之间，短线偏强"
        : b.pos > -0.35 ? "价格贴近布林中轨，方向待选择"
        : b.pos > -1 ? "价格运行于布林中下轨之间，短线偏弱"
        : "价格跌破布林下轨，短期超跌（逆势加分）",
      kind: "momentum",
    })
  }

  /* 7. 量价配合 */
  if (volInd) indicators.push(volInd)

  /* 8. 距一年高点 */
  indicators.push({
    key: "ath",
    name: "距一年高点位置",
    display: `${drawdown.toFixed(1)}%`,
    score: scoreAthPosition(drawdown),
    weight: 10,
    verdict:
      drawdown >= -5 ? "逼近一年高点，处于强势周期"
      : drawdown >= -30 ? "距一年高点回撤温和，处于高位震荡区"
      : drawdown >= -55 ? "回撤较深，市场信心受损"
      : "深度回撤，处于周期底部区域",
    kind: "position",
  })

  /* 加权合成 */
  const wSum = indicators.reduce((a, i) => a + i.weight, 0)
  const raw = indicators.reduce((a, i) => a + i.score * i.weight, 0)
  const composite = Math.round((raw / (wSum * 2)) * 100)

  const counts = { bull: 0, bear: 0, neutral: 0 }
  for (const i of indicators) {
    const v = verdictOfScore(i.score)
    counts[v.tone === "bull" ? "bull" : v.tone === "bear" ? "bear" : "neutral"]++
  }

  return {
    indicators,
    composite,
    verdict: verdictOfComposite(composite),
    counts,
    note: missing.length ? `部分指标因数据不足未计入：${missing.join("、")}` : null,
  }
}

/** 一组指标 → 加权综合分（与 analyzeCoin 同口径），用于维度聚合 */
export function compositeOf(indicators: IndicatorResult[]): number | null {
  if (!indicators.length) return null
  const wSum = indicators.reduce((a, i) => a + i.weight, 0)
  const raw = indicators.reduce((a, i) => a + i.score * i.weight, 0)
  return Math.round((raw / (wSum * 2)) * 100)
}
