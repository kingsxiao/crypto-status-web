import { afterEach, describe, expect, it, vi } from "vitest"

import { INTERVALS, fetchCandles, mergeLiveTick, pollIntervalMs, type Candle } from "../kline"

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

/* ---------- fetchCandles 四级容错链（锁定 052b072 修复的行为） ---------- */

const SYM = { binance: "BTCUSDT", okx: "BTC-USDT" }
const VISION_URL = "https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500"
const MAIN_URL = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=500"
const OKX_URL = "https://www.okx.com/api/v5/market/candles?instId=BTC-USDT&bar=1D&limit=300"
const CG_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily"

/** 记录每次 fetch 的 URL 并按 URL 分发响应 */
function stubFetch(handler: (url: string) => unknown) {
  const urls: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      urls.push(url)
      return handler(url) as Response
    }),
  )
  return urls
}

function jsonRes(body: unknown): Response {
  return { ok: true, json: () => Promise.resolve(body) } as unknown as Response
}

function failRes(status: number): Response {
  return { ok: false, status, json: () => Promise.resolve({}) } as unknown as Response
}

/** Binance K 线行：[开时, 开, 高, 低, 收, 量, 收时, 计价货币成交额, ...] */
const bRow = (i: number): (string | number)[] => [
  1700000000000 + i * 86_400_000,
  "100",
  "120",
  "90",
  "110",
  "5",
  1700086399999,
  String(500 + i),
]

/** OKX K 线行：[ts, o, h, l, c, vol, volCcy（计价货币口径，与 Binance 对齐）] */
const oRow = (i: number): string[] => [
  String(1700000000000 + i * 86_400_000),
  "100",
  "120",
  "90",
  "110",
  "5",
  String(500 + i),
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchCandles 四级容错链", () => {
  it("1/2 级 Binance：镜像返回空结果视为失败，换主站重试成功", async () => {
    const urls = stubFetch((url) => (url === VISION_URL ? jsonRes([]) : jsonRes([bRow(0), bRow(1)])))
    const res = await fetchCandles("bitcoin", SYM, "1d")
    expect(res.source).toBe("binance")
    expect(res.renderMode).toBe("candles")
    expect(res.candles).toHaveLength(2)
    // 字段映射：time/open/high/low/close 取 k[0..4]，volume 取 k[7]（计价货币成交额）
    expect(res.candles[0]).toEqual({
      time: 1700000000000,
      open: 100,
      high: 120,
      low: 90,
      close: 110,
      volume: 500,
    })
    // 只发两跳：镜像（空）→ 主站（成功）；空结果后不再停留
    expect(urls).toEqual([VISION_URL, MAIN_URL])
  })

  it("3 级 OKX：两级 Binance 全挂后兜底，时间倒序输入重排为升序", async () => {
    const urls = stubFetch((url) => {
      if (url === VISION_URL || url === MAIN_URL) return failRes(451)
      if (url === OKX_URL) return jsonRes({ data: [oRow(2), oRow(0), oRow(1)] }) // OKX 返回时间倒序
      return failRes(500)
    })
    const res = await fetchCandles("bitcoin", SYM, "1d")
    expect(res.source).toBe("okx")
    expect(res.renderMode).toBe("candles")
    expect(res.candles.map((c) => c.time)).toEqual([
      1700000000000,
      1700000000000 + 86_400_000,
      1700000000000 + 2 * 86_400_000,
    ])
    // volume 取 k[6]（volCcy 计价货币口径）
    expect(res.candles[0].volume).toBe(500)
    expect(urls).toEqual([VISION_URL, MAIN_URL, OKX_URL])
  })

  it("4 级 CoinGecko：三级全挂后折线合成 OHLC（open=前收、high/low 单调外扩）", async () => {
    const urls = stubFetch((url) => {
      if (url === VISION_URL || url === MAIN_URL || url === OKX_URL) return failRes(451)
      return jsonRes({ prices: [[1000, 100], [2000, 110], [3000, 90]] })
    })
    const res = await fetchCandles("bitcoin", SYM, "1d")
    expect(res.source).toBe("coingecko-line")
    expect(res.renderMode).toBe("line")
    expect(res.candles).toEqual([
      { time: 1000, open: 100, high: 100, low: 100, close: 100, volume: null },
      { time: 2000, open: 100, high: 110, low: 100, close: 110, volume: null },
      { time: 3000, open: 110, high: 110, low: 90, close: 90, volume: null },
    ])
    // 日线周期 CG 兜底取 365 天并显式 interval=daily
    expect(urls).toEqual([VISION_URL, MAIN_URL, OKX_URL, CG_URL])
  })

  it("全链失败：四级按序穷尽后抛错，不静默返回空数据", async () => {
    const urls = stubFetch(() => failRes(503))
    await expect(fetchCandles("bitcoin", SYM, "1d")).rejects.toThrow("HTTP 503")
    expect(urls).toEqual([VISION_URL, MAIN_URL, OKX_URL, CG_URL])
  })
})

describe("fetchCandles 同参并发去重", () => {
  it("并发同参只发一次请求，共享同一结果；完成后缓存失效可再拉", async () => {
    // 首个请求挂起等测试侧放行（制造并发窗口），后续请求立即成功
    let first = true
    let resolveFirst!: (v: Response) => void
    const fetchMock = vi.fn(() => {
      if (first) {
        first = false
        return new Promise<Response>((res) => (resolveFirst = res))
      }
      return Promise.resolve(jsonRes([bRow(1)]))
    })
    vi.stubGlobal("fetch", fetchMock)

    const p1 = fetchCandles("bitcoin", SYM, "1d")
    const p2 = fetchCandles("bitcoin", SYM, "1d")
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFirst(jsonRes([bRow(0)]))
    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe(r2) // 同一 Promise → 同一 CandleResult 引用

    // in-flight 条目在落定后清除：下一次调用是全新请求
    await fetchCandles("bitcoin", SYM, "1d")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("去重键含 intervalKey 全集：并发不同周期不互相吞并", async () => {
    const fetchMock = vi.fn(async () => jsonRes([bRow(0)]))
    vi.stubGlobal("fetch", fetchMock)
    await Promise.all([fetchCandles("bitcoin", SYM, "1d"), fetchCandles("bitcoin", SYM, "4h")])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("mergeLiveTick 实时价合并", () => {
  const base: Candle[] = [
    { time: 1, open: 100, high: 110, low: 95, close: 105, volume: 10 },
    { time: 2, open: 105, high: 120, low: 100, close: 115, volume: 20 },
  ]

  it("无实时价或空数组：原样返回同一引用", () => {
    expect(mergeLiveTick(base, undefined)).toBe(base)
    expect(mergeLiveTick([], { price: 100 })).toEqual([])
  })

  it("close 覆盖为实时价，high/low 单调外扩", () => {
    const out = mergeLiveTick(base, { price: 130 })
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ time: 2, open: 105, high: 130, low: 100, close: 130, volume: 20 })
  })

  it("实时价落在区间内：high/low 不动，只更新 close", () => {
    const out = mergeLiveTick(base, { price: 112 })
    expect(out[1].close).toBe(112)
    expect(out[1].high).toBe(120)
    expect(out[1].low).toBe(100)
  })

  it("只改最后一根且不改动原数组（纯函数）", () => {
    const out = mergeLiveTick(base, { price: 90 })
    expect(out[0]).toBe(base[0]) // 前序 K 线原引用
    expect(out[1]).not.toBe(base[1])
    expect(out[1].low).toBe(90)
    expect(base[1]).toEqual({ time: 2, open: 105, high: 120, low: 100, close: 115, volume: 20 })
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
