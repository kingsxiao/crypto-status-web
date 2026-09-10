/**
 * 跨资产数据获取 — 三源并行拉取 + TTL 缓存：
 *  - Defillama stablecoins : 稳定币总市值与 24h/7d/30d 变化
 *  - Binance fapi          : BTC/ETH 资金费率（8h）、多空账户比（日频）
 *  - CoinGecko markets     : top50 市值加权 7d 动量与涨跌家数
 * 单一来源失败不影响其余来源（settle 置 null，渲染层给缺失提示）。
 */

import { fetchCG } from "@/lib/cg"
import { fetchJSON } from "@/lib/http"

const LLAMA = "https://stablecoins.llama.fi"
const FAPI = "https://fapi.binance.com"

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
  const path =
    `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1` +
    `&price_change_percentage=7d`
  return fetchCG<MarketRow[]>(path).then((rows) => {
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
  // 注：CoinGecko 间歇限流的重试由 fetchCG 统一退避治理，此处不再手工重试
}

/* ------------------- 缓存（TTL + 后台刷新 + 并发去重） ------------------- */

/** 跨资产请求重（Defillama 稳定币全史 + fapi×3 + CG top50），TTL 内路由往返复用 */
const CROSS_TTL_MS = 5 * 60_000
let crossCache: CrossAssetData | null = null
let crossRevalidating: Promise<CrossAssetData> | null = null

function revalidateCross(): Promise<CrossAssetData> {
  if (crossRevalidating) return crossRevalidating
  crossRevalidating = (async () => {
    const [stablecoin, derivatives, breadth] = await Promise.all([
      settle(fetchStablecoin()),
      settle(fetchDerivatives()),
      settle(fetchBreadth()),
    ])
    const data: CrossAssetData = { fetchedAt: Date.now(), stablecoin, derivatives, breadth }
    // 全源失败（网络抖动等）不落缓存，下次挂载照常重试
    if (stablecoin || derivatives || breadth) crossCache = data
    return data
  })().finally(() => {
    crossRevalidating = null
  })
  return crossRevalidating
}

/**
 * 带缓存的跨资产拉取：
 *  - TTL 内直接复用缓存，不发起网络请求
 *  - 缓存过期时立即返回旧值（页面先行渲染），后台刷新完成后经 onRefresh 送达新值
 *  - force=true 跳过缓存强制刷新（手动刷新按钮）
 *  - 并发调用共享同一次网络请求
 * 离开页面不 abort：后台完成的请求会填充缓存，供下次挂载即时复用。
 */
export async function fetchCrossAsset(
  opts?: { force?: boolean; onRefresh?: (d: CrossAssetData) => void }
): Promise<CrossAssetData> {
  if (!opts?.force) {
    if (crossCache && Date.now() - crossCache.fetchedAt < CROSS_TTL_MS) return crossCache
    if (crossCache) {
      void revalidateCross().then((d) => opts?.onRefresh?.(d))
      return crossCache
    }
  }
  return revalidateCross()
}
