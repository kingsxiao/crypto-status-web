// @vitest-environment jsdom
/**
 * useMarketData 数据底座测试 — 快照合并与请求代际（仿 realtime.test.ts 的先例）。
 *
 * fetchSnapshot 整体 mock（无需真实网络）：合并逻辑测「部分源失败沿用旧快照
 * 对应部分」；代际逻辑用手控 deferred 模拟乱序 —— 慢的旧响应在新快照落库后
 * 才返回，必须整个丢弃，不得回写旧数据与旧 lastUpdated。
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@repo/data/api", () => ({ fetchSnapshot: vi.fn() }))

import { useMarketData } from "../useMarketData"
import { fetchSnapshot, type Coin, type Snapshot } from "@repo/data/api"

function coin(id: string, price: number): Coin {
  return {
    id,
    symbol: id.slice(0, 3),
    name: id,
    image: "",
    current_price: price,
    market_cap: 1,
    market_cap_rank: 1,
    total_volume: 1,
    high_24h: price,
    low_24h: price,
    ath: price,
    ath_change_percentage: null,
    circulating_supply: 1,
  }
}

/** 可辨识快照：mcap 兼作 global 标记，chartLen 控制日线是否够 210 点 */
function snap(mcap: number, opts?: { coins?: Coin[]; fngLen?: number; chartLen?: number }): Snapshot {
  return {
    coins: opts?.coins ?? [coin("bitcoin", mcap)],
    global: {
      total_market_cap_usd: mcap,
      total_volume_usd: 1,
      market_cap_change_24h_pct: 0,
      btc_dominance: 50,
      eth_dominance: 10,
      active_cryptocurrencies: 1,
    },
    fng: Array.from({ length: opts?.fngLen ?? 1 }, (_, i) => ({
      value: 50,
      classification: "Neutral",
      timestamp: i,
    })),
    btcChart: {
      prices: Array.from({ length: opts?.chartLen ?? 220 }, (_, i) => [i, i] as [number, number]),
    },
    fetchedAt: mcap,
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("useMarketData", () => {
  it("部分数据源失败（coins 空 / fng 空 / 日线不足）沿用旧快照对应部分，其余取新值", async () => {
    const full = snap(111)
    const partial = snap(222, { coins: [], fngLen: 0, chartLen: 100 })
    vi.mocked(fetchSnapshot).mockResolvedValueOnce(full).mockResolvedValueOnce(partial)

    const { result } = renderHook(() => useMarketData())
    // 首次加载：无旧快照，原样落库
    await waitFor(() => expect(result.current.snapshot).toBe(full))

    await act(async () => {
      void result.current.refresh()
    })
    // 合并结果：coins/fng/btcChart 沿用旧快照（引用不变），global 取新值
    await waitFor(() => expect(result.current.snapshot?.global.total_market_cap_usd).toBe(222))
    expect(result.current.snapshot?.coins).toBe(full.coins)
    expect(result.current.snapshot?.fng).toBe(full.fng)
    expect(result.current.snapshot?.btcChart).toBe(full.btcChart)
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it("慢响应后到不覆盖新快照与 lastUpdated（请求代际守卫）", async () => {
    // 挂载首次加载走 d1（慢），紧接的手动刷新走 d2（后发先至）
    const d1 = deferred<Snapshot>()
    const d2 = deferred<Snapshot>()
    vi.mocked(fetchSnapshot).mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise)

    const { result } = renderHook(() => useMarketData())
    act(() => {
      void result.current.refresh()
    })

    const fresh = snap(222)
    await act(async () => {
      d2.resolve(fresh)
    })
    expect(result.current.snapshot).toBe(fresh)
    const stamped = result.current.lastUpdated
    expect(stamped).not.toBeNull()

    // 旧的慢响应此时才返回：代际已过期，快照与 lastUpdated 均不得被回写
    await act(async () => {
      d1.resolve(snap(111))
    })
    expect(result.current.snapshot).toBe(fresh)
    expect(result.current.lastUpdated).toBe(stamped)
  })
})
