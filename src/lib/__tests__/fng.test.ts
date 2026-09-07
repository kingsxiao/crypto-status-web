import { describe, expect, it } from "vitest"

import { FNG_GRADIENT, fngShade, fngZh } from "@/lib/fng"

describe("fngZh", () => {
  it("五种官方分类的中文映射", () => {
    expect(fngZh("Extreme Fear")).toBe("极度恐惧")
    expect(fngZh("Fear")).toBe("恐惧")
    expect(fngZh("Neutral")).toBe("中性")
    expect(fngZh("Greed")).toBe("贪婪")
    expect(fngZh("Extreme Greed")).toBe("极度贪婪")
  })
  it("未知分类原样返回（数据源升级时不至于空白）", () => {
    expect(fngZh("Whatever")).toBe("Whatever")
  })
})

describe("fngShade 区间配色", () => {
  it("五段各持一色且贪婪段与恐惧段不同", () => {
    const shades = [10, 30, 50, 60, 90].map(fngShade)
    expect(new Set(shades).size).toBe(5)
  })
})

describe("FNG_GRADIENT", () => {
  it("为固定渐变字符串（红→绿）", () => {
    expect(FNG_GRADIENT.startsWith("linear-gradient(90deg")).toBe(true)
  })
})
