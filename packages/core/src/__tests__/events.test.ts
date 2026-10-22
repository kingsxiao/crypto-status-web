import { describe, expect, it } from "vitest"

import {
  buildIcs,
  countdownParts,
  eventEndMs,
  eventProgress,
  eventStartMs,
  eventStatus,
  extrapolateRecurringEvents,
  filterEvents,
  groupEventsByDay,
  HARDCODED_MARKET_EVENTS,
  heroEvent,
  localDayKey,
  LIVE_WINDOW_MS,
  MARKET_EVENTS,
  sortedEvents,
  srcZone,
  statusCounts,
  type MarketEvent,
} from "../events"

/** 测试用事件工厂：时刻全部用 UTC，避免测试环境时区影响断言 */
function ev(partial: Partial<MarketEvent> & { id: string; start: string }): MarketEvent {
  return {
    zh: partial.id,
    en: partial.id,
    category: "macro",
    impact: "high",
    ...partial,
  }
}

describe("数据集 MARKET_EVENTS", () => {
  it("非空且 id 唯一", () => {
    expect(MARKET_EVENTS.length).toBeGreaterThan(0)
    const ids = new Set(MARKET_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(MARKET_EVENTS.length)
  })

  it("所有时刻可解析，start ≤ end", () => {
    for (const e of MARKET_EVENTS) {
      expect(Number.isNaN(eventStartMs(e))).toBe(false)
      if (e.end) expect(eventStartMs(e)).toBeLessThanOrEqual(Date.parse(e.end))
    }
  })

  it("时间窗事件（window）必须带 end，否则永远不会结束", () => {
    for (const e of MARKET_EVENTS) {
      if (e.window) expect(e.end).toBeDefined()
    }
  })
})

describe("eventStatus", () => {
  const e = ev({ id: "t1", start: "2026-01-01T12:00:00Z", end: "2026-01-01T13:00:00Z" })

  it("开始前 upcoming，窗口内 live，结束后 finished", () => {
    expect(eventStatus(e, Date.parse("2026-01-01T11:59:59Z"))).toBe("upcoming")
    expect(eventStatus(e, Date.parse("2026-01-01T12:00:00Z"))).toBe("live")
    expect(eventStatus(e, Date.parse("2026-01-01T12:59:59Z"))).toBe("live")
    expect(eventStatus(e, Date.parse("2026-01-01T13:00:00Z"))).toBe("finished")
  })

  it("瞬时事件按 LIVE_WINDOW_MS 展开「进行中」窗口", () => {
    const instant = ev({ id: "t2", start: "2026-01-01T12:00:00Z" })
    const s = eventStartMs(instant)
    expect(eventEndMs(instant)).toBe(s + LIVE_WINDOW_MS)
    expect(eventStatus(instant, s + LIVE_WINDOW_MS - 1)).toBe("live")
    expect(eventStatus(instant, s + LIVE_WINDOW_MS)).toBe("finished")
  })
})

describe("filterEvents / sortedEvents", () => {
  const list = [
    ev({ id: "c", start: "2026-01-03T00:00:00Z", category: "crypto", impact: "medium" }),
    ev({ id: "a", start: "2026-01-01T00:00:00Z" }),
    ev({ id: "b", start: "2026-01-02T00:00:00Z", category: "crypto" }),
  ]
  const now = Date.parse("2026-01-02T06:00:00Z")

  it("升序排序且不修改原数组", () => {
    expect(sortedEvents(list).map((e) => e.id)).toEqual(["a", "b", "c"])
    expect(list.map((e) => e.id)).toEqual(["c", "a", "b"])
  })

  it("状态筛选：upcoming 只留未开始的", () => {
    expect(filterEvents(list, now, "upcoming", "all").map((e) => e.id)).toEqual(["c"])
  })

  it("类别筛选可与状态叠加", () => {
    expect(filterEvents(list, now, "all", "crypto").map((e) => e.id)).toEqual(["b", "c"])
    expect(filterEvents(list, now, "upcoming", "crypto").map((e) => e.id)).toEqual(["c"])
  })

  it("finished 视图按最近在前（倒序）", () => {
    const past = [
      ev({ id: "p1", start: "2026-01-01T00:00:00Z" }),
      ev({ id: "p2", start: "2025-12-01T00:00:00Z" }),
    ]
    expect(filterEvents(past, now, "finished", "all").map((e) => e.id)).toEqual(["p1", "p2"])
  })
})

describe("heroEvent", () => {
  it("进行中的定时事件优先于未来事件", () => {
    const list = [
      ev({ id: "future-high", start: "2026-01-05T00:00:00Z" }),
      ev({ id: "live-now", start: "2026-01-01T00:00:00Z", end: "2026-01-02T00:00:00Z" }),
    ]
    expect(heroEvent(list, Date.parse("2026-01-01T12:00:00Z"))?.id).toBe("live-now")
  })

  it("无进行中时取最近的高影响事件", () => {
    const list = [
      ev({ id: "far-high", start: "2026-01-06T00:00:00Z", impact: "high" }),
      ev({ id: "near-mid", start: "2026-01-05T00:00:00Z", impact: "medium" }),
    ]
    expect(heroEvent(list, Date.parse("2026-01-01T00:00:00Z"))?.id).toBe("far-high")
  })

  it("没有高影响时退而取最近的未来事件；全部结束则无英雄", () => {
    const list = [ev({ id: "mid", start: "2026-01-05T00:00:00Z", impact: "medium" })]
    expect(heroEvent(list, Date.parse("2026-01-01T00:00:00Z"))?.id).toBe("mid")
    expect(heroEvent(list, Date.parse("2026-01-20T00:00:00Z"))).toBeNull()
  })

  it("无日期时间窗（window）不参与英雄卡：对它倒数没有意义", () => {
    const list = [
      ev({ id: "w", start: "2026-01-01T00:00:00Z", end: "2026-02-01T00:00:00Z", window: { zh: "Q1", en: "Q1" } }),
      ev({ id: "real", start: "2026-01-10T00:00:00Z" }),
    ]
    expect(heroEvent(list, Date.parse("2026-01-02T00:00:00Z"))?.id).toBe("real")
  })
})

describe("countdownParts", () => {
  it("1天1小时1分1秒", () => {
    expect(countdownParts(((1 * 24 + 1) * 60 + 1) * 60_000 + 1_000)).toEqual({ d: 1, h: 1, m: 1, s: 1 })
  })

  it("负数与零钳到全 0（进入进行中前的最后一秒）", () => {
    expect(countdownParts(-1)).toEqual({ d: 0, h: 0, m: 0, s: 0 })
    expect(countdownParts(0)).toEqual({ d: 0, h: 0, m: 0, s: 0 })
  })
})

describe("eventProgress", () => {
  it("窗口中点为 0.5，窗口外为 null，无 end 恒为 null", () => {
    const e = ev({ id: "p", start: "2026-01-01T00:00:00Z", end: "2026-01-01T02:00:00Z" })
    expect(eventProgress(e, Date.parse("2026-01-01T00:30:00Z"))).toBeCloseTo(0.25, 6)
    expect(eventProgress(e, Date.parse("2026-01-01T01:00:00Z"))).toBeCloseTo(0.5, 6)
    expect(eventProgress(e, Date.parse("2026-01-01T03:00:00Z"))).toBeNull()
    expect(eventProgress(ev({ id: "no-end", start: "2026-01-01T00:00:00Z" }), Date.now())).toBeNull()
  })
})

describe("groupEventsByDay / localDayKey", () => {
  it("按本地日期连续分组，保持组内顺序", () => {
    const list = [
      ev({ id: "a", start: "2026-01-01T23:00:00Z" }),
      ev({ id: "b", start: "2026-01-02T01:00:00Z" }),
      ev({ id: "c", start: "2026-01-02T23:30:00Z" }),
    ]
    // 用与实现相同的本地日键推期望值，测试在任何时区下都自洽
    const k1 = localDayKey(Date.parse("2026-01-01T23:00:00Z"))
    const k2a = localDayKey(Date.parse("2026-01-02T01:00:00Z"))
    const k2b = localDayKey(Date.parse("2026-01-02T23:30:00Z"))
    const groups = groupEventsByDay(sortedEvents(list))
    if (k2a === k1) {
      // 极端时区下 a、b 同日：合并为一组
      expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([["a", "b"], ["c"]])
    } else {
      expect(k2a).toBe(k2b)
      expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([["a"], ["b", "c"]])
    }
  })

  it("dayKey 为 YYYY-MM-DD 形态", () => {
    expect(localDayKey(Date.UTC(2026, 8, 8))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("statusCounts", () => {
  it("三态计数之和等于总数，且 2026-09-08 中午切片符合数据集事实", () => {
    const now = Date.parse("2026-09-08T12:00:00Z")
    const c = statusCounts(MARKET_EVENTS, now)
    expect(c.upcoming + c.live + c.finished).toBe(MARKET_EVENTS.length)
    expect(c.finished).toBe(5)
    expect(c.live).toBe(0)
    expect(c.upcoming).toBe(MARKET_EVENTS.length - 5)
  })
})

describe("srcZone", () => {
  it("按 ISO 偏移映射到事件原生时区", () => {
    const by = (id: string) => MARKET_EVENTS.find((e) => e.id === id)!
    expect(srcZone(by("fomc-2026-09"))?.iana).toBe("America/New_York")
    expect(srcZone(by("fomc-2026-12"))?.iana).toBe("America/New_York")
    expect(srcZone(by("ecb-2026-09"))?.iana).toBe("Europe/Berlin")
    expect(srcZone(by("ecb-2026-10"))?.iana).toBe("Europe/Berlin")
    expect(srcZone(by("sui-unlock-2026-09"))?.iana).toBe("UTC")
  })

  it("未知偏移返回 null", () => {
    expect(srcZone(ev({ id: "x", start: "2026-01-01T00:00:00+09:00" }))).toBeNull()
  })
})

describe("buildIcs", () => {
  const by = (id: string) => MARKET_EVENTS.find((e) => e.id === id)!
  const STAMP = Date.parse("2026-01-01T00:00:00Z")

  it("定时事件：UTC 时刻 + 显式 end", () => {
    const ics = buildIcs(by("ecb-2026-09"), "zh", STAMP)
    expect(ics).toContain("DTSTART:20260910T121500Z") // 14:15+02:00 → 12:15Z
    expect(ics).toContain("DTEND:20260910T134500Z") // 15:45+02:00 → 13:45Z
    expect(ics).toContain("DTSTAMP:20260101T000000Z")
    expect(ics).toContain("UID:ecb-2026-09@crypto-status")
  })

  it("瞬时事件：无 end 时 DTEND 为开始 + 反应窗口", () => {
    const ics = buildIcs(by("cpi-2026-09"), "zh", STAMP)
    expect(ics).toContain("DTSTART:20260911T123000Z") // 08:30-04:00 → 12:30Z
    expect(ics).toContain(`DTEND:20260911T133000Z`)
  })

  it("approx 事件导出为全天事项（DTEND 排他次日）", () => {
    const ics = buildIcs(by("sui-unlock-2026-09"), "zh", STAMP)
    expect(ics).toContain("DTSTART;VALUE=DATE:20260903")
    expect(ics).toContain("DTEND;VALUE=DATE:20260904")
  })

  it("window 事件导出为跨日全天区间", () => {
    const ics = buildIcs(by("glamsterdam-mainnet"), "zh", STAMP)
    expect(ics).toContain("DTSTART;VALUE=DATE:20261001")
    expect(ics).toContain("DTEND;VALUE=DATE:20270101") // 12-31 23:59:59Z + 1d
  })

  it("文本转义 RFC 5545（逗号/分号）且行尾 CRLF", () => {
    const tricky = ev({ id: "t", zh: "A, B; C", descZh: "x", start: "2026-01-01T00:00:00Z" })
    const ics = buildIcs(tricky, "zh", STAMP)
    expect(ics).toContain("SUMMARY:A\\, B\\; C")
    expect(ics.endsWith("\r\n")).toBe(true)
    expect(ics.split("\r\n").length).toBeGreaterThan(10)
    expect(ics.split("\r\n").some((l) => !l.endsWith("\r") && l.includes("\n"))).toBe(false)
  })
})

describe("extrapolateRecurringEvents", () => {
  // 真实硬编码基线 + 默认 18 个月；所有期望值先经独立日历脚本核算
  const out = extrapolateRecurringEvents(HARDCODED_MARKET_EVENTS)
  const byId = (id: string) => out.find((e) => e.id === id)!
  const series = (prefix: string) => out.filter((e) => e.id.startsWith(`${prefix}-`))
  /** id（如 nfp-2027-03）→ 0 起月份序号，用于「月份连续无空洞」断言 */
  const monthIdx = (id: string) => {
    const [, y, m] = id.split("-")
    return Number(y) * 12 + Number(m) - 1
  }

  it("全部条目 approx === true、macro/high，且不与硬编码 id 重复", () => {
    const hardcodedIds = new Set(HARDCODED_MARKET_EVENTS.map((e) => e.id))
    expect(out.length).toBeGreaterThan(0)
    for (const e of out) {
      expect(e.approx).toBe(true)
      expect(e.category).toBe("macro")
      expect(e.impact).toBe("high")
      expect(hardcodedIds.has(e.id)).toBe(false)
    }
  })

  it("NFP 落在每月第一个周五；UTC 时刻覆盖 EDT/EST 双向切换（EST→13:30Z，EDT→12:30Z）", () => {
    for (const e of series("nfp")) {
      const d = new Date(eventStartMs(e))
      expect(d.getUTCDay()).toBe(5) // 周五（08:30 ET = 12:30/13:30 UTC，同一天）
      expect(d.getUTCDate()).toBeLessThanOrEqual(7) // 且是该月第一个周五
    }
    // 边界月逐个锁定：3 月第一个周五(3/5)在第二个周日(3/14)前 → 仍 EST
    expect(eventStartMs(byId("nfp-2027-03"))).toBe(Date.parse("2027-03-05T13:30:00Z"))
    expect(eventStartMs(byId("nfp-2027-04"))).toBe(Date.parse("2027-04-02T12:30:00Z"))
    // 11 月第一个周五(11/5)在第一个周日(11/7)前 → 仍 EDT（固定偏移会错 1 小时）
    expect(eventStartMs(byId("nfp-2027-11"))).toBe(Date.parse("2027-11-05T12:30:00Z"))
    expect(eventStartMs(byId("nfp-2027-12"))).toBe(Date.parse("2027-12-03T13:30:00Z"))
  })

  it("NFP 规则精确复现 2026 全部硬编码日期（含 11 月 EST 切换），规则有人工数据背书", () => {
    // 以 2026-07 为唯一锚点外推半年，8–12 月应与人工核对数据逐字一致
    const base = [ev({ id: "nfp-2026-07", start: "2026-07-03T08:30:00-04:00" })]
    const got = extrapolateRecurringEvents(base, 6)
    for (const m of ["08", "09", "10", "11", "12"]) {
      const want = HARDCODED_MARKET_EVENTS.find((e) => e.id === `nfp-2026-${m}`)!
      expect(got.find((e) => e.id === want.id)?.start).toBe(want.start)
    }
  })

  it("FOMC/ECB 每年 8 次（1/3/4/6/7/9/10/12 月），分别落在周三/周四，时刻与时长正确", () => {
    const months = ["2027-01", "2027-03", "2027-04", "2027-06", "2027-07", "2027-09", "2027-10", "2027-12", "2028-01", "2028-03", "2028-04", "2028-06"]
    expect(series("fomc").map((e) => e.id)).toEqual(months.map((m) => `fomc-${m}`))
    expect(series("ecb").map((e) => e.id)).toEqual(months.map((m) => `ecb-${m}`))
    for (const e of series("fomc")) expect(new Date(eventStartMs(e)).getUTCDay()).toBe(3) // 周三
    for (const e of series("ecb")) expect(new Date(eventStartMs(e)).getUTCDay()).toBe(4) // 周四
    // 决议窗口 90 分钟：FOMC 14:00–15:30 ET；ECB 14:15–15:45 法兰克福
    expect(byId("fomc-2027-01").start).toBe("2027-01-13T14:00:00-05:00")
    expect(byId("fomc-2027-01").end).toBe("2027-01-13T15:30:00-05:00")
    expect(eventEndMs(byId("fomc-2027-01")) - eventStartMs(byId("fomc-2027-01"))).toBe(90 * 60_000)
    expect(byId("ecb-2027-01").start).toBe("2027-01-14T14:15:00+01:00") // 冬令时 CET
    expect(byId("ecb-2027-04").start).toBe("2027-04-08T14:15:00+02:00") // 3 月最后一个周日(3/28)后 → CEST
    expect(byId("fomc-2027-12").start).toBe("2027-12-08T14:00:00-05:00") // 11 月已回 EST
  })

  it("CPI 每月一次（12 日 08:30 ET），跨夏令时月份 UTC 时刻正确", () => {
    expect(series("cpi").map((e) => e.id)[0]).toBe("cpi-2027-01")
    expect(series("cpi").map((e) => e.id).at(-1)).toBe("cpi-2028-06")
    expect(eventStartMs(byId("cpi-2027-03"))).toBe(Date.parse("2027-03-12T13:30:00Z")) // 3/14 才切 EDT
    expect(eventStartMs(byId("cpi-2028-03"))).toBe(Date.parse("2028-03-12T12:30:00Z")) // 恰在第二个周日(3/12)当天
  })

  it("起点紧接最后硬编码事件：无重叠（均晚于同系列硬编码）无空洞（NFP/CPI 月份连续）", () => {
    const lastHard = Math.max(...HARDCODED_MARKET_EVENTS.filter((e) => e.id.startsWith("nfp-")).map(eventStartMs))
    for (const e of series("nfp")) expect(eventStartMs(e)).toBeGreaterThan(lastHard)
    for (const prefix of ["nfp", "cpi"]) {
      const idx = series(prefix).map((e) => monthIdx(e.id))
      expect(idx[0]).toBe(2027 * 12) // 从 2027-01 紧接 2026-12
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBe(idx[i - 1] + 1)
      expect(idx).toHaveLength(18)
    }
    // 输出整体按开始时刻升序
    for (let i = 1; i < out.length; i++) expect(eventStartMs(out[i])).toBeGreaterThan(eventStartMs(out[i - 1]))
  })

  it("months 截止参数生效", () => {
    expect(extrapolateRecurringEvents(HARDCODED_MARKET_EVENTS, 1).map((e) => e.id)).toEqual([
      "nfp-2027-01", "cpi-2027-01", "fomc-2027-01", "ecb-2027-01",
    ])
    expect(extrapolateRecurringEvents(HARDCODED_MARKET_EVENTS, 2).map((e) => e.id)).toEqual([
      "nfp-2027-01", "cpi-2027-01", "fomc-2027-01", "ecb-2027-01", "nfp-2027-02", "cpi-2027-02",
    ])
    expect(extrapolateRecurringEvents(HARDCODED_MARKET_EVENTS, 0)).toEqual([])
  })

  it("与硬编码 id 撞车时让位去重：已补充的 nfp-2027-01 不再生成，历史不因外推重复", () => {
    const base = [
      ...HARDCODED_MARKET_EVENTS,
      ev({ id: "nfp-2027-01", start: "2027-01-01T13:30:00Z" }), // 手工补充的未来硬编码
    ]
    const got = extrapolateRecurringEvents(base, 1)
    expect(got.map((e) => e.id)).toEqual(["cpi-2027-01", "fomc-2027-01", "ecb-2027-01"])
    const ids = new Set(base.map((e) => e.id))
    for (const e of got) expect(ids.has(e.id)).toBe(false)
  })

  it("外推条目 ICS 导出为全天事项（approx 自动降级）", () => {
    const ics = buildIcs(byId("fomc-2027-01"), "zh", Date.parse("2026-01-01T00:00:00Z"))
    expect(ics).toContain("DTSTART;VALUE=DATE:20270113")
    expect(ics).toContain("DTEND;VALUE=DATE:20270114") // 排他次日
    expect(ics).not.toContain("DTSTART:2027")
  })

  it("MARKET_EVENTS 合并后：硬编码终点（2026-12）之后仍有事件，id 唯一，2027 年起 Upcoming 非空", () => {
    expect(MARKET_EVENTS.length).toBe(HARDCODED_MARKET_EVENTS.length + out.length)
    const ids = new Set(MARKET_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(MARKET_EVENTS.length)
    expect(MARKET_EVENTS.some((e) => e.id === "nfp-2027-06")).toBe(true)
    // 消费方视角：最晚硬编码事件全部结束后，页面不再「全部已结束」
    const c = statusCounts(MARKET_EVENTS, Date.parse("2027-06-01T00:00:00Z"))
    expect(c.upcoming).toBeGreaterThan(0)
  })
})
