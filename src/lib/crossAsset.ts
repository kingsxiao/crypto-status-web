/**
 * 跨资产判断引擎 — 复刻 OpenClue (openclue.net) 的「每日风险判断」方法论：
 *
 *   情绪 / 稳定币 / 衍生品 / 市场结构 等跨资产指标
 *     → 每个指标按公开阈值给出 看多/中性/看空 信号（逆向指标反向计分）
 *     → 加权聚合为五档市场立场（risk_on … risk_off）
 *     → 生成规则化叙述（标题 / 关键主题 / 今日关注）
 *     → 判断落库 localStorage，次日以总市值实际涨跌自动复盘打分
 *
 * 数据源（全部公开免 key、浏览器可直连，均实测可用）：
 *  - Defillama stablecoins : 稳定币总市值与 24h/7d/30d 变化
 *  - Binance fapi          : BTC/ETH 资金费率（8h）、多空账户比（日频）
 *  - CoinGecko markets     : top50 市值加权 7d 动量与涨跌家数
 *  - MarketDataContext     : 总市值 / BTC 占比 / 恐惧贪婪 / ETH-BTC（复用总览快照）
 *
 * OpenClue 另覆盖 ETF 资金流与 VIX/股指宏观，因无免费可达的浏览器端
 * 数据源（FRED/Stooq/Yahoo 均不可达或无 CORS），本页未纳入，指标体系
 * 相应以链上资金与衍生品结构为主。
 */

import { t, tm, type LMsg, type MessageKey } from "@/i18n"
import { fetchJSON } from "@/lib/http"
import type { Coin, FearGreedEntry, GlobalData } from "./api"

/* --------------------------------- 数据获取 --------------------------------- */

const LLAMA = "https://stablecoins.llama.fi"
const FAPI = "https://fapi.binance.com"
const CG = "https://api.coingecko.com/api/v3"

/** 单一来源失败不影响其余来源 */
async function settle<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

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

interface LlamaPoint {
  date: number
  totalCirculatingUSD?: { peggedUSD: number }
  totalCirculating?: { peggedUSD: number }
}

function fetchStablecoin(): Promise<StablecoinData> {
  return fetchJSON<LlamaPoint[]>(`${LLAMA}/stablecoincharts/all`).then((pts) => {
    const series = pts
      .map((p) => p.totalCirculatingUSD?.peggedUSD ?? p.totalCirculating?.peggedUSD ?? 0)
      .filter((v) => v > 0)
    if (series.length < 9) throw new Error("stablecoin history too short")
    const last = series[series.length - 1]
    const ago = (days: number) => series[series.length - 1 - days] ?? series[0]
    return {
      mcap: last,
      chg24h: (last / ago(1) - 1) * 100,
      chg7d: (last / ago(7) - 1) * 100,
      chg30d: (last / ago(30) - 1) * 100,
    }
  })
}

interface PremiumIndex {
  lastFundingRate: string
}

interface LsRow {
  longShortRatio: string
}

function fetchDerivatives(): Promise<DerivativesData> {
  const prem = (s: string) =>
    fetchJSON<PremiumIndex>(`${FAPI}/fapi/v1/premiumIndex?symbol=${s}`).then(
      (d) => Number(d.lastFundingRate) * 100,
    )
  const ls = fetchJSON<LsRow[]>(
    `${FAPI}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1d&limit=8`,
  ).then((rows) => {
    const trend = rows.map((r) => Number(r.longShortRatio)).filter(Number.isFinite)
    // 偶发返回空表/全非法行：不抛错的话 btcLsRatio 为 undefined，
    // computeVerdict 里 toFixed 直接抛异常炸掉整页渲染；抛错交由 settle 置 null
    if (trend.length === 0) throw new Error("ls rows empty")
    return trend
  })
  return Promise.all([prem("BTCUSDT"), prem("ETHUSDT"), ls]).then(
    ([btcFundingPct8h, ethFundingPct8h, trend]) => ({
      btcFundingPct8h,
      ethFundingPct8h,
      btcLsRatio: trend[trend.length - 1],
      btcLsTrend: trend,
    }),
  )
}

const STABLE_IDS = new Set(["tether", "usd-coin", "dai", "ethena-usde", "first-digital-usd"])

interface MarketRow {
  id: string
  market_cap: number | null
  price_change_percentage_7d_in_currency: number | null
}

function fetchBreadth(): Promise<BreadthData> {
  const url =
    `${CG}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1` +
    `&price_change_percentage=7d`
  const once = () => fetchJSON<MarketRow[]>(url).then((rows) => {
    const valid = rows.filter((r) => r.market_cap && r.price_change_percentage_7d_in_currency != null)
    if (valid.length < 20) throw new Error("breadth rows too few")
    const weighted = (list: MarketRow[]) => {
      const wSum = list.reduce((a, r) => a + (r.market_cap ?? 0), 0)
      if (!wSum) return 0
      return list.reduce(
        (a, r) => a + (r.price_change_percentage_7d_in_currency ?? 0) * (r.market_cap ?? 0),
        0,
      ) / wSum
    }
    const alts = valid.filter(
      (r) => !["bitcoin", "ethereum"].includes(r.id) && !STABLE_IDS.has(r.id),
    )
    return {
      chg7d: weighted(valid),
      altChg7d: weighted(alts),
      advancing: valid.filter((r) => (r.price_change_percentage_7d_in_currency ?? 0) > 0).length / valid.length,
      total: valid.length,
    }
  })
  // CoinGecko 间歇限流：失败后等 1.5s 自动重试一次，减少指标在页面上闪烁
  return once().catch(() => new Promise((res) => setTimeout(res, 1500)).then(once))
}

