import { describe, expect, it } from "vitest"

import {
  analyze,
  clamp,
  macd,
  rsi,
  scoreAthPosition,
  scoreCross,
  scoreMomentum,
  scoreRsi,
  scoreSentiment,
  scoreTrend,
  sma,
} from "@/lib/indicators"
import type { MarketChart } from "@/lib/api"

/** n 天线性走势（每日等差），step>0 上涨 / step<0 下跌 */
function ramp(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step)
}

function chartOf(prices: number[]): MarketChart {
  return { prices: prices.map((p, i) => [i * 86_400_000, p] as [number, number]) }
}

describe("sma", () => {
  it("返回末尾 period 个值的均值", () => {
    expect(sma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toBe(8)
  })
  it("长度不足时返回 null", () => {
    expect(sma([1, 2, 3, 4], 5)).toBeNull()
  })
})

describe("rsi (Wilder)", () => {
  it("单边上涨 → 100", () => {
    expect(rsi(ramp(30, 100, 1))).toBe(100)
  })
  it("单边下跌 → 0", () => {
    expect(rsi(ramp(30, 100, -1))).toBe(0)
  })
  it("长度不足返回 null", () => {
    expect(rsi([1, 2, 3], 14)).toBeNull()
  })
})

describe("macd", () => {
  it("长度不足 35 返回 null", () => {
    expect(macd(ramp(34, 100, 1))).toBeNull()
  })
  it("单边上涨时 DIF > 0（快线在慢线上方）", () => {
    const m = macd(ramp(60, 100, 2))
    expect(m).not.toBeNull()
    expect(m!.dif).toBeGreaterThan(0)
  })
})

describe("clamp / 评分函数边界", () => {
  it("clamp", () => {
    expect(clamp(5, -2, 2)).toBe(2)
    expect(clamp(-5, -2, 2)).toBe(-2)
    expect(clamp(1, -2, 2)).toBe(1)
  })

  it("scoreTrend：偏离 /0.18 归一，±36% 打满 ±2", () => {
    expect(scoreTrend(118, 100).score).toBeCloseTo(1) // +18% → 1
    expect(scoreTrend(136, 100).score).toBeCloseTo(2) // +36% → 打满
    expect(scoreTrend(82, 100).score).toBeCloseTo(-1)
    expect(scoreTrend(100, 100).score).toBe(0)
  })

  it("scoreCross：偏离 /0.1 归一，±20% 打满 ±2", () => {
    expect(scoreCross(110, 100).score).toBeCloseTo(1) // +10% → 1
    expect(scoreCross(120, 100).score).toBeCloseTo(2) // +20% → 打满
    expect(scoreCross(90, 100).score).toBeCloseTo(-1)
  })

  it("scoreRsi 分段", () => {
    expect(scoreRsi(75)).toBe(-1) // 超买逆势减分
    expect(scoreRsi(60)).toBe(1.5)
    expect(scoreRsi(50)).toBe(1)
    expect(scoreRsi(45)).toBe(0)
    expect(scoreRsi(35)).toBe(-0.5)
    expect(scoreRsi(25)).toBe(-1.5)
    expect(scoreRsi(10)).toBe(0.5) // 超卖逆势加分
  })

  it("scoreSentiment 逆向计分", () => {
    expect(scoreSentiment(20)).toBe(2)
    expect(scoreSentiment(40)).toBe(1)
    expect(scoreSentiment(50)).toBe(0)
    expect(scoreSentiment(70)).toBe(-1)
    expect(scoreSentiment(80)).toBe(-2)
  })

  it("scoreAthPosition 按回撤深度", () => {
    expect(scoreAthPosition(-5)).toBe(1.5)
    expect(scoreAthPosition(-20)).toBe(1)
    expect(scoreAthPosition(-40)).toBe(-0.5)
    expect(scoreAthPosition(-60)).toBe(-1.5)
    expect(scoreAthPosition(-70)).toBe(-2)
  })

  it("scoreMomentum：7D×0.4 + 30D×0.6 归一", () => {
    expect(scoreMomentum(10, 10)).toBeCloseTo((10 * 0.4 + 10 * 0.6) / 15 * 1, 5)
    expect(scoreMomentum(100, 100)).toBe(2) // 打满
  })
})

describe("analyze", () => {
  it("数据不足 210 天返回 null", () => {
    expect(analyze(chartOf(ramp(209, 100, 1)), [])).toBeNull()
  })

  it("单边上涨 → 牛市结构，综合分看多", () => {
    const a = analyze(chartOf(ramp(250, 100, 2)), [])
    expect(a).not.toBeNull()
    expect(a!.regime.state).toBe("bull")
    expect(a!.composite).toBeGreaterThan(0)
    expect(a!.signal.level).toBe("strong-long")
    expect(a!.btc.price).toBe(100 + 249 * 2)
  })

  it("单边下跌 → 熊市结构，综合分看空", () => {
    const a = analyze(chartOf(ramp(250, 1000, -2)), [])
    expect(a).not.toBeNull()
    expect(a!.regime.state).toBe("bear")
    expect(a!.composite).toBeLessThan(0)
    expect(a!.signal.level).toBe("strong-short")
  })

  it("复合区间与结构字段完整", () => {
    const a = analyze(chartOf(ramp(250, 100, 1)), [{ value: 50, classification: "Neutral", timestamp: 0 }])
    expect(a).not.toBeNull()
    expect(a!.composite).toBeGreaterThanOrEqual(-100)
    expect(a!.composite).toBeLessThanOrEqual(100)
    expect(a!.indicators.length).toBeGreaterThanOrEqual(6)
    // 权重为正且总权重大于 0
    const wSum = a!.indicators.reduce((s, i) => s + i.weight, 0)
    expect(wSum).toBeGreaterThan(0)
    // 周期持续天数至少含当日
    expect(a!.regime.days).toBeGreaterThanOrEqual(1)
  })
})
