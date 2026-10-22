import { describe, expect, it } from "vitest"

import {
  decideOnClose,
  liveStatusFor,
  parseBinanceMiniTicker,
  parseBinanceRestTicker,
  parseOkxTickers,
  TRADE_SYMBOLS,
} from "../realtime-source"

/** 以现网真实字段形态为参照（ws.onmessage 原行为） */
const byBinance = new Map(Object.keys(TRADE_SYMBOLS).map((id) => [TRADE_SYMBOLS[id].binance, id]))
const byOkx = new Map(Object.keys(TRADE_SYMBOLS).map((id) => [TRADE_SYMBOLS[id].okx, id]))

describe("parseBinanceMiniTicker", () => {
  it("miniTicker 标准消息：价格/涨跌幅/高低/量/事件时间", () => {
    const r = parseBinanceMiniTicker(
      { data: { s: "BTCUSDT", c: "67000.5", o: "66000", h: "67500.1", l: "65500.2", q: "1234.5", E: 1730000000000 } },
      byBinance,
    )
    expect(r).toEqual({
      id: "bitcoin",
      ticker: {
        price: 67000.5,
        changePct: ((67000.5 - 66000) / 66000) * 100,
        high: 67500.1,
        low: 65500.2,
        quoteVolume: 1234.5,
        ts: 1730000000000,
      },
    })
  })

  it("开盘价为 0 时涨跌幅为 null（不可计算）", () => {
    const r = parseBinanceMiniTicker({ data: { s: "ETHUSDT", c: "3000", o: "0", E: 1 } }, byBinance)
    expect(r?.ticker.changePct).toBeNull()
  })

  it("缺 data.s / 非监听币种 / 事件时间缺失回退 Date.now", () => {
    expect(parseBinanceMiniTicker({ data: {} }, byBinance)).toBeNull()
    expect(parseBinanceMiniTicker({ data: { s: "NOTUSDT", c: "1" } }, byBinance)).toBeNull()
    expect(parseBinanceMiniTicker({ foo: 1 }, byBinance)).toBeNull()
    const r = parseBinanceMiniTicker({ data: { s: "BTCUSDT", c: "1", o: "1" } }, byBinance)
    expect(r?.ticker.ts).toBeGreaterThan(0)
  })
})

describe("parseOkxTickers", () => {
  it("tickers 频道一条消息多币种解析", () => {
    const rs = parseOkxTickers(
      {
        arg: { channel: "tickers" },
        data: [
          { instId: "BTC-USDT", last: "67000", open24h: "66000", high24h: "68000", low24h: "65000", volCcy24h: "999", ts: "1730000000000" },
          { instId: "ETH-USDT", last: "3000", open24h: "3100", high24h: "3200", low24h: "2900", volCcy24h: "888", ts: "1730000000001" },
        ],
      },
      byOkx,
    )
    expect(rs.map((r) => r.id)).toEqual(["bitcoin", "ethereum"])
    expect(rs[0].ticker).toEqual({
      price: 67000,
      changePct: ((67000 - 66000) / 66000) * 100,
      high: 68000,
      low: 65000,
      quoteVolume: 999,
      ts: 1730000000000,
    })
    expect(rs[1].ticker.changePct).toBeLessThan(0)
  })

  it("非 tickers 频道（订阅回执/心跳）返回空数组", () => {
    expect(parseOkxTickers({ event: "subscribe" }, byOkx)).toEqual([])
    expect(parseOkxTickers({ arg: { channel: "books" }, data: [{}] }, byOkx)).toEqual([])
    expect(parseOkxTickers({ arg: { channel: "tickers" } }, byOkx)).toEqual([])
  })

  it("监听列表外的 instId 跳过", () => {
    const rs = parseOkxTickers(
      { arg: { channel: "tickers" }, data: [{ instId: "DOGE-USDT", last: "1", open24h: "1" }] },
      byOkx,
    )
    // dogecoin 的 okx 对为 DOGE-USDT，在列表内——换一个真不在列表的
    const rs2 = parseOkxTickers(
      { arg: { channel: "tickers" }, data: [{ instId: "PEPE-USDT", last: "1", open24h: "1" }] },
      byOkx,
    )
    expect(rs.length).toBe(1)
    expect(rs2).toEqual([])
  })
})

describe("parseBinanceRestTicker（轮询兜底）", () => {
  it("24hr 行情行解析，缺字段项为 null", () => {
    const r = parseBinanceRestTicker(
      { symbol: "SOLUSDT", lastPrice: "150", priceChangePercent: "2.5", highPrice: "", lowPrice: "140", quoteVolume: "777" },
      byBinance,
      42,
    )
    expect(r).toEqual({
      id: "solana",
      ticker: { price: 150, changePct: 2.5, high: null, low: 140, quoteVolume: 777, ts: 42 },
    })
  })

  it("未知 symbol 返回 null", () => {
    expect(parseBinanceRestTicker({ symbol: "XXXUSDT", lastPrice: "1", priceChangePercent: "1", highPrice: "1", lowPrice: "1", quoteVolume: "1" }, byBinance)).toBeNull()
  })
})

describe("liveStatusFor 引用稳定性", () => {
  it("同源 live 状态返回原引用；否则新对象", () => {
    const prev = { mode: "live", source: "binance" } as const
    expect(liveStatusFor(prev, "binance")).toBe(prev)
    expect(liveStatusFor(prev, "okx")).toEqual({ mode: "live", source: "okx" })
    expect(liveStatusFor({ mode: "connecting" }, "binance")).toEqual({ mode: "live", source: "binance" })
  })
})

describe("decideOnClose 断线降级决策", () => {
  it("retries<3 原源重试，退避 1.5s×次数；满 3 次降级", () => {
    expect(decideOnClose(0)).toEqual({ kind: "retry-same", delayMs: 1500 })
    expect(decideOnClose(1)).toEqual({ kind: "retry-same", delayMs: 3000 })
    expect(decideOnClose(2)).toEqual({ kind: "retry-same", delayMs: 4500 })
    expect(decideOnClose(3)).toEqual({ kind: "downgrade" })
  })
})
