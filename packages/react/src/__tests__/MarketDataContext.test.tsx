// @vitest-environment jsdom
/**
 * MarketDataContext 实时价采样回填（MarketDataContext.tsx:56-75）的行为锁定：
 *  - 每秒更新的实时价只进 liveBtcRef，按 5s 采样节流后才回填最后一根日线
 *  - 回填只替换末点价格、时间戳与前置点位不动
 *  - 采样值无变化时保持原引用（下游 useMemo 不重算）
 *  - useLive() 直通 tickers（高频路），useMarket() 拿到 patchedChart（低频路）
 */
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEffect, type ReactNode } from "react"

import { MarketDataProvider, useLive, useMarket } from "../MarketDataContext"
import type { Snapshot } from "@repo/data/api"
import type { FeedStatus, LiveTicker } from "@repo/data/realtime-source"

/* ---------------------- mock：useMarketData 与实时推送 ---------------------- */

const BTC_CHART = {
  prices: [
    [1000, 100],
    [2000, 101],
    [3000, 102],
  ] as [number, number][],
}

const snapshot: Snapshot = {
  coins: [
    {
      id: "bitcoin", symbol: "btc", name: "Bitcoin", image: "",
      current_price: 102, market_cap: 1, market_cap_rank: 1, total_volume: 1,
      high_24h: 1, low_24h: 1, ath: 1, ath_change_percentage: null,
      circulating_supply: 1,
    },
  ],
  global: {
    total_market_cap_usd: 1, total_volume_usd: 1, market_cap_change_24h_pct: 0,
    btc_dominance: 1, eth_dominance: 1, active_cryptocurrencies: 1,
  },
  fng: [],
  btcChart: BTC_CHART,
  fetchedAt: 0,
}

vi.mock("@repo/react/useMarketData", () => ({
  useMarketData: () => ({
    snapshot,
    error: null,
    loading: false,
    refreshing: false,
    lastUpdated: 0,
    refresh: () => {},
  }),
}))

/** 测试驱动的实时 tickers：重赋值 + 重渲染 Provider 即一次「推送」 */
let mockTickers: Record<string, LiveTicker> = {}
vi.mock("@repo/data/realtime-source", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@repo/data/realtime-source")>()),
  TRADE_SYMBOLS: { bitcoin: { binance: "BTCUSDT", okx: "BTC-USDT" } },
}))
vi.mock("@repo/react/useRealtime", () => ({
  useRealtime: () => ({
    tickers: mockTickers,
    status: { mode: "live", source: "binance" } satisfies FeedStatus,
  }),
}))

/* ------------------------------ 探针组件 ------------------------------ */

const seen: { patched: typeof BTC_CHART | null; livePrice: number | undefined } = {
  patched: null,
  livePrice: undefined,
}
/** 渲染值经 effect 落到外部镜像（render 阶段直接写外部变量会被
 *  react-hooks/immutability 拦下；断言都发生在 act 之后，采集已就绪） */
function Probe() {
  const m = useMarket()
  const live = useLive()
  useEffect(() => {
    seen.patched = m.patchedChart
    seen.livePrice = live.bitcoin?.price
  })
  return null
}

function ui(): ReactNode {
  return (
    <MarketDataProvider>
      <Probe />
    </MarketDataProvider>
  )
}

describe("MarketDataContext 实时价 5s 采样回填", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockTickers = {}
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it("无实时价时 patchedChart 原样退回快照日线", () => {
    render(ui())
    expect(seen.patched).toBe(BTC_CHART) // 同引用：未发生回填
  })

  it("实时价到达后：5s 采样回填末根日线，只替换末点价格", async () => {
    const { rerender } = render(ui())
    mockTickers = {
      bitcoin: { price: 98765, changePct: 1, high: null, low: null, quoteVolume: null, ts: 0 },
    }
    rerender(ui())
    expect(seen.livePrice).toBe(98765) // useLive 高频路即时直通
    expect(seen.patched).toBe(BTC_CHART) // 采样未到，尚未回填

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4999)
    })
    expect(seen.patched).toBe(BTC_CHART) // 5s 节流窗口内仍不回填

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(seen.patched).not.toBe(BTC_CHART) // 采样到点，重建走势
    expect(seen.patched!.prices).toHaveLength(3)
    expect(seen.patched!.prices[2]).toEqual([3000, 98765]) // 末点换实时价
    expect(seen.patched!.prices[0]).toEqual([1000, 100]) // 前置点位原样
    expect(seen.patched!.prices[1]).toEqual([2000, 101])
  })

  it("采样值无变化时保持原引用（下游 useMemo 不重算）", async () => {
    const { rerender } = render(ui())
    mockTickers = {
      bitcoin: { price: 555, changePct: 0, high: null, low: null, quoteVolume: null, ts: 0 },
    }
    rerender(ui())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    const afterFirstSample = seen.patched
    expect(afterFirstSample!.prices[2]).toEqual([3000, 555])

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000) // 又一个采样周期，值未变
    })
    expect(seen.patched).toBe(afterFirstSample) // 引用稳定
  })
})
