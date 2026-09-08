import { describe, expect, it } from "vitest"

import { computeStats, type Holding, type PriceRef } from "@/lib/portfolio"

const h = (id: string, amount: number, cost?: number): Holding => ({
  id,
  amount,
  cost: cost ?? null,
  addedAt: 0,
})

describe("computeStats", () => {
  it("空持仓全为零值", () => {
    const s = computeStats([], {})
    expect(s.totalValue).toBe(0)
    expect(s.pricedCount).toBe(0)
    expect(s.pnl24h).toBeNull()
    expect(s.totalCost).toBeNull()
    expect(s.costPnl).toBeNull()
  })

  it("总市值 = Σ 数量 × 现价", () => {
    const prices: Record<string, PriceRef> = {
      bitcoin: { price: 100, chg24h: 0 },
      ethereum: { price: 50, chg24h: 0 },
    }
    const s = computeStats([h("bitcoin", 2), h("ethereum", 3)], prices)
    expect(s.totalValue).toBe(350)
    expect(s.pricedCount).toBe(2)
  })

  it("24H 盈亏按各持仓 24h 前市值折算", () => {
    // BTC +10%（100 ← 90.909..），ETH 0%
    const prices: Record<string, PriceRef> = {
      bitcoin: { price: 100, chg24h: 10 },
      ethereum: { price: 50, chg24h: 0 },
    }
    const s = computeStats([h("bitcoin", 1), h("ethereum", 2)], prices)
    // 24h 前 = 100/1.1 + 100 = 190.909..；盈亏 = 200 − 190.909.. ≈ 9.0909
    expect(s.pnl24h).toBeCloseTo(9.0909, 3)
    expect(s.pnl24hPct).toBeCloseTo(4.7619, 3)
  })

  it("任一持仓缺 24h 数据则 24H 盈亏为 null（口径不混拼）", () => {
    const prices: Record<string, PriceRef> = {
      bitcoin: { price: 100, chg24h: 10 },
      ethereum: { price: 50, chg24h: null },
    }
    const s = computeStats([h("bitcoin", 1), h("ethereum", 2)], prices)
    expect(s.pnl24h).toBeNull()
    expect(s.pnl24hPct).toBeNull()
  })

  it("成本盈亏只在记录了成本的持仓上计算", () => {
    const prices: Record<string, PriceRef> = {
      bitcoin: { price: 120, chg24h: 0 },
      ethereum: { price: 40, chg24h: 0 },
    }
    // BTC 成本 100 现值 120；ETH 未记录成本但贡献市值 40 → 盈亏 = 160 − 100 = 60
    const s = computeStats([h("bitcoin", 1, 100), h("ethereum", 1)], prices)
    expect(s.totalCost).toBe(100)
    expect(s.costPnl).toBeCloseTo(60, 6)
    expect(s.costPnlPct).toBeCloseTo(60, 6)
  })

  it("全部未记录成本时成本口径为 null", () => {
    const s = computeStats([h("bitcoin", 1)], { bitcoin: { price: 100, chg24h: 0 } })
    expect(s.totalCost).toBeNull()
    expect(s.costPnl).toBeNull()
    expect(s.costPnlPct).toBeNull()
  })

  it("无价格的持仓不计入估值与 24H 口径", () => {
    const prices: Record<string, PriceRef> = {
      bitcoin: { price: 100, chg24h: 5 },
    }
    const s = computeStats([h("bitcoin", 1), h("unknown-coin", 3, 50)], prices)
    expect(s.totalValue).toBe(100)
    expect(s.pricedCount).toBe(1)
    expect(s.pnl24h).toBeCloseTo(100 - 100 / 1.05, 6)
    // 成本包含无法估值持仓的成本 —— 现值 100 − 50
    expect(s.totalCost).toBe(50)
    expect(s.costPnl).toBeCloseTo(50, 6)
  })

  it("负的 24h 数据（≤ −100% 视为异常）不参与折算", () => {
    const s = computeStats([h("bitcoin", 1)], { bitcoin: { price: 100, chg24h: -100 } })
    expect(s.pnl24h).toBeNull()
  })
})
