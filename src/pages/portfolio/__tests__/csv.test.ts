import { describe, expect, it } from "vitest"

import { parseHoldingsCsv } from "../csv"

describe("parseHoldingsCsv", () => {
  it("标准表头按序解析,cost 空列视为未记录", () => {
    const r = parseHoldingsCsv("id,symbol,amount,cost\nbitcoin,BTC,0.5,\nethereum,ETH,2,3500\n")
    expect(r.skipped).toBe(0)
    expect(r.rows).toEqual([
      { id: "bitcoin", amount: 0.5, cost: null, addedAt: expect.any(Number) },
      { id: "ethereum", amount: 2, cost: 3500, addedAt: expect.any(Number) },
    ])
  })

  it("容忍表头乱序与空白(按表头名定位列)", () => {
    const r = parseHoldingsCsv("cost,amount,id\n1200, 3 , solana\n")
    expect(r.rows).toEqual([{ id: "solana", amount: 3, cost: 1200, addedAt: expect.any(Number) }])
  })

  it("忽略坏行并计数:缺 id、amount 非法、amount ≤ 0", () => {
    const r = parseHoldingsCsv(
      "id,symbol,amount,cost\n,ETH,1,\nbitcoin,BTC,abc,\nbitcoin,BTC,0,\ntether,USDT,10,\n"
    )
    expect(r.skipped).toBe(3)
    expect(r.rows.map((x) => x.id)).toEqual(["tether"])
  })

  it("cost 非数字视为未记录而非坏行", () => {
    const r = parseHoldingsCsv("id,symbol,amount,cost\nbitcoin,BTC,1,n/a\n")
    expect(r.skipped).toBe(0)
    expect(r.rows[0].cost).toBeNull()
  })

  it("同 id 重复行取后者(与编辑合并语义一致)", () => {
    const r = parseHoldingsCsv("id,amount\nbitcoin,1\nbitcoin,2\n")
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].amount).toBe(2)
  })

  it("缺 id/amount 列的整体判废,数据行全部计入 skipped", () => {
    const r = parseHoldingsCsv("symbol,amount\nBTC,1\nETH,2\n")
    expect(r.rows).toEqual([])
    expect(r.skipped).toBe(2)
  })

  it("CRLF 与 BOM 均可解析;空文本返回空结果", () => {
    const r = parseHoldingsCsv("\uFEFFid,amount\r\nbitcoin,1\r\n")
    expect(r.rows.map((x) => x.id)).toEqual(["bitcoin"])
    expect(parseHoldingsCsv("")).toEqual({ rows: [], skipped: 0 })
  })
})
