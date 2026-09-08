import { describe, expect, it } from "vitest"

import { distancePct, isTriggered } from "@/lib/alerts"

describe("isTriggered", () => {
  it("上穿：现价 ≥ 目标价触发（含等于）", () => {
    expect(isTriggered({ kind: "above", price: 100 }, 99.99)).toBe(false)
    expect(isTriggered({ kind: "above", price: 100 }, 100)).toBe(true)
    expect(isTriggered({ kind: "above", price: 100 }, 100.01)).toBe(true)
  })

  it("下穿：现价 ≤ 目标价触发（含等于）", () => {
    expect(isTriggered({ kind: "below", price: 100 }, 100.01)).toBe(false)
    expect(isTriggered({ kind: "below", price: 100 }, 100)).toBe(true)
    expect(isTriggered({ kind: "below", price: 100 }, 99.99)).toBe(true)
  })

  it("非有限价格一律不触发（脏数据防御）", () => {
    expect(isTriggered({ kind: "above", price: 100 }, NaN)).toBe(false)
    expect(isTriggered({ kind: "below", price: 100 }, NaN)).toBe(false)
    expect(isTriggered({ kind: "above", price: 100 }, Infinity)).toBe(false)
    expect(isTriggered({ kind: "below", price: 100 }, -Infinity)).toBe(false)
  })
})

describe("distancePct", () => {
  it("上穿距离为正：还需上涨的百分比", () => {
    expect(distancePct({ kind: "above", price: 110 }, 100)).toBeCloseTo(10, 6)
  })

  it("下穿距离为负：还需下跌的百分比", () => {
    expect(distancePct({ kind: "below", price: 90 }, 100)).toBeCloseTo(-10, 6)
  })

  it("无价格或非正价格返回 null", () => {
    expect(distancePct({ kind: "above", price: 110 }, NaN)).toBeNull()
    expect(distancePct({ kind: "above", price: 110 }, 0)).toBeNull()
  })
})
