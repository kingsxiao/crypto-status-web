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
  ).then((rows) => rows.map((r) => Number(r.longShortRatio)))
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

export const STANCE_LABEL: Record<Stance, string> = {
  risk_on: "风险偏好开",
  cautiously_risk_on: "谨慎 risk-on",
  neutral: "中性",
  cautiously_risk_off: "谨慎 risk-off",
  risk_off: "风险偏好关",
}

export type Faction = "bull" | "neutral" | "bear"

export interface CrossIndicator {
  key: string
  name: string
  /** 指标域：情绪 / 资金 / 衍生品 / 结构 */
  domain: string
  /** 当前读数（展示用） */
  display: string
  /** 信号分 [-1, +1]，负数看空 */
  score: number
  weight: number
  /** 一句话结论 */
  verdict: string
  /** 阈值依据 */
  rationale: string
}

export interface Verdict {
  date: string
  stance: Stance
  /** 综合分 [-100, +100] */
  composite: number
  /** 置信度 0-1：方向一致度与综合分强度合成 */
  confidence: number
  indicators: CrossIndicator[]
  mix: { bull: number; neutral: number; bear: number }
  headline: string
  themes: string[]
  watch: string[]
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
  const approxTag = globalValid ? "" : " · top12 近似"
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
      name: "恐惧贪婪指数",
      domain: "情绪",
      display: `${fng.value} · ${fng.classification}`,
      score: s,
      weight: 1.2,
      verdict: s > 0.2 ? "恐慌区间，逆向偏多" : s < -0.2 ? "贪婪区间，情绪偏热" : "情绪中性",
      rationale: "逆向指标：≤20 极度恐慌计 +1，45-55 中性，≥80 极度贪婪计 −1",
    })
  }

  /* 资金域 */
  if (globalValid || coinsWeighted24h != null) {
    inds.push({
      key: "mcap24h",
      name: "总市值 24h 动量",
      domain: "资金",
      display: pctStr(mcapChg24h) + approxTag,
      score: clamp(mcapChg24h / 2.5, -1, 1),
      weight: 1.4,
      verdict:
        mcapChg24h > 0.5
          ? "全市场市值上行"
          : mcapChg24h < -0.5
            ? "全市场市值回落"
            : "市值横盘",
      rationale: "±2.5% 饱和线性计分，直接反映风险偏好方向；CoinGecko 限流时以 top12 市值加权近似",
    })
  }

  if (cross.breadth) {
    inds.push({
      key: "mcap7d",
      name: "总市值 7d 动量",
      domain: "资金",
      display: pctStr(cross.breadth.chg7d),
      score: clamp(cross.breadth.chg7d / 6, -1, 1),
      weight: 1.0,
      verdict: cross.breadth.chg7d > 1 ? "周线资金流入" : cross.breadth.chg7d < -1 ? "周线资金回落" : "周线动能平淡",
      rationale: "top50 市值加权 7d 涨跌幅，±6% 饱和",
    })
    inds.push({
      key: "breadth",
      name: "市场广度",
      domain: "资金",
      display: `${Math.round(cross.breadth.advancing * cross.breadth.total)}/${cross.breadth.total} 上涨`,
      score: clamp((cross.breadth.advancing - 0.5) / 0.35, -1, 1),
      weight: 0.7,
      verdict:
        cross.breadth.advancing > 0.6
          ? "普涨格局"
          : cross.breadth.advancing < 0.4
            ? "普跌格局"
            : "涨跌互现",
      rationale: "top50 中 7d 上涨家数占比，50% 为中性，85% 饱和",
    })
  }

  if (cross.stablecoin) {
    const st = cross.stablecoin
    inds.push({
      key: "stablecoin",
      name: "稳定币市值 7d",
      domain: "资金",
      display: `$${(st.mcap / 1e9).toFixed(1)}B · ${pctStr(st.chg7d)}`,
      score: clamp(st.chg7d / 2, -1, 1),
      weight: 1.1,
      verdict:
        st.chg7d > 0.5
          ? "稳定币扩张，场外资金入场"
          : st.chg7d < -0.5
            ? "稳定币收缩，资金离场迹象"
            : "稳定币平稳",
      rationale: "Defillama 全网稳定币总市值，7d ±2% 饱和：上升 = 资金进入加密",
    })
  }

  /* 衍生品域 */
  if (cross.derivatives) {
    const d = cross.derivatives
    inds.push({
      key: "funding",
      name: "BTC 资金费率",
      domain: "衍生品",
      display: `${d.btcFundingPct8h.toFixed(4)}% / 8h`,
      score: fundingScore(d.btcFundingPct8h),
      weight: 1.0,
      verdict:
        d.btcFundingPct8h >= 0.08
          ? "费率过热，多头杠杆拥挤"
          : d.btcFundingPct8h >= 0.03
            ? "费率偏热"
            : d.btcFundingPct8h >= 0.005
              ? "温和多头建仓"
              : d.btcFundingPct8h >= -0.005
                ? "费率贴近零"
                : "负费率，空头付费",
      rationale: "Binance 永续 8h 费率：0.005-0.03% 温和多头 +0.4；≥0.08% 过热 −1；深度负值逆向 +0.6",
    })
    inds.push({
      key: "ls",
      name: "BTC 多空账户比",
      domain: "衍生品",
      display: d.btcLsRatio.toFixed(2),
      score: lsScore(d.btcLsRatio),
      weight: 0.8,
      verdict:
        d.btcLsRatio >= 1.8
          ? "散户多头拥挤"
          : d.btcLsRatio >= 1.2
            ? "多头略占优"
            : d.btcLsRatio > 0.8
              ? "多空均衡"
              : "空头略占优",
      rationale: "Binance 全局多空账户比（日频，逆向）：≥1.8 多头拥挤 −1；≤0.8 空头拥挤 +0.5",
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
      name: "BTC 占比 24h",
      domain: "结构",
      display: `${dominance.toFixed(1)}% · ${pctStr(domChgApprox)}${approxTag}`,
      score: clamp(-domChgApprox / 0.8, -1, 1),
      weight: 0.9,
      verdict:
        domChgApprox > 0.5
          ? "资金回流 BTC 避险"
          : domChgApprox < -0.5
            ? "资金外溢山寨"
            : "占比稳定",
      rationale: "占比上升 = 资金避险回流 BTC（risk-off），下降 = 资金外溢山寨（risk-on）；±0.8pp 饱和",
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
      name: "ETH/BTC 24h",
      domain: "结构",
      display: `${ratio.toFixed(5)} · ${pctStr(chg)}`,
      score: clamp((chg ?? 0) / 2, -1, 1),
      weight: 0.7,
      verdict:
        (chg ?? 0) > 0.5
          ? "ETH 相对走强，risk-on 信号"
          : (chg ?? 0) < -0.5
            ? "BTC 相对走强，避险倾向"
            : "相对强度平稳",
      rationale: "ETH/BTC 是风险偏好的经典代理：ETH 强 = 山寨季倾向，±2% 饱和",
    })
  }

  if (cross.breadth) {
    inds.push({
      key: "alt",
      name: "山寨 7d 动量",
      domain: "结构",
      display: pctStr(cross.breadth.altChg7d),
      score: clamp(cross.breadth.altChg7d / 8, -1, 1),
      weight: 0.7,
      verdict:
        cross.breadth.altChg7d > 2
          ? "山寨领涨，投机活跃"
          : cross.breadth.altChg7d < -2
            ? "山寨领跌，风险资产承压"
            : "山寨动能平淡",
      rationale: "剔除 BTC/ETH/稳定币的市值加权 7d 涨跌幅，±8% 饱和",
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

  /* 规则化叙述 */
  const byContrib = [...inds].sort(
    (a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight),
  )
  const topBull = inds.filter((i) => i.score > 0.2).sort((a, b) => b.score * b.weight - a.score * a.weight)[0]
  const topBear = inds.filter((i) => i.score < -0.2).sort((a, b) => a.score * a.weight - b.score * a.weight)[0]

  const mcap24 = mcapChg24h
  let headline: string
  if (topBull && topBear) {
    headline = `${STANCE_LABEL[stance]}：${topBull.name}（${topBull.display}）与 ${topBear.name}（${topBear.display}）多空拉锯`
  } else if (topBull) {
    headline = `${STANCE_LABEL[stance]}：${topBull.name}（${topBull.display}）引领，暂无显著反向指标`
  } else if (topBear) {
    headline = `${STANCE_LABEL[stance]}：${topBear.name}（${topBear.display}）主导压制`
  } else {
    headline = `${STANCE_LABEL[stance]}：各指标读数均在中性区间`
  }

  const themes: string[] = byContrib.slice(0, 4).map(
    (i) => `${i.name} ${i.display} — ${i.verdict}`,
  )
  if (cross.stablecoin && mcap24 < -1 && cross.stablecoin.chg7d > 0.5) {
    themes.unshift("背离信号：市值回落但稳定币扩张，场外资金并未离场")
  }
  if (cross.derivatives && mcap24 > 1 && cross.derivatives.btcFundingPct8h >= 0.03) {
    themes.unshift("杠杆警示：上涨伴随费率偏热，多头拥挤度上升")
  }
  if (fng && fng.value >= 75) themes.unshift(`情绪过热：恐惧贪婪 ${fng.value}，处于贪婪高位`)
  if (fng && fng.value <= 25) themes.unshift(`情绪冰点：恐惧贪婪 ${fng.value}，历史上常对应阶段性底部区域`)

  const watch: string[] = []
  if (cross.derivatives && cross.derivatives.btcFundingPct8h >= 0.08)
    watch.push("费率过热：关注多头去杠杆引发的急跌，高杠杆多头仓需减仓或对冲")
  if (cross.derivatives && cross.derivatives.btcFundingPct8h <= -0.005)
    watch.push("负费率延续：空头持续付费，警惕轧空反弹")
  if (fng && fng.value >= 75) watch.push("贪婪极值区：情绪逆转往往从最拥挤处开始，追高需谨慎")
  if (fng && fng.value <= 25) watch.push("恐慌极值区：分批布局的胜率窗口，但需等待费率/广度确认")
  if (cross.stablecoin && cross.stablecoin.chg7d < -1)
    watch.push("稳定币 7d 收缩：场外资金退潮，反弹持续性存疑")
  if (domChgApprox > 0.5) watch.push("BTC 占比抬升：资金避险回流，山寨仓位宜降不宜加")
  if ((domChgApprox ?? 0) < -0.5 && cross.breadth && cross.breadth.altChg7d > 2)
    watch.push("占比回落 + 山寨领涨：risk-on 外溢进行中，注意情绪过热节奏")
  if (!watch.length) watch.push("无极值读数：维持当前立场，重点跟踪稳定币流入与费率是否延续")

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
    mcapChg24h: mcap24,
  }
}

/* ------------------------------ 判断历史与复盘 ------------------------------ */

export interface VerdictRecord {
  date: string
  stance: Stance
  composite: number
  mcapChg24h: number
  headline: string
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
  name: string
  value: number
  /** 加密总市值为实时值，其余为参考常量 */
  live?: boolean
}

/**
 * 参考锚为慢变常量（取自公开研究数据，asof 2026-09），仅用于体量对比；
 * 加密总市值为实时值，随行情刷新。
 */
export const MARKET_ANCHORS: MarketAnchor[] = [
  { key: "crypto", name: "加密总市值", value: -1, live: true },
  { key: "gold", name: "黄金", value: 31.13e12 },
  { key: "us_equity", name: "美股总市值", value: 64.26e12 },
  { key: "sp500", name: "标普 500", value: 52.95e12 },
  { key: "m2", name: "美国 M2", value: 23.22e12 },
  { key: "apple", name: "苹果公司", value: 4.75e12 },
]
