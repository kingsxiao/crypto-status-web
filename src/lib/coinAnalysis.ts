/**
 * 通用币种多指标观点引擎 — 仅依赖日线收盘/成交量序列，任何币种可算。
 *
 * 八项指标各自给出 [-2, +2] 分与一句话观点，加权归一为 [-100, +100] 综合分，
 * 输出 看多/偏多/中性/偏空/看空 结论与多空计数。
 * 与 indicators.ts 的 analyze() 共用评分函数，保证口径一致。
 *
 * 文案一律输出 message key + 参数（LMsg），由渲染层按当前语言翻译；
 * 引擎本身不依赖 locale，结果可安全缓存与持久化。
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
import type { MessageKey } from "@/i18n"

export type VerdictLevel = "strong-long" | "long" | "neutral" | "short" | "strong-short"

/** 综合分五档 → 文案 key（SignalCard / OpinionBoard / SentimentPage 共用） */
export const VERDICT_LEVEL_KEY: Record<VerdictLevel, MessageKey> = {
  "strong-long": "verdictLevel.strongLong",
  long: "verdictLevel.long",
  neutral: "verdictLevel.neutral",
  short: "verdictLevel.short",
  "strong-short": "verdictLevel.strongShort",
}

/** 单指标判定五档（看多/偏多/中性/偏空/看空） */
export type ScoreLevel = "long" | "leanLong" | "neutral" | "leanShort" | "short"

export const SCORE_LEVEL_KEY: Record<ScoreLevel, MessageKey> = {
  long: "scoreLevel.long",
  leanLong: "scoreLevel.leanLong",
  neutral: "scoreLevel.neutral",
  leanShort: "scoreLevel.leanShort",
  short: "scoreLevel.short",
}

export interface CoinAnalysis {
  indicators: IndicatorResult[]
  /** [-100, +100] */
  composite: number
  verdict: { level: VerdictLevel }
  counts: { bull: number; bear: number; neutral: number }
  /** 数据不足等原因导致的部分指标缺失说明（key 列表），null = 完整 */
  note: { missing: MessageKey[] } | null
}

/** 单指标得分 → 判定档位（文案由渲染层经 SCORE_LEVEL_KEY 翻译） */
export function verdictOfScore(score: number): { level: ScoreLevel; tone: "bull" | "bear" | "neutral" } {
  if (score >= 1.2) return { level: "long", tone: "bull" }
  if (score >= 0.25) return { level: "leanLong", tone: "bull" }
  if (score > -0.25) return { level: "neutral", tone: "neutral" }
  if (score > -1.2) return { level: "leanShort", tone: "bear" }
  return { level: "short", tone: "bear" }
}

