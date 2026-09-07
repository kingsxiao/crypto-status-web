import { describe, expect, it } from "vitest"

import { analyzeCoin, compositeOf, verdictOfComposite, verdictOfScore } from "@/lib/coinAnalysis"

function ramp(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step)
}

describe("verdictOfScore 边界", () => {
  it("1.2 / 0.25 / -0.25 / -1.2 四条分界", () => {
    expect(verdictOfScore(1.2).level).toBe("long")
    expect(verdictOfScore(0.25).level).toBe("leanLong")
    expect(verdictOfScore(0).level).toBe("neutral")
    expect(verdictOfScore(-0.25).level).toBe("leanShort")
    expect(verdictOfScore(-1.2).level).toBe("short")
    expect(verdictOfScore(2).tone).toBe("bull")
    expect(verdictOfScore(-2).tone).toBe("bear")
  })
})

describe("verdictOfComposite 分档", () => {
  it("±40 / ±15 阈值", () => {
    expect(verdictOfComposite(40).level).toBe("strong-long")
    expect(verdictOfComposite(39).level).toBe("long")
    expect(verdictOfComposite(15).level).toBe("long")
    expect(verdictOfComposite(14).level).toBe("neutral")
    expect(verdictOfComposite(-16).level).toBe("short")
    expect(verdictOfComposite(-40).level).toBe("strong-short") // 闭边界归强档
    expect(verdictOfComposite(-39).level).toBe("short")
  })
})

describe("analyzeCoin", () => {
  it("不足 60 天返回 null", () => {
    expect(analyzeCoin(ramp(59, 100, 1), null)).toBeNull()
  })

  it("单边上涨 + 无量能：综合分看多，指标不含量价项", () => {
    const a = analyzeCoin(ramp(365, 100, 1), null)
    expect(a).not.toBeNull()
    expect(a!.composite).toBeGreaterThan(0)
    expect(a!.verdict.level === "long" || a!.verdict.level === "strong-long").toBe(true)
    expect(a!.indicators.some((i) => i.key === "volume")).toBe(false)
    // 计数守恒：看多+中性+看空 = 指标总数
    const c = a!.counts
    expect(c.bull + c.neutral + c.bear).toBe(a!.indicators.length)
  })

  it("单边下跌：综合分看空", () => {
    const a = analyzeCoin(ramp(365, 1000, -1), null)
    expect(a!.composite).toBeLessThan(0)
  })

  it("含有效量能时纳入量价指标（8 项）", () => {
    const closes = ramp(365, 100, 1)
    const volumes = ramp(365, 1000, 0) // 恒定量 → 量比 1，温和配合
    const a = analyzeCoin(closes, volumes)
    expect(a!.indicators).toHaveLength(8)
    expect(a!.indicators.find((i) => i.key === "volume")).toBeDefined()
  })

  it("MA200 数据不足时记入缺失说明", () => {
    const a = analyzeCoin(ramp(80, 100, 1), null)
    expect(a).not.toBeNull()
    expect(a!.note?.missing).toContain("coin.miss.ma200")
  })
})

describe("compositeOf", () => {
  it("空列表返回 null；加权口径与指标一致", () => {
    expect(compositeOf([])).toBeNull()
    const a = analyzeCoin(ramp(365, 100, 1), null)!
    // 用其全部指标重算，应与 analyzeCoin 的 composite 相同
    expect(compositeOf(a.indicators)).toBe(a.composite)
  })
})
