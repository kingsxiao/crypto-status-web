/**
 * 全局行情上下文 — 在应用根部挂载一次：
 *   - CoinGecko 快照（90s 轮询 + 手动刷新）
 *   - Binance/OKX WebSocket 实时推送
 *   - 实时 BTC 回填日线后的指标分析（analyze 只算一次，全站复用）
 *
 * 页面切换不会销毁数据流，避免重复请求与闪烁。
 *
 * 上下文按更新频率拆成两路，避免高频推送拖累整站渲染：
 *   - MarketDataContext（低频）：快照 / 分析 / 连接状态，随 90s 轮询与节流刷新变化
 *   - LiveContext（高频）：实时 ticker，每秒批量刷新一次
 * 消费实时价请用 useLive()，其余用 useMarket()。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { useMarketData } from "@/hooks/useMarketData"
import { analyze, type Analysis } from "@/lib/indicators"
import type { MarketChart } from "@/lib/api"
import { TRADE_SYMBOLS, useRealtime, type FeedStatus, type LiveTicker } from "@/lib/realtime"

/** 实时价回填日线的节流间隔：日线图与指标读数无需秒级刷新 */
const PATCH_INTERVAL_MS = 5_000

type MarketDataState = ReturnType<typeof useMarketData> & {
  feedStatus: FeedStatus
  /** 实时 BTC 价格回填最后一根日线后的走势（无实时价时退回原始数据） */
  patchedChart: MarketChart | null
  analysis: Analysis | null
}

const EMPTY_TICKERS: Record<string, LiveTicker> = {}

const MarketDataContext = createContext<MarketDataState | null>(null)
const LiveContext = createContext<Record<string, LiveTicker>>(EMPTY_TICKERS)

export function MarketDataProvider({ children }: { children: ReactNode }) {
  const market = useMarketData()
  const { tickers, status } = useRealtime(TRADE_SYMBOLS)
  const { snapshot } = market

  // 每秒更新的实时价只进 ref；图表回填与指标分析按 PATCH_INTERVAL_MS 采样，
  // 避免 365 点数组与全套指标每秒重建。（ref 写入放 effect：render 阶段写 ref
  // 在并发渲染下可能被丢弃。）
  const liveBtcRef = useRef<number | null>(null)
  const [liveBtcSampled, setLiveBtcSampled] = useState<number | null>(null)

  useEffect(() => {
    liveBtcRef.current = tickers.bitcoin?.price ?? null
  }, [tickers])

  useEffect(() => {
    const t = setInterval(() => {
      // 采样值无变化时保持原引用，下游 useMemo 不重算
      setLiveBtcSampled((prev) => (liveBtcRef.current === prev ? prev : liveBtcRef.current))
    }, PATCH_INTERVAL_MS)
    return () => clearInterval(t)
  }, [])

  const patchedChart = useMemo(() => {
    if (!snapshot) return null
    if (!liveBtcSampled) return snapshot.btcChart
    const prices = snapshot.btcChart.prices.map((p, i, a) =>
      i === a.length - 1 ? ([p[0], liveBtcSampled] as [number, number]) : p
    )
    return { ...snapshot.btcChart, prices }
  }, [snapshot, liveBtcSampled])

  const analysis = useMemo(() => {
    if (!snapshot || !patchedChart) return null
    // 传入 CoinGecko 全史 ATH，避免熊市里用一年窗口高点冒充历史高点
    const btcAth = snapshot.coins.find((c) => c.id === "bitcoin")?.ath
    return analyze(patchedChart, snapshot.fng, btcAth)
  }, [snapshot, patchedChart])

  const marketValue = useMemo(
    () => ({
      ...market,
      feedStatus: status,
      patchedChart,
      analysis,
    }),
    [market, status, patchedChart, analysis]
  )

  return (
    <MarketDataContext.Provider value={marketValue}>
      <LiveContext.Provider value={tickers}>{children}</LiveContext.Provider>
    </MarketDataContext.Provider>
  )
}

export function useMarket(): MarketDataState {
  const ctx = useContext(MarketDataContext)
  if (!ctx) throw new Error("useMarket 必须在 MarketDataProvider 内使用")
  return ctx
}

/** 实时行情（每秒刷新）。只给真正展示实时价的组件用，避免整站跟着重渲染 */
export function useLive(): Record<string, LiveTicker> {
  return useContext(LiveContext)
}
