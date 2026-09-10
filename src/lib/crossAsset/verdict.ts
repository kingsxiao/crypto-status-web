/**
 * 跨资产信号引擎 — 复刻 OpenClue (openclue.net) 的「每日风险判断」方法论：
 *
 *   情绪 / 稳定币 / 衍生品 / 市场结构 等跨资产指标
 *     → 每个指标按公开阈值给出 看多/中性/看空 信号（逆向指标反向计分）
 *     → 加权聚合为五档市场立场（risk_on … risk_off）
 *     → 生成规则化叙述（标题 / 关键主题 / 今日关注）
 *
 * OpenClue 另覆盖 ETF 资金流与 VIX/股指宏观，因无免费可达的浏览器端
 * 数据源（FRED/Stooq/Yahoo 均不可达或无 CORS），未纳入，指标体系
 * 相应以链上资金与衍生品结构为主。
 */

import { t, tm, type LMsg, type MessageKey } from "@/i18n"
import { CROSS_TIERS } from "@/lib/thresholds"
import type { Coin, FearGreedEntry, GlobalData } from "../api"
import type { CrossAssetData } from "./fetch"

export type Stance =
  | "risk_on"
  | "cautiously_risk_on"
  | "neutral"
  | "cautiously_risk_off"
  | "risk_off"

/** 五档立场 → 文案 key（stance-style / VerdictCard / 历史卡共用） */
export const STANCE_KEY: Record<Stance, MessageKey> = {
  risk_on: "cross.stance.riskOn",
  cautiously_risk_on: "cross.stance.cautiouslyRiskOn",
  neutral: "cross.stance.neutral",
  cautiously_risk_off: "cross.stance.cautiouslyRiskOff",
  risk_off: "cross.stance.riskOff",
}

/** 指标域（渲染层经 DOMAIN_KEY 翻译） */
export type Domain = "sentiment" | "funds" | "derivatives" | "structure"

export const DOMAIN_KEY: Record<Domain, MessageKey> = {
  sentiment: "cross.domain.sentiment",
  funds: "cross.domain.funds",
  derivatives: "cross.domain.derivatives",
  structure: "cross.domain.structure",
}

export type Faction = "bull" | "neutral" | "bear"

export interface CrossIndicator {
  key: string
  /** 指标名（可翻译消息） */
  name: LMsg
  /** 指标域 */
  domain: Domain
  /** 当前读数（展示用）：纯数字串直接展示，含词汇时为可翻译消息 */
  display: string | LMsg
  /** 信号分 [-1, +1]，负数看空 */
  score: number
  weight: number
  /** 一句话结论（可翻译消息） */
  verdict: LMsg
  /** 阈值依据（可翻译消息） */
  rationale: LMsg
}

/** 规则化标题：结构化存储（不含翻译文本），渲染层经 headlineText() 组词 */
export interface HeadlineClause {
  name: LMsg
  display: string | LMsg
}

export interface VerdictHeadline {
  stance: Stance
  variant: "both" | "bull" | "bear" | "flat"
  bull?: HeadlineClause
  bear?: HeadlineClause
}

/** 主题行：Top 指标摘要 或 规则触发的整句提示 */
export type ThemeItem =
  | { kind: "indicator"; name: LMsg; display: string | LMsg; verdict: LMsg }
  | { kind: "msg"; msg: LMsg }

export interface Verdict {
  date: string
  stance: Stance
  /** 综合分 [-100, +100] */
  composite: number
  /** 置信度 0-1：方向一致度与综合分强度合成 */
  confidence: number
  indicators: CrossIndicator[]
  mix: { bull: number; neutral: number; bear: number }
  headline: VerdictHeadline
  themes: ThemeItem[]
  watch: LMsg[]
  /** 记录当时的总市值 24h 变化（%），供次日复盘 */
  mcapChg24h: number
  /** 记录当时的加密总市值绝对值（美元）；0 = 降级且无市值数据。复盘优先用它算隔日变化 */
  mcapAbs: number
}

