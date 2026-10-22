// @vitest-environment jsdom
/**
 * LivePrice 闪动状态机（price-cells.tsx）的行为锁定：
 *  - 价格上涨/下跌 → flash-up / flash-down 类名，900ms 后自动复位
 *  - 价格持平（含重复渲染同值）不闪动
 * 行情页/持仓页所有实时价单元格共用该组件，闪动语义回归会直接影响读数体验。
 */
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LivePrice } from "@/components/price-cells"

function flashClassOf(el: HTMLElement): string | null {
  if (el.classList.contains("flash-up")) return "flash-up"
  if (el.classList.contains("flash-down")) return "flash-down"
  return null
}

describe("LivePrice 闪动状态机", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it("初始渲染与价格持平不闪动", () => {
    const { container, rerender } = render(<LivePrice price={100} />)
    const cell = container.querySelector("span")!
    expect(flashClassOf(cell)).toBeNull()

    rerender(<LivePrice price={100} />) // 同值重渲染
    expect(flashClassOf(cell)).toBeNull()
  })

  it("价格上涨 → flash-up，900ms 后复位", () => {
    const { container, rerender } = render(<LivePrice price={100} />)
    const cell = () => container.querySelector("span")!

    rerender(<LivePrice price={100.5} />)
    expect(flashClassOf(cell())).toBe("flash-up")
    expect(cell().className).toContain("text-up")

    act(() => {
      vi.advanceTimersByTime(899)
    })
    expect(flashClassOf(cell())).toBe("flash-up") // 渐隐窗口未结束
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(flashClassOf(cell())).toBeNull() // 900ms 整点复位
  })

  it("价格下跌 → flash-down，900ms 后复位", () => {
    const { container, rerender } = render(<LivePrice price={100} />)
    const cell = () => container.querySelector("span")!

    rerender(<LivePrice price={99.5} />)
    expect(flashClassOf(cell())).toBe("flash-down")
    expect(cell().className).toContain("text-down")

    act(() => {
      vi.advanceTimersByTime(900)
    })
    expect(flashClassOf(cell())).toBeNull()
  })

  it("闪动窗口内反向变动：旧定时器被清理，闪动方向跟随最新价", () => {
    const { container, rerender } = render(<LivePrice price={100} />)
    const cell = () => container.querySelector("span")!

    rerender(<LivePrice price={101} />)
    expect(flashClassOf(cell())).toBe("flash-up")

    act(() => {
      vi.advanceTimersByTime(400) // t=400：未满 900ms 即反向
    })
    rerender(<LivePrice price={100} />)
    expect(flashClassOf(cell())).toBe("flash-down")

    // t=900 是首次变动（已清理）的旧定时器到点：若清理失效会在此提前复位
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(flashClassOf(cell())).toBe("flash-down")

    // t=1300：反向变动自己的 900ms 计时到点，正常复位
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(flashClassOf(cell())).toBeNull()
  })
})
