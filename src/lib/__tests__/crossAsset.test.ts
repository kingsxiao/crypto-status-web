import { describe, expect, it } from "vitest"

import type { Coin, GlobalData } from "@/lib/api"
import {
  computeVerdict,
  cryptoMcapOf,
  fundingScore,
  gradeRecord,
  gradeStats,
  type CrossAssetData,
  type VerdictRecord,
} from "@/lib/crossAsset"

/* ------------------------------ 测试夹具 ------------------------------ */

function makeCoin(partial: Partial<Coin> & { id: string }): Coin {
  return {
    symbol: partial.id.slice(0, 3).toUpperCase(),
    name: partial.id,
    image: "",
    current_price: 100,
    market_cap: 1e9,
    market_cap_rank: 1,
    total_volume: 1e8,
    high_24h: 110,
    low_24h: 90,
    ath: 120,
    ath_change_percentage: -10,
    circulating_supply: 1e6,
    ...partial,
  }
}

const zeroGlobal: GlobalData = {
  total_market_cap_usd: 0,
  total_volume_usd: 0,
  market_cap_change_24h_pct: 0,
  btc_dominance: 0,
  eth_dominance: 0,
  active_cryptocurrencies: 0,
}

const emptyCross: CrossAssetData = {
  fetchedAt: 0,
  stablecoin: null,
  derivatives: null,
  breadth: null,
}

/* ------------------------------ 信号函数 ------------------------------ */

describe("fundingScore（资金费率）", () => {
  it("深度负值逆向加分，过热顶格减分", () => {
    expect(fundingScore(-0.01)).toBe(0.6)
    expect(fundingScore(0)).toBe(0)
    expect(fundingScore(0.01)).toBe(0.4)
    expect(fundingScore(0.05)).toBe(-0.3)
    expect(fundingScore(0.1)).toBe(-1)
  })
})

describe("gradeRecord（次日复盘）", () => {
  const base = { stance: "neutral" as const, composite: 20, mcapChg24h: 0, headline: "" }
  it("无次日记录 → pending", () => {
    expect(gradeRecord({ ...base, date: "2026-09-06" }, null)).toBe("pending")
  })
  it("预测涨且实际涨 → correct；实际跌 → wrong", () => {
    const cur = { ...base, date: "2026-09-06", composite: 20 }
    expect(gradeRecord(cur, { ...base, date: "2026-09-07", mcapChg24h: 1 })).toBe("correct")
    expect(gradeRecord(cur, { ...base, date: "2026-09-07", mcapChg24h: -1 })).toBe("wrong")
  })
  it("预测中性或实际横盘 → partial", () => {
    expect(gradeRecord({ ...base, date: "a", composite: 5 }, { ...base, date: "b", mcapChg24h: 1 })).toBe("partial")
    expect(gradeRecord({ ...base, date: "a", composite: 20 }, { ...base, date: "b", mcapChg24h: 0 })).toBe("partial")
  })
})

describe("gradeStats", () => {
  it("统计 correct/wrong/partial 与命中率", () => {
    const mk = (date: string, composite: number, mcap: number): VerdictRecord => ({
      date,
      stance: "neutral",
      composite,
      mcapChg24h: mcap,
      headline: "",
    })
    const list = [
      mk("2026-09-04", 20, 0),
      mk("2026-09-05", 20, 1), // correct
      mk("2026-09-06", -20, 0),
      mk("2026-09-07", -20, 1), // wrong
    ]
    const s = gradeStats(list)
    expect(s.correct).toBe(1)
    expect(s.wrong).toBe(1)
    expect(s.partial).toBe(1)
    expect(s.hitRate).toBeCloseTo(0.5)
  })
})

/* ------------------------------ 主引擎 ------------------------------ */

describe("computeVerdict", () => {
  it("全降级输入（global 全零、无附加源）也能产出结构完整的判断", () => {
    const coins = [
      makeCoin({ id: "bitcoin", market_cap: 2e12, current_price: 100 }),
      makeCoin({ id: "ethereum", market_cap: 4e11, current_price: 5 }),
    ]
    const v = computeVerdict({ global: zeroGlobal, fng: null, coins, cross: emptyCross })
    expect(v.indicators.length).toBeGreaterThanOrEqual(2) // mcap24h + dominance + ethbtc 至少两项
    expect(v.composite).toBeGreaterThanOrEqual(-100)
    expect(v.composite).toBeLessThanOrEqual(100)
    expect(v.confidence).toBeGreaterThanOrEqual(0.3)
    expect(v.confidence).toBeLessThanOrEqual(0.95)
    expect(v.headline.length).toBeGreaterThan(0)
    // mix 计数守恒
    expect(v.mix.bull + v.mix.neutral + v.mix.bear).toBe(v.indicators.length)
  })

  it("global 限流时 mcap24h 用 top12 市值加权近似并标注", () => {
    const coins = [
      makeCoin({ id: "bitcoin", market_cap: 2e12, price_change_percentage_24h_in_currency: 2 }),
      makeCoin({ id: "ethereum", market_cap: 1e12, price_change_percentage_24h_in_currency: -1 }),
    ]
    const v = computeVerdict({ global: zeroGlobal, fng: null, coins, cross: emptyCross })
    const mcap = v.indicators.find((i) => i.key === "mcap24h")
    expect(mcap).toBeDefined()
    expect(mcap!.display).toContain("top12 近似")
  })

  it("极度恐惧触发逆向加分与「情绪冰点」主题", () => {
    const coins = [makeCoin({ id: "bitcoin" }), makeCoin({ id: "ethereum" })]
    const v = computeVerdict({
      global: zeroGlobal,
      fng: { value: 15, classification: "Extreme Fear", timestamp: 0 },
      coins,
      cross: emptyCross,
    })
    const fng = v.indicators.find((i) => i.key === "fng")
    expect(fng!.score).toBe(1)
    expect(v.themes.some((t) => t.includes("情绪冰点"))).toBe(true)
  })

  it("费率过热触发杠杆警示观察项", () => {
    const coins = [makeCoin({ id: "bitcoin" }), makeCoin({ id: "ethereum" })]
    const v = computeVerdict({
      global: zeroGlobal,
      fng: null,
      coins,
      cross: {
        fetchedAt: 0,
        stablecoin: null,
        derivatives: {
          btcFundingPct8h: 0.1,
          ethFundingPct8h: 0.1,
          btcLsRatio: 1.5,
          btcLsTrend: [1.5, 1.5],
        },
        breadth: null,
      },
    })
    const funding = v.indicators.find((i) => i.key === "funding")
    expect(funding!.score).toBe(-1)
    expect(v.watch.some((w) => w.includes("费率过热"))).toBe(true)
  })
})

describe("cryptoMcapOf", () => {
  it("优先 global，降级用 top12 合计", () => {
    const coins = [makeCoin({ id: "bitcoin", market_cap: 100 }), makeCoin({ id: "ethereum", market_cap: 50 })]
    expect(cryptoMcapOf({ ...zeroGlobal, total_market_cap_usd: 999 }, coins)).toBe(999)
    expect(cryptoMcapOf(zeroGlobal, coins)).toBe(150)
  })
})