export function verdictOfComposite(composite: number): CoinAnalysis["verdict"] {
  const level: VerdictLevel =
    composite >= 40 ? "strong-long"
    : composite >= 15 ? "long"
    : composite > -15 ? "neutral"
    : composite > -40 ? "short"
    : "strong-short"
  return { level }
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

/** 量价配合形态（key 同时用于 display 与 verdict 取词） */
type VolTag = "surgeUp" | "surgeDown" | "shrinkUp" | "shrinkDown" | "mildUp" | "mildDown"

/** 量价配合：近5日均量相对20日均量 × 近5日涨跌方向 */
function scoreVolumePrice(chg5: number, volRatio: number): { score: number; tag: VolTag } {
  const rising = chg5 >= 0
  if (volRatio >= 1.15) return { score: rising ? 1.5 : -1.5, tag: rising ? "surgeUp" : "surgeDown" }
  if (volRatio <= 0.85) return { score: rising ? 0.5 : -0.5, tag: rising ? "shrinkUp" : "shrinkDown" }
  return { score: rising ? 1 : -1, tag: rising ? "mildUp" : "mildDown" }
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
      name: { key: "ind.volume.name" },
      display: { key: `ind.volume.display.${vp.tag}`, params: { ratio: (avg5 / (avg20 || 1)).toFixed(2) } },
      score: vp.score,
      weight: 10,
      verdict: { key: `ind.volume.v.${vp.tag}` },
      kind: "momentum",
    }
  }

  // 距一年高点（序列内自洽口径）
  const yearHigh = Math.max(...prices.slice(-365))
  const drawdown = ((price - yearHigh) / yearHigh) * 100

  const indicators: IndicatorResult[] = []
  const missing: MessageKey[] = []

  /* 1. 价格 vs MA200 */
  if (ma200) {
    const t = scoreTrend(price, ma200)
    indicators.push({
      key: "trend",
      name: { key: "ind.trend.name" },
      display: `${t.pct >= 0 ? "+" : ""}${t.pct.toFixed(1)}%`,
      score: t.score,
      weight: 22,
      verdict:
        t.pct >= 0
          ? { key: "ind.trend.vAbove", params: { pct: Math.abs(t.pct).toFixed(1) } }
          : { key: "ind.trend.vBelow", params: { pct: Math.abs(t.pct).toFixed(1) } },
      kind: "trend",
    })
  } else missing.push("coin.miss.ma200")

  /* 2. 均线交叉 */
  if (ma50 && ma200) {
    const c = scoreCross(ma50, ma200)
    const golden = ma50 > ma200
    indicators.push({
      key: "cross",
      name: { key: "ind.cross.name" },
      display: { key: golden ? "ind.cross.golden" : "ind.cross.dead" },
      score: c.score,
      weight: 14,
      verdict: golden
        ? { key: "ind.cross.vGolden", params: { pct: Math.abs(c.pct).toFixed(1) } }
        : { key: "ind.cross.vDead", params: { pct: Math.abs(c.pct).toFixed(1) } },
      kind: "trend",
    })
  } else missing.push("coin.miss.cross")

  /* 3. RSI */
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

  /* 4. MACD */
  if (m) {
    indicators.push({
      key: "macd",
      name: { key: "ind.macd.name" },
      display: `${m.hist >= 0 ? "+" : ""}${((m.hist / price) * 100).toFixed(2)}%`,
      score: scoreMacd({ ...m, price }),
      weight: 16,
      verdict: {
        key:
          m.hist > 0
            ? m.hist > m.prevHist ? "ind.macd.vExpandUp" : "ind.macd.vFadeUp"
            : m.hist < m.prevHist ? "ind.macd.vExpandDown" : "ind.macd.vFadeDown",
      },
      kind: "momentum",
    })
  } else missing.push("coin.miss.macd")

  /* 5. 动量 */
  indicators.push({
    key: "momentum",
    name: { key: "ind.momentum.name" },
    display: `7D ${chg7 >= 0 ? "+" : ""}${chg7.toFixed(1)}% · 30D ${chg30 >= 0 ? "+" : ""}${chg30.toFixed(1)}%`,
    score: scoreMomentum(chg7, chg30),
    weight: 12,
    verdict: { key: chg30 >= 0 ? "ind.momentum.vUp" : "ind.momentum.vDown" },
    kind: "momentum",
  })

  /* 6. BOLL 位置 */
  if (bollMid && bollUpper) {
    const band = bollUpper - bollMid
    const b = scoreBollPosition(price, bollMid, band)
    indicators.push({
      key: "boll",
      name: { key: "ind.boll.name" },
      display: {
        key:
          b.pos > 1 ? "ind.boll.display.aboveUpper"
          : b.pos > 0.35 ? "ind.boll.display.upperMid"
          : b.pos > -0.35 ? "ind.boll.display.mid"
          : b.pos > -1 ? "ind.boll.display.lowerMid"
          : "ind.boll.display.belowLower",
      },
      score: b.score,
      weight: 10,
      verdict: {
        key:
          b.pos > 1 ? "ind.boll.v1"
          : b.pos > 0.35 ? "ind.boll.v2"
          : b.pos > -0.35 ? "ind.boll.v3"
          : b.pos > -1 ? "ind.boll.v4"
          : "ind.boll.v5",
      },
      kind: "momentum",
    })
  }

  /* 7. 量价配合 */
  if (volInd) indicators.push(volInd)

  /* 8. 距一年高点 */
  indicators.push({
    key: "ath",
    name: { key: "ind.athYear.name" },
    display: `${drawdown.toFixed(1)}%`,
    score: scoreAthPosition(drawdown),
    weight: 10,
    verdict: {
      key:
        drawdown >= -5 ? "ind.athYear.v1"
        : drawdown >= -30 ? "ind.athYear.v2"
        : drawdown >= -55 ? "ind.athYear.v3"
        : "ind.athYear.v4",
    },
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
    note: missing.length ? { missing } : null,
  }
}

/** 一组指标 → 加权综合分（与 analyzeCoin 同口径），用于维度聚合 */
export function compositeOf(indicators: IndicatorResult[]): number | null {
  if (!indicators.length) return null
  const wSum = indicators.reduce((a, i) => a + i.weight, 0)
  const raw = indicators.reduce((a, i) => a + i.score * i.weight, 0)
  return Math.round((raw / (wSum * 2)) * 100)
}
