import { describe, expect, it } from "vitest"

import { macd, rsi } from "@/lib/indicators"
import { autoFibonacci, bollSeries, emaSeries, kdjSeries, macdSeries, rsiSeries, smaSeries } from "@/lib/ta"

function ramp(n: number, start: number, step: number): number[] {
  return Array.from({ length: n }, (_, i) => start + i * step)
}

describe("smaSeries", () => {
  it("暖机期前置 null，之后为窗口均值", () => {
    const out = smaSeries([1, 2, 3, 4, 5], 3)
    expect(out).toEqual([null, null, 2, 3, 4])
  })
})

describe("emaSeries", () => {
  it("暖机期前置 null，种子为前 period 个值的 SMA", () => {
    const out = emaSeries([1, 2, 3, 4, 5], 3)
    expect(out.slice(0, 2)).toEqual([null, null])
    expect(out[2]).toBeCloseTo(2) // (1+2+3)/3
    // EMA 递推：k = 2/(3+1) = 0.5 → out[3] = 4*0.5 + 2*0.5 = 3
    expect(out[3]).toBeCloseTo(3)
  })
})

describe("rsiSeries 与点位版 rsi 一致", () => {
  it("暖期前置 null，末值与点位版 rsi() 相等", () => {
    const prices = [44, 44.3, 44.1, 44.5, 45, 44.8, 45.2, 44.9, 45.5, 45.3, 45.8, 45.1, 45.6, 46, 45.9, 46.2]
    const series = rsiSeries(prices, 14)
    expect(series[13]).toBeNull() // 前 period 个为暖期
    expect(series[14]).not.toBeNull() // 首个有效值在 index=period
    expect(series[15]).toBeCloseTo(rsi(prices) as number)
  })
})

describe("bollSeries", () => {
  it("中轨为 SMA，上下轨对称", () => {
    const values = ramp(30, 100, 1)
    const { mid, upper, lower } = bollSeries(values, 20, 2)
    const last = values.length - 1
    expect(mid[last]).toBeCloseTo(smaSeries(values, 20)[last] as number)
    expect(upper[last]).toBeGreaterThan(mid[last]!)
    expect(mid[last]).toBeGreaterThan(lower[last]!)
    // ±2σ 对称
    expect(upper[last]! - mid[last]!).toBeCloseTo(mid[last]! - lower[last]!)
  })
})

describe("macdSeries", () => {
  it("HIST = DIF − DEA，暖期对齐", () => {
    const values = ramp(60, 100, 2)
    const { dif, dea, hist } = macdSeries(values)
    for (let i = 25; i < values.length; i++) {
      expect(hist[i]).toBeCloseTo((dif[i] as number) - (dea[i] as number))
    }
    // 暖期（DIF 未定义前）DEA/HIST 均为 null
    expect(dea[24]).toBeNull()
    expect(hist[24]).toBeNull()
  })
  it("单边上涨时末值 DIF > 0，与点位版 macd 同向", () => {
    const values = ramp(60, 100, 2)
    const { dif } = macdSeries(values)
    expect(dif[values.length - 1]).toBeGreaterThan(0)
    expect(macd(values)!.dif).toBeGreaterThan(0)
  })
})

describe("kdjSeries", () => {
  it("全平序列 RSV=50 → K/D/J 均为 50", () => {
    const flat = new Array(20).fill(100)
    const { k, d, j } = kdjSeries(flat, flat, flat)
    expect(k[19]).toBeCloseTo(50)
    expect(d[19]).toBeCloseTo(50)
    expect(j[19]).toBeCloseTo(50)
  })
})

/** 高开低走/低开高走的简化K线：high=close+1、low=close-1 */
function fakeCandles(closes: number[]) {
  return closes.map((c) => ({ time: 0, open: c, high: c + 1, low: c - 1, close: c }))
}

describe("autoFibonacci", () => {
  it("低点在先高点在后 → 上涨波段：0% 在高点、100% 在低点", () => {
    // 最低 close=10（第2根），最高 close=50（第6根）
    const f = autoFibonacci(fakeCandles([20, 10, 30, 40, 45, 50, 48]))!
    expect(f.direction).toBe("up")
    expect(f.startPrice).toBe(9) // 最低K线的 low
    expect(f.endPrice).toBe(51) // 最高K线的 high
    expect(f.startIndex).toBe(1)
    expect(f.endIndex).toBe(5)
    const byRatio = new Map(f.levels.map((l) => [l.ratio, l.price]))
    expect(byRatio.get(0)).toBeCloseTo(51)
    expect(byRatio.get(1)).toBeCloseTo(9)
    expect(byRatio.get(0.5)).toBeCloseTo(30) // (51+9)/2
    expect(byRatio.get(0.618)).toBeCloseTo(51 - 42 * 0.618)
  })

  it("高点在先低点在后 → 下跌波段：0% 在低点、100% 在高点", () => {
    const f = autoFibonacci(fakeCandles([50, 40, 30, 10, 20, 25]))!
    expect(f.direction).toBe("down")
    expect(f.startPrice).toBe(51) // 最高K线的 high（第0根）
    expect(f.endPrice).toBe(9) // 最低K线的 low（第3根）
    expect(f.startIndex).toBe(0)
    expect(f.endIndex).toBe(3)
    expect(f.levels.find((l) => l.ratio === 0)!.price).toBeCloseTo(9)
    expect(f.levels.find((l) => l.ratio === 1)!.price).toBeCloseTo(51)
  })

  it("并列极值取最早出现的一根；七个档位顺序排列", () => {
    // 第2根与第6根 close 均为 50（high 51 并列）→ 取第2根
    const f = autoFibonacci(fakeCandles([20, 50, 50, 30, 40, 50, 45]))!
    expect(f.direction).toBe("up")
    expect(f.endIndex).toBe(1)
    expect(f.levels.map((l) => l.ratio)).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1])
  })

  it("数据不足或价格持平 → null", () => {
    expect(autoFibonacci([])).toBeNull()
    expect(autoFibonacci(fakeCandles([100, 100, 100]))).toBeNull()
  })
})
