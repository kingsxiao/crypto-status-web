// @vitest-environment jsdom
/**
 * useRealtime 三级容错状态机测试。
 *
 * FakeWS 的 close() 用 0ms 定时器异步派发 onclose —— 贴合浏览器语义
 * （close() 从不同步触发 onclose）。若改成同步派发，8s 超时路径里
 * 旧连接的 onclose 会在代际递增前抢跑调度重连，测出的就是另一个状态机。
 */
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useRealtime } from "@/lib/realtime"

class FakeWS {
  static instances: FakeWS[] = []
  url: string
  closed = false
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWS.instances.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    if (this.closed) return
    this.closed = true
    setTimeout(() => this.onclose?.(), 0)
  }
  /** 测试侧模拟服务器推流 */
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

const SYMBOLS = { bitcoin: { binance: "BTCUSDT", okx: "BTC-USDT" } }

beforeEach(() => {
  vi.useFakeTimers()
  FakeWS.instances = []
  vi.stubGlobal("WebSocket", FakeWS as unknown as typeof WebSocket)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("useRealtime", () => {
  it("Binance 推流：消息解析 + 1s 节流批量刷新 + live/binance 状态", () => {
    const { result } = renderHook(() => useRealtime(SYMBOLS))
    const binance = FakeWS.instances.at(-1)!
    expect(binance.url).toContain("stream.binance.com:9443/stream")
    expect(binance.url).toContain("btcusdt@miniTicker")

    act(() => {
      binance.onopen?.()
      binance.emit({
        data: { s: "BTCUSDT", c: "50000", o: "49000", h: "50100", l: "48900", q: "1234", E: 1700000000000 },
      })
    })
    // 未到节流窗口（1s）前不刷新 state
    expect(result.current.tickers.bitcoin).toBeUndefined()

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.status).toEqual({ mode: "live", source: "binance" })
    const t = result.current.tickers.bitcoin!
    expect(t.price).toBe(50000)
    expect(t.changePct).toBeCloseTo(((50000 - 49000) / 49000) * 100, 5)
    expect(t.high).toBe(50100)
    expect(t.low).toBe(48900)
    expect(t.quoteVolume).toBe(1234)
    expect(t.ts).toBe(1700000000000)
  })

  it("Binance 8s 无消息 → 降级 OKX：订阅 tickers 频道，旧连接不泄漏不复活", () => {
    const { result } = renderHook(() => useRealtime(SYMBOLS))
    const binance = FakeWS.instances[0]
    act(() => {
      binance.onopen?.()
      vi.advanceTimersByTime(8000)
    })

    const okx = FakeWS.instances.at(-1)!
    expect(okx.url).toContain("ws.okx.com")
    // 旧 binance 已关闭，且超时路径没有额外调度重连（代际守卫生效）
    expect(binance.closed).toBe(true)
    expect(FakeWS.instances.filter((w) => !w.closed)).toHaveLength(1)

    act(() => {
      okx.onopen?.()
      okx.emit({
        arg: { channel: "tickers" },
        data: [
          {
            instId: "BTC-USDT",
            last: "51000",
            open24h: "50000",
            high24h: "51500",
            low24h: "49500",
            volCcy24h: "999",
            ts: "1700000000001",
          },
        ],
      })
      vi.advanceTimersByTime(1000)
    })
    expect(okx.sent[0]).toMatchObject({
      op: "subscribe",
      args: [{ channel: "tickers", instId: "BTC-USDT" }],
    })
    expect(result.current.status).toEqual({ mode: "live", source: "okx" })
    expect(result.current.tickers.bitcoin!.price).toBe(51000)
  })

  it("活跃中断：原源（Binance）重试 3 次仍失败后降级 OKX", () => {
    renderHook(() => useRealtime(SYMBOLS))
    const ws0 = FakeWS.instances[0]
    // 先推一条消息确立 live，再模拟服务端断开
    act(() => {
      ws0.onopen?.()
      ws0.emit({ data: { s: "BTCUSDT", c: "50000", o: "49000" } })
      vi.advanceTimersByTime(0) // 冲掉 close 的 0ms 定时器排队
    })

    // 三次重试：1500 / 3000 / 4500ms 退避，每次都新建 Binance 连接
    act(() => {
      ws0.close()
      vi.advanceTimersByTime(1500)
    })
    const r1 = FakeWS.instances.at(-1)!
    expect(r1.url).toContain("stream.binance.com")
    act(() => {
      r1.close()
      vi.advanceTimersByTime(3000)
    })
    const r2 = FakeWS.instances.at(-1)!
    expect(r2.url).toContain("stream.binance.com")
    act(() => {
      r2.close()
      vi.advanceTimersByTime(4500)
    })
    const r3 = FakeWS.instances.at(-1)!
    expect(r3.url).toContain("stream.binance.com")
    // 第三次失败后：不再原源重试，降级 OKX
    act(() => {
      r3.close()
      vi.advanceTimersByTime(0)
    })
    const okx = FakeWS.instances.at(-1)!
    expect(okx.url).toContain("ws.okx.com")
  })

  it("WS 不可用 → Binance REST 轮询兜底", async () => {
    vi.stubGlobal(
      "WebSocket",
      class {
        constructor() {
          throw new Error("no websocket")
        }
      },
    )
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            symbol: "BTCUSDT",
            lastPrice: "48000",
            priceChangePercent: "1.5",
            highPrice: "48500",
            lowPrice: "47500",
            quoteVolume: "2000",
          },
        ]),
    })
    vi.stubGlobal("fetch", fetchMock)

    const { result } = renderHook(() => useRealtime(SYMBOLS))
    // startPolling 内首次 poll 是异步的：冲微任务后再断言
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.status).toEqual({ mode: "polling" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toContain("api.binance.com/api/v3/ticker/24hr")

    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.tickers.bitcoin!.price).toBe(48000)
    expect(result.current.tickers.bitcoin!.changePct).toBe(1.5)

    // 轮询周期 20s
    act(() => vi.advanceTimersByTime(20_000))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
