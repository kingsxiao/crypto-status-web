import { describe, expect, it } from "vitest"

import { formatPct, formatPrice, formatTime, formatUsdCompact, formatWatchTitle } from "@/lib/format"
import { mergeLiveTick } from "@/lib/kline"
import { toNum } from "@/lib/http"

describe("formatPrice 自适应位数", () => {
  it("千位以上 2 位小数带分节", () => {
    expect(formatPrice(1234.5)).toBe("1,234.50")
  })
  it("1 以上 2 位", () => {
    expect(formatPrice(0.5 + 1)).toBe("1.50")
  })
  it("0.01 档 4 位", () => {
    expect(formatPrice(0.0123)).toBe("0.0123")
  })
  it("更小 6 位", () => {
    expect(formatPrice(0.000012)).toBe("0.000012")
  })
  it("null/undefined → 占位符", () => {
    expect(formatPrice(null)).toBe("—")
    expect(formatPrice(undefined)).toBe("—")
  })
})

describe("formatUsdCompact 分档", () => {
  it("T/B/M/个位", () => {
    expect(formatUsdCompact(2.41e12)).toBe("$2.41T")
    expect(formatUsdCompact(1.5e9)).toBe("$1.50B")
    expect(formatUsdCompact(3.2e6)).toBe("$3.20M")
    expect(formatUsdCompact(500)).toBe("$500")
  })
  it("0 与 null 视为无数据", () => {
    expect(formatUsdCompact(0)).toBe("—")
    expect(formatUsdCompact(null)).toBe("—")
  })
})

describe("formatPct", () => {
  it("带符号与位数", () => {
    expect(formatPct(1.234)).toBe("+1.23%")
    expect(formatPct(-1)).toBe("-1.00%")
    expect(formatPct(0)).toBe("+0.00%")
  })
  it("null/NaN → 占位符", () => {
    expect(formatPct(null)).toBe("—")
    expect(formatPct(Number.NaN)).toBe("—")
  })
})

describe("formatWatchTitle 盯盘标题", () => {
  it("涨用 ▲、跌用 ▼，符号统一大写", () => {
    expect(formatWatchTitle("btc", 67123.456, 1.234)).toBe("BTC $67,123.46 ▲1.23%")
    expect(formatWatchTitle("ETH", 3500, -0.5)).toBe("ETH $3,500.00 ▼0.50%")
  })
  it("0% 视为上涨方向（▲0.00%）", () => {
    expect(formatWatchTitle("SOL", 150, 0)).toBe("SOL $150.00 ▲0.00%")
  })
  it("无涨跌幅只显示价格；无价格返回空串供调用方回退", () => {
    expect(formatWatchTitle("XRP", 0.5234, null)).toBe("XRP $0.5234")
    expect(formatWatchTitle("DOGE", null, 1)).toBe("")
    expect(formatWatchTitle("DOGE", undefined, undefined)).toBe("")
  })
})

describe("formatTime", () => {
  it("0/null → 占位符", () => {
    expect(formatTime(0)).toBe("—")
    expect(formatTime(null)).toBe("—")
  })
  it("输出时:分:秒", () => {
    const d = new Date(2026, 8, 7, 9, 5, 3)
    const out = formatTime(d.getTime())
    expect(out).toMatch(/^09:05:03$/)
  })
})

describe("toNum 宽松转换", () => {
  it("合法数值字符串与数字原样返回", () => {
    expect(toNum("5")).toBe(5)
    expect(toNum("5.5")).toBe(5.5)
    expect(toNum(7)).toBe(7)
  })
  it("空串/undefined/null/非数字 → null（不得渗出 NaN）", () => {
    expect(toNum("")).toBeNull()
    expect(toNum(undefined)).toBeNull()
    expect(toNum(null)).toBeNull()
    expect(toNum("abc")).toBeNull()
  })
})

describe("mergeLiveTick 实时价合并", () => {
  const candles = [
    { time: 1, open: 100, high: 110, low: 90, close: 105, volume: 10 },
    { time: 2, open: 105, high: 120, low: 100, close: 115, volume: 20 },
  ]

  it("无实时数据时原样返回", () => {
    expect(mergeLiveTick(candles, undefined)).toBe(candles)
    expect(mergeLiveTick([], { price: 1 })).toEqual([])
  })

  it("只改末根K线：close 更新、high/low 随 price 扩展，前段引用不变", () => {
    const out = mergeLiveTick(candles, { price: 130 })
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(candles[0]) // 前段共享引用（未复制）
    expect(out[1].close).toBe(130)
    expect(out[1].high).toBe(130) // Math.max(120, 130)
    expect(out[1].low).toBe(100) // Math.min(100, 130) = 原低点不变
    expect(out[1].open).toBe(105) // open 不受影响
  })

  it("实时价低于原 low 时下移 low", () => {
    const out = mergeLiveTick(candles, { price: 80 })
    expect(out[1].low).toBe(80)
    expect(out[1].close).toBe(80)
  })
})
