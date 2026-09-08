import { describe, expect, it } from "vitest"

import { INTERVALS, pollIntervalMs } from "@/lib/kline"

/** "15m" → 15 分钟对应的毫秒 */
function keyToMs(key: string): number {
  const n = Number(key.slice(0, -1))
  const unit = key.slice(-1)
  return n * { s: 1e3, m: 6e4, h: 3.6e6, d: 8.64e7, w: 6.048e8 }[unit as "s" | "m" | "h" | "d" | "w"]
}

describe("INTERVALS 秒级扩展", () => {
  it("含 1s~周线共 9 档，键唯一", () => {
    expect(INTERVALS.map((i) => i.key)).toEqual(["1s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"])
  })

  it("每档都有 Binance 与 OKX 映射（CoinGecko 折线兜底之外仍有两级蜡烛数据源）", () => {
    for (const itv of INTERVALS) {
      expect(itv.binance, itv.key).toBeTruthy()
      expect(itv.okx, itv.key).toBeTruthy()
    }
  })

  it("按周期时长升序排列", () => {
    const ms = INTERVALS.map((i) => keyToMs(i.key))
    expect(ms).toEqual([...ms].sort((a, b) => a - b))
  })

  it("秒/分钟级 CG 兜底取 1 天（5 分钟粒度），日线以上取 365 天", () => {
    for (const itv of INTERVALS) {
      if (keyToMs(itv.key) < 3.6e6) expect(itv.cgDays, itv.key).toBe(1)
    }
    expect(INTERVALS.find((i) => i.key === "1d")?.cgDays).toBe(365)
    expect(INTERVALS.find((i) => i.key === "1w")?.cgDays).toBe(365)
  })
})

describe("pollIntervalMs 轮询节奏", () => {
  it("短周期收紧：1s→5s、1m→15s、5m→30s", () => {
    expect(pollIntervalMs("1s")).toBe(5_000)
    expect(pollIntervalMs("1m")).toBe(15_000)
    expect(pollIntervalMs("5m")).toBe(30_000)
  })

  it("长周期保持 60s，未知周期也回落到 60s", () => {
    expect(pollIntervalMs("15m")).toBe(60_000)
    expect(pollIntervalMs("4h")).toBe(60_000)
    expect(pollIntervalMs("1d")).toBe(60_000)
    expect(pollIntervalMs("whatever")).toBe(60_000)
  })
})