export async function fetchCrossAsset(): Promise<CrossAssetData> {
  const [stablecoin, derivatives, breadth] = await Promise.all([
    settle(fetchStablecoin()),
    settle(fetchDerivatives()),
    settle(fetchBreadth()),
  ])
  return { fetchedAt: Date.now(), stablecoin, derivatives, breadth }
}

/* -------------------------------- 信号引擎 -------------------------------- */

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
    composite >= 45
      ? "risk_on"
      : composite >= 15
        ? "cautiously_risk_on"
        : composite > -15
          ? "neutral"
          : composite > -45
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

/* ------------------------------ 判断历史与复盘 ------------------------------ */

export interface VerdictRecord {
  date: string
  stance: Stance
  composite: number
  mcapChg24h: number
  /** 旧版存档为纯文本串，新版为结构化标题（渲染层经 headlineText 组词） */
  headline: VerdictHeadline | string
}

export type Grade = "pending" | "correct" | "wrong" | "partial"

const HISTORY_KEY = "crypto-status:verdict-history-v1"
const MAX_RECORDS = 60

/** 以 UTC+8 日期为键，与「每日」判断的粒度一致 */
function todayKey(d = new Date()): string {
  const zh = new Date(d.getTime() + 8 * 3600_000)
  return zh.toISOString().slice(0, 10)
}

export function loadHistory(): VerdictRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as VerdictRecord[]) : []
  } catch {
    return []
  }
}

function saveHistory(list: VerdictRecord[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(-MAX_RECORDS)))
  } catch {
    /* 隐私模式等场景下静默失败 */
  }
}

/** 写入/覆盖今日记录，返回更新后的列表（按日期升序） */
export function upsertToday(v: Verdict): VerdictRecord[] {
  const list = loadHistory().filter((r) => r.date !== v.date)
  list.push({
    date: v.date,
    stance: v.stance,
    composite: v.composite,
    mcapChg24h: v.mcapChg24h,
    headline: v.headline,
  })
  list.sort((a, b) => (a.date < b.date ? -1 : 1))
  saveHistory(list)
  return list
}

/**
 * 复盘打分：以「次日的总市值 24h 实际涨跌」验证当日立场方向。
 *   立场 composite > +8 视为看涨、< −8 视为看跌、之间视为中性；
 *   实际 ±0.5% 以上计为涨/跌，否则横盘 → partial。
 */
export function gradeRecord(cur: VerdictRecord, next: VerdictRecord | null): Grade {
  if (!next) return "pending"
  const predicted = cur.composite > 8 ? "up" : cur.composite < -8 ? "down" : "flat"
  const actual = next.mcapChg24h > 0.5 ? "up" : next.mcapChg24h < -0.5 ? "down" : "flat"
  if (predicted === actual) return "correct"
  if (predicted === "flat" || actual === "flat") return "partial"
  return "wrong"
}

export function gradeStats(list: VerdictRecord[]) {
  let correct = 0
  let wrong = 0
  let partial = 0
  for (let i = 0; i < list.length - 1; i++) {
    const g = gradeRecord(list[i], list[i + 1])
    if (g === "correct") correct++
    else if (g === "wrong") wrong++
    else partial++
  }
  const total = correct + wrong
  return { correct, wrong, partial, total, hitRate: total ? correct / total : null }
}

/** 加密总市值：优先 CoinGecko global；限流降级时用 top12 市值合计近似（约覆盖 85%） */
export function cryptoMcapOf(global: GlobalData, coins: Coin[]): number {
  if (global.total_market_cap_usd > 0) return global.total_market_cap_usd
  return coins.reduce((a, c) => a + (c.market_cap ?? 0), 0)
}

/* -------------------------------- 体量参照 -------------------------------- */

export interface MarketAnchor {
  key: string
  /** 展示名（文案 key，渲染层翻译） */
  nameKey: MessageKey
  value: number
  /** 加密总市值为实时值，其余为参考常量 */
  live?: boolean
}

/**
 * 参考锚为慢变常量（取自公开研究数据，asof 2026-09），仅用于体量对比；
 * 加密总市值为实时值，随行情刷新。
 */
export const MARKET_ANCHORS: MarketAnchor[] = [
  { key: "crypto", nameKey: "anchor.crypto", value: -1, live: true },
  { key: "gold", nameKey: "anchor.gold", value: 31.13e12 },
  { key: "us_equity", nameKey: "anchor.usEquity", value: 64.26e12 },
  { key: "sp500", nameKey: "anchor.sp500", value: 52.95e12 },
  { key: "m2", nameKey: "anchor.m2", value: 23.22e12 },
  { key: "apple", nameKey: "anchor.apple", value: 4.75e12 },
]
