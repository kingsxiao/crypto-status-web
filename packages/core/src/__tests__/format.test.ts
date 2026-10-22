import { describe, expect, it } from "vitest"

import { formatAmount, formatPct, formatPrice, formatTime, formatUsdCompact, formatWatchTitle, parseNum } from "../format"

describe("parseNum 表单数字解析", () => {
  it("容忍逗号小数点与首尾空白", () => {
    expect(parseNum("1.5")).toBe(1.5)
    expect(parseNum(" 1,5 ")).toBe(1.5)
    expect(parseNum("1234")).toBe(1234)
  })
  it("非法输入返回 NaN，由调用方判 Number.isFinite", () => {
    expect(Number.isNaN(parseNum(""))).toBe(true)
    expect(Number.isNaN(parseNum("abc"))).toBe(true)
  })
})

describe("formatAmount 数量格式化", () => {
  it("非有限值 → 占位符；0 → \"0\"", () => {
    expect(formatAmount(Number.NaN)).toBe("—")
    expect(formatAmount(0)).toBe("0")
  })
  it("大数千分位，小数最多 8 位有效", () => {
    expect(formatAmount(1234567.89)).toBe("1,234,567.89")
    expect(formatAmount(0.000123456789)).toBe("0.0001235")
    expect(formatAmount(0.5)).toBe("0.5")
  })
  it("极小数量定点展开：无科学计数法，1e-9 不被截断为 \"0\"", () => {
    expect(formatAmount(1e-8)).toBe("0.00000001")
    expect(formatAmount(1.2345e-8)).toBe("0.00000001235")
    expect(formatAmount(1e-9)).toBe("0.000000001")
    // toPrecision 恰在 1e-7 切换指数记法，边界两侧口径一致
    expect(formatAmount(1e-7)).toBe("0.0000001")
    expect(formatAmount(9.87e-8)).toBe("0.0000000987")
    // 全部结果不得含指数记法
    for (const v of [1e-7, 1e-8, 1.2345e-8, 1e-9]) {
      expect(formatAmount(v)).not.toMatch(/e/i)
    }
  })
})

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

