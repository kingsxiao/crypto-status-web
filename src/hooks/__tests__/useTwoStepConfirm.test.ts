// @vitest-environment jsdom
/**
 * 两步破坏性确认 hook 的行为锁定：
 *  - 首点武装返回 false，武装态下同 key 再点返回 true（应执行删除）
 *  - 武装 2.6s 后自动复位；复位后再点是重新武装而非直接确认
 *  - 双实例各自持有定时器：后武装的实例不会顶掉先武装实例的复位窗口
 *    （持仓页删除/清空两个入口共用一个实例时正是这个 bug）
 */
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useTwoStepConfirm } from "@/hooks/useTwoStepConfirm"

describe("useTwoStepConfirm", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it("首点武装返回 false，同 key 再点返回 true 并解除武装", () => {
    const { result } = renderHook(() => useTwoStepConfirm<string>())
    expect(result.current.armed).toBeNull()

    let confirmed = false
    act(() => {
      confirmed = result.current.confirm("btc")
    })
    expect(confirmed).toBe(false)
    expect(result.current.armed).toBe("btc")

    act(() => {
      confirmed = result.current.confirm("btc")
    })
    expect(confirmed).toBe(true)
    expect(result.current.armed).toBeNull() // 确认后立即解除
  })

  it("武装后 2.6s 超时自动复位；复位后再点是重新武装", () => {
    const { result } = renderHook(() => useTwoStepConfirm<string>())
    act(() => {
      result.current.confirm("eth")
    })
    expect(result.current.armed).toBe("eth")

    act(() => {
      vi.advanceTimersByTime(2599)
    })
    expect(result.current.armed).toBe("eth") // 未到窗口仍武装

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.armed).toBeNull() // 2600ms 整点复位

    let confirmed = true
    act(() => {
      confirmed = result.current.confirm("eth")
    })
    expect(confirmed).toBe(false) // 复位后同 key 再点是重新武装
  })

  it("双实例定时器互不串扰：后武装者不顶掉先武装者的复位窗口", () => {
    const a = renderHook(() => useTwoStepConfirm<string>())
    const b = renderHook(() => useTwoStepConfirm<string>())

    act(() => {
      a.result.current.confirm("x")
    })
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    act(() => {
      b.result.current.confirm("y") // 1s 后另一入口武装
    })
    expect(a.result.current.armed).toBe("x")
    expect(b.result.current.armed).toBe("y")

    // 距 a 武装满 2.6s：a 按自己的定时器复位，b 仍武装
    act(() => {
      vi.advanceTimersByTime(1600)
    })
    expect(a.result.current.armed).toBeNull()
    expect(b.result.current.armed).toBe("y")

    // b 按自己的时刻（再 1s）复位
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(b.result.current.armed).toBeNull()
  })
})