export interface VerdictInput {
  global: GlobalData
  fng: FearGreedEntry | null
  coins: Coin[]
  cross: CrossAssetData
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function factionOf(score: number): Faction {
  if (score > 0.2) return "bull"
  if (score < -0.2) return "bear"
  return "neutral"
}

/** 恐惧贪婪 → 逆向信号分：极度恐慌计为看多，贪婪高位计为看空 */
export function fngScore(v: number): number {
  if (v <= 20) return 1
  if (v <= 45) return lerp(1, 0.3, (v - 20) / 25)
  if (v <= 55) return 0
  if (v <= 80) return lerp(0, -0.7, (v - 55) / 25)
  return -1
}

/** 资金费率（% / 8h）→ 信号分：温和多头为健康，过热与深度负值分别逆向 */
export function fundingScore(r: number): number {
  if (r < -0.005) return 0.6 // 空方付费，拥挤空头常伴挤压反弹
  if (r < 0.005) return 0
  if (r < 0.03) return 0.4 // 温和多头建仓
  if (r < 0.08) return -0.3 // 偏热
  return -1 // 过热：杠杆拥挤，回撤风险
}

/** 多空账户比 → 逆向信号分：多头拥挤看空，空头拥挤看多 */
export function lsScore(ls: number): number {
  if (ls >= 1.8) return -1
  if (ls >= 1.2) return -0.3
  if (ls > 0.8) return 0
  return 0.5
}

function pctStr(v: number | null, digits = 2, signed = true): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(digits)}%`
}

/** 以 UTC+8 日期为键，与「每日」判断的粒度一致 */
function todayKey(d = new Date()): string {
  const zh = new Date(d.getTime() + 8 * 3600_000)
  return zh.toISOString().slice(0, 10)
}

export function computeVerdict(input: VerdictInput): Verdict {
  const { global, fng, coins, cross } = input
  const inds: CrossIndicator[] = []

  const btc = coins.find((c) => c.id === "bitcoin")
  const eth = coins.find((c) => c.id === "ethereum")

  /* CoinGecko /global 限流降级时为全零 —— 用 top12 市值加权近似，完全无数据则跳过 */
  const capCoins = coins.filter((c) => (c.market_cap ?? 0) > 0)
  const capSum = capCoins.reduce((a, c) => a + (c.market_cap ?? 0), 0)
  const coinsWeighted24h = (() => {
    const rows = capCoins.filter((c) => c.price_change_percentage_24h_in_currency != null)
    const w = rows.reduce((a, c) => a + (c.market_cap ?? 0), 0)
    if (!w) return null
    return rows.reduce(
      (a, c) => a + (c.price_change_percentage_24h_in_currency ?? 0) * (c.market_cap ?? 0),
      0,
    ) / w
  })()
  const globalValid = global.total_market_cap_usd > 0
  const domValid = global.btc_dominance > 0
  const mcapChg24h = globalValid ? global.market_cap_change_24h_pct : (coinsWeighted24h ?? 0)
  const dominance = domValid
    ? global.btc_dominance
    : capSum && btc
      ? ((btc.market_cap ?? 0) / capSum) * 100
      : 0

  /* 情绪域 */
  if (fng) {
    const s = fngScore(fng.value)
    inds.push({
      key: "fng",
      name: { key: "cross.ind.fng.name" },
      domain: "sentiment",
      display: { key: "ind.sentiment.display", params: { value: fng.value, class: fng.classification } },
      score: s,
      weight: 1.2,
      verdict: {
        key: s > 0.2 ? "cross.ind.fng.v1" : s < -0.2 ? "cross.ind.fng.v2" : "cross.ind.fng.v3",
      },
      rationale: { key: "cross.ind.fng.rationale" },
    })
  }

  /* 资金域 */
  if (globalValid || coinsWeighted24h != null) {
    inds.push({
      key: "mcap24h",
      name: { key: "cross.ind.mcap24h.name" },
      domain: "funds",
      display: globalValid
        ? pctStr(mcapChg24h)
        : { key: "cross.ind.mcap24h.displayApprox", params: { v: pctStr(mcapChg24h) } },
      score: clamp(mcapChg24h / 2.5, -1, 1),
      weight: 1.4,
      verdict: {
        key:
          mcapChg24h > 0.5 ? "cross.ind.mcap24h.v1"
          : mcapChg24h < -0.5 ? "cross.ind.mcap24h.v2"
          : "cross.ind.mcap24h.v3",
      },
      rationale: { key: "cross.ind.mcap24h.rationale" },
    })
  }

  if (cross.breadth) {
    inds.push({
      key: "mcap7d",
      name: { key: "cross.ind.mcap7d.name" },
      domain: "funds",
      display: pctStr(cross.breadth.chg7d),
      score: clamp(cross.breadth.chg7d / 6, -1, 1),
      weight: 1.0,
      verdict: {
        key:
          cross.breadth.chg7d > 1 ? "cross.ind.mcap7d.v1"
          : cross.breadth.chg7d < -1 ? "cross.ind.mcap7d.v2"
          : "cross.ind.mcap7d.v3",
      },
      rationale: { key: "cross.ind.mcap7d.rationale" },
    })
    inds.push({
      key: "breadth",
      name: { key: "cross.ind.breadth.name" },
      domain: "funds",
      display: {
        key: "cross.ind.breadth.display",
        params: { up: Math.round(cross.breadth.advancing * cross.breadth.total), total: cross.breadth.total },
      },
      score: clamp((cross.breadth.advancing - 0.5) / 0.35, -1, 1),
      weight: 0.7,
      verdict: {
        key:
          cross.breadth.advancing > 0.6 ? "cross.ind.breadth.v1"
          : cross.breadth.advancing < 0.4 ? "cross.ind.breadth.v2"
          : "cross.ind.breadth.v3",
      },
      rationale: { key: "cross.ind.breadth.rationale" },
    })
  }

  if (cross.stablecoin) {
    const st = cross.stablecoin
    inds.push({
      key: "stablecoin",
      name: { key: "cross.ind.stablecoin.name" },
      domain: "funds",
      display: `$${(st.mcap / 1e9).toFixed(1)}B · ${pctStr(st.chg7d)}`,
      score: clamp(st.chg7d / 2, -1, 1),
      weight: 1.1,
      verdict: {
        key:
          st.chg7d > 0.5 ? "cross.ind.stablecoin.v1"
          : st.chg7d < -0.5 ? "cross.ind.stablecoin.v2"
          : "cross.ind.stablecoin.v3",
      },
      rationale: { key: "cross.ind.stablecoin.rationale" },
    })
  }

  /* 衍生品域 */
  if (cross.derivatives) {
    const d = cross.derivatives
    inds.push({
      key: "funding",
      name: { key: "cross.ind.funding.name" },
      domain: "derivatives",
      display: `${d.btcFundingPct8h.toFixed(4)}% / 8h`,
      score: fundingScore(d.btcFundingPct8h),
      weight: 1.0,
      verdict: {
        key:
          d.btcFundingPct8h >= 0.08 ? "cross.ind.funding.v1"
          : d.btcFundingPct8h >= 0.03 ? "cross.ind.funding.v2"
          : d.btcFundingPct8h >= 0.005 ? "cross.ind.funding.v3"
          : d.btcFundingPct8h >= -0.005 ? "cross.ind.funding.v4"
          : "cross.ind.funding.v5",
      },
      rationale: { key: "cross.ind.funding.rationale" },
    })
    inds.push({
      key: "ls",
      name: { key: "cross.ind.ls.name" },
      domain: "derivatives",
      display: d.btcLsRatio.toFixed(2),
      score: lsScore(d.btcLsRatio),
      weight: 0.8,
      verdict: {
        key:
          d.btcLsRatio >= 1.8 ? "cross.ind.ls.v1"
          : d.btcLsRatio >= 1.2 ? "cross.ind.ls.v2"
          : d.btcLsRatio > 0.8 ? "cross.ind.ls.v3"
          : "cross.ind.ls.v4",
      },
      rationale: { key: "cross.ind.ls.rationale" },
    })
  }

  /* 结构域 */
  // 占比 24h 变化无直接数据源：用 BTC 与全市场涨跌差近似
  // （当 BTC 强于全市场时占比上升）；global 降级时全市场项同样用近似值
  const domChgApprox = btc
    ? (btc.price_change_percentage_24h_in_currency ?? 0) - mcapChg24h
    : 0
  if (domValid || (capSum > 0 && btc)) {
    inds.push({
      key: "dominance",
      name: { key: "cross.ind.dom.name" },
      domain: "structure",
      display: {
        key: globalValid ? "cross.ind.dom.display" : "cross.ind.dom.displayApprox",
        params: { dom: dominance.toFixed(1), chg: pctStr(domChgApprox) },
      },
      score: clamp(-domChgApprox / 0.8, -1, 1),
      weight: 0.9,
      verdict: {
        key:
          domChgApprox > 0.5 ? "cross.ind.dom.v1"
          : domChgApprox < -0.5 ? "cross.ind.dom.v2"
          : "cross.ind.dom.v3",
      },
      rationale: { key: "cross.ind.dom.rationale" },
    })
  }

  if (btc && eth) {
    const ratio = eth.current_price / btc.current_price
    const e24 = eth.price_change_percentage_24h_in_currency
    const b24 = btc.price_change_percentage_24h_in_currency
    const chg =
      e24 != null && b24 != null && b24 !== -100 ? ((1 + e24 / 100) / (1 + b24 / 100) - 1) * 100 : null
    inds.push({
      key: "ethbtc",
      name: { key: "cross.ind.ethbtc.name" },
      domain: "structure",
      display: `${ratio.toFixed(5)} · ${pctStr(chg)}`,
      score: clamp((chg ?? 0) / 2, -1, 1),
      weight: 0.7,
      verdict: {
        key:
          (chg ?? 0) > 0.5 ? "cross.ind.ethbtc.v1"
          : (chg ?? 0) < -0.5 ? "cross.ind.ethbtc.v2"
          : "cross.ind.ethbtc.v3",
      },
      rationale: { key: "cross.ind.ethbtc.rationale" },
    })
  }

  if (cross.breadth) {
    inds.push({
      key: "alt",
      name: { key: "cross.ind.alt.name" },
      domain: "structure",
      display: pctStr(cross.breadth.altChg7d),
      score: clamp(cross.breadth.altChg7d / 8, -1, 1),
      weight: 0.7,
      verdict: {
        key:
          cross.breadth.altChg7d > 2 ? "cross.ind.alt.v1"
          : cross.breadth.altChg7d < -2 ? "cross.ind.alt.v2"
          : "cross.ind.alt.v3",
      },
      rationale: { key: "cross.ind.alt.rationale" },
    })
  }

  /* 聚合 */
  const wSum = inds.reduce((a, i) => a + i.weight, 0)
  const composite = Math.round(
    (inds.reduce((a, i) => a + i.score * i.weight, 0) / (wSum || 1)) * 100,
  )
  const stance: Stance =
    composite >= CROSS_TIERS.strong
      ? "risk_on"
      : composite >= CROSS_TIERS.weak
        ? "cautiously_risk_on"
        : composite > -CROSS_TIERS.weak
          ? "neutral"
          : composite > -CROSS_TIERS.strong
            ? "cautiously_risk_off"
            : "risk_off"

  const mix = inds.reduce(
    (acc, i) => {
      acc[factionOf(i.score)]++
      return acc
    },
    { bull: 0, neutral: 0, bear: 0 } as { bull: number; neutral: number; bear: number },
  )
  const agreement = Math.max(mix.bull, mix.neutral, mix.bear) / (inds.length || 1)
  const confidence = clamp(0.5 * agreement + 0.5 * (Math.abs(composite) / 100), 0.3, 0.95)

  /* 规则化叙述：结构化存储（key + 参数），渲染层经 headlineText/themeText 组词 */
  const byContrib = [...inds].sort(
    (a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight),
  )
  const topBull = inds.filter((i) => i.score > 0.2).sort((a, b) => b.score * b.weight - a.score * a.weight)[0]
  const topBear = inds.filter((i) => i.score < -0.2).sort((a, b) => a.score * a.weight - b.score * a.weight)[0]

  const headline: VerdictHeadline =
    topBull && topBear
      ? { stance, variant: "both", bull: topBull, bear: topBear }
      : topBull
        ? { stance, variant: "bull", bull: topBull }
        : topBear
          ? { stance, variant: "bear", bear: topBear }
          : { stance, variant: "flat" }

  const themes: ThemeItem[] = byContrib.slice(0, 4).map((i) => ({
    kind: "indicator",
    name: i.name,
    display: i.display,
    verdict: i.verdict,
  }))
  if (cross.stablecoin && mcapChg24h < -1 && cross.stablecoin.chg7d > 0.5) {
    themes.unshift({ kind: "msg", msg: { key: "cross.theme.divergence" } })
  }
  if (cross.derivatives && mcapChg24h > 1 && cross.derivatives.btcFundingPct8h >= 0.03) {
    themes.unshift({ kind: "msg", msg: { key: "cross.theme.leverage" } })
  }
  if (fng && fng.value >= 75) themes.unshift({ kind: "msg", msg: { key: "cross.theme.fngHot", params: { value: fng.value } } })
  if (fng && fng.value <= 25) themes.unshift({ kind: "msg", msg: { key: "cross.theme.fngIce", params: { value: fng.value } } })

  const watch: LMsg[] = []
  if (cross.derivatives && cross.derivatives.btcFundingPct8h >= 0.08)
    watch.push({ key: "cross.watch.fundingHot" })
  if (cross.derivatives && cross.derivatives.btcFundingPct8h <= -0.005)
    watch.push({ key: "cross.watch.negativeFunding" })
  if (fng && fng.value >= 75) watch.push({ key: "cross.watch.greedExtreme" })
  if (fng && fng.value <= 25) watch.push({ key: "cross.watch.fearExtreme" })
  if (cross.stablecoin && cross.stablecoin.chg7d < -1)
    watch.push({ key: "cross.watch.stableShrink" })
  if (domChgApprox > 0.5) watch.push({ key: "cross.watch.domRise" })
  if ((domChgApprox ?? 0) < -0.5 && cross.breadth && cross.breadth.altChg7d > 2)
    watch.push({ key: "cross.watch.domFallAlt" })
  if (!watch.length) watch.push({ key: "cross.watch.none" })

  return {
    date: todayKey(),
    stance,
    composite,
    confidence,
    indicators: inds,
    mix,
    headline,
    themes: themes.slice(0, 5),
    watch: watch.slice(0, 4),
    mcapChg24h,
    mcapAbs: cryptoMcapOf(global, coins),
  }
}

/* ---------------------------- 叙述渲染（渲染期取词） ---------------------------- */

/** 规则化标题 → 当前语言文案；历史存档可能是旧版纯文本串，原样返回 */
export function headlineText(h: VerdictHeadline | string): string {
  if (typeof h === "string") return h
  const stance = t(STANCE_KEY[h.stance])
  switch (h.variant) {
    case "both":
      return t("cross.headline.both", {
        stance,
        bull: tm(h.bull!.name),
        bullD: tm(h.bull!.display),
        bear: tm(h.bear!.name),
        bearD: tm(h.bear!.display),
      })
    case "bull":
      return t("cross.headline.bull", {
        stance,
        bull: tm(h.bull!.name),
        bullD: tm(h.bull!.display),
      })
    case "bear":
      return t("cross.headline.bear", {
        stance,
        bear: tm(h.bear!.name),
        bearD: tm(h.bear!.display),
      })
    default:
      return t("cross.headline.flat", { stance })
  }
}

/** 主题行 → 当前语言文案 */
export function themeText(item: ThemeItem): string {
  return item.kind === "indicator"
    ? t("cross.theme.indicator", {
        name: tm(item.name),
        display: tm(item.display),
        verdict: tm(item.verdict),
      })
    : t(item.msg.key, item.msg.params)
}

/** 加密总市值：优先 CoinGecko global；限流降级时用 top12 市值合计近似（约覆盖 85%） */
export function cryptoMcapOf(global: GlobalData, coins: Coin[]): number {
  if (global.total_market_cap_usd > 0) return global.total_market_cap_usd
  return coins.reduce((a, c) => a + (c.market_cap ?? 0), 0)
}
