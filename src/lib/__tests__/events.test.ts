import { describe, expect, it } from "vitest"

import {
  countdownParts,
  eventEndMs,
  eventProgress,
  eventStartMs,
  eventStatus,
  filterEvents,
  groupEventsByDay,
  heroEvent,
  localDayKey,
  LIVE_WINDOW_MS,
  MARKET_EVENTS,
  sortedEvents,
  type MarketEvent,
} from "@/lib/events"

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
