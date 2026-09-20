/**
 * CoinGecko 统一出口（cg.ts）的行为锁定：
 *  - 同 URL in-flight 去重：并发的相同请求共享一个 Promise，只发一次 fetch
 *  - 429 限流退避 2s 重试一次；非 429 错误与重试后仍 429 直接抛给降级路径
 * CG 免费档共享预算，这里的去重/退避一旦回归会直接放大限流。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fetchCG } from "@/lib/cg"

/** fetchJSON 只消费 ok / status / json()，用手写响应对象即可（不依赖 Response） */
function okResp<T>(data: T) {
  return { ok: true, status: 200, json: async () => data }
}
function statusResp(status: number) {
  return { ok: false, status, json: async () => ({}) }
}

describe("fetchCG", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it("同参并发只发一次请求（in-flight 去重），结果共享", async () => {
    // 手动放行首个请求，保证三个调用确实处于同一 in-flight 窗口内
    let release!: (v: unknown) => void
    const gate = new Promise((res) => {
      release = res
    })
    fetchMock.mockImplementation(() => gate.then(() => okResp({ v: 1 })))

    const p1 = fetchCG("/coins/markets?ids=bitcoin")
    const p2 = fetchCG("/coins/markets?ids=bitcoin")
    const p3 = fetchCG("/coins/markets?ids=bitcoin")
    expect(fetchMock).toHaveBeenCalledTimes(1) // 后两个并入首个 in-flight

    release(undefined)
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([{ v: 1 }, { v: 1 }, { v: 1 }])
  })

  it("不同 path 不互相去重；请求结束后 in-flight 清空，再调会重新发请求", async () => {
    fetchMock.mockImplementation(async () => okResp({ ok: true }))
    await Promise.all([fetchCG("/a"), fetchCG("/b")])
    expect(fetchMock).toHaveBeenCalledTimes(2)

    await fetchCG("/a") // 首个已 settle 并从 in-flight 删除
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("429 退避 2s 后重试一次并成功（fake timers）", async () => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce(statusResp(429))
      .mockResolvedValueOnce(okResp({ recovered: true }))

    const p = fetchCG("/limited")
    // 退避未到：不得提前重试
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // 2s 到点：恰好重试一次并拿到重试结果
    await vi.advanceTimersByTimeAsync(1)
    await expect(p).resolves.toEqual({ recovered: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("重试后仍 429 → 抛错交由调用方降级，且只重试一次", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(statusResp(429))

    const p = fetchCG("/still-limited")
    // 先挂上 rejection 断言再推进时间：否则重试失败到断言之间隔着一个
    // 微任务批次，Node 会先报 unhandled rejection
    const rejection = expect(p).rejects.toMatchObject({ status: 429 })
    await vi.advanceTimersByTimeAsync(2000)
    await rejection
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("非 429 错误不重试，直接抛出", async () => {
    fetchMock.mockResolvedValue(statusResp(500))
    await expect(fetchCG("/boom")).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
