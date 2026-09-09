import { describe, expect, it } from "vitest"

import type { MarketEvent } from "@/lib/events"
import { collectDue, readReminders, REMINDER_LEAD_MS, type ReminderMap } from "@/lib/eventReminders"

const START = Date.parse("2026-01-02T12:00:00Z")

function ev(id: string): MarketEvent {
  return { id, zh: id, en: id, category: "macro", impact: "high", start: "2026-01-02T12:00:00Z" }
}

const on = (id: string, fired = false): ReminderMap => ({
  [id]: { addedAt: 0, firedAt: fired ? 1 : null },
})

describe("collectDue", () => {
  it("提前窗口之前不触发", () => {
    const now = START - REMINDER_LEAD_MS - 1
    expect(collectDue([ev("a")], on("a"), now)).toEqual({ toFire: [], toExpire: [] })
  })

  it("进入提前窗口即触发（含边界）", () => {
    const now = START - REMINDER_LEAD_MS
    const plan = collectDue([ev("a")], on("a"), now)
    expect(plan.toFire.map((e) => e.id)).toEqual(["a"])
    expect(plan.toExpire).toEqual([])
  })

  it("已开始（错过窗口）→ 静默核销而非补发", () => {
    const now = START + 1
    const plan = collectDue([ev("a")], on("a"), now)
    expect(plan.toFire).toEqual([])
    expect(plan.toExpire).toEqual(["a"])
  })

  it("已触发过的与未设置的都跳过", () => {
    const now = START - REMINDER_LEAD_MS + 1
    expect(collectDue([ev("a"), ev("b")], { ...on("a", true) }, now).toFire).toEqual([])
    expect(collectDue([ev("a")], {}, now).toFire).toEqual([])
  })

  it("多事件混合分流", () => {
    const early = { ...ev("early"), start: "2026-01-02T10:00:00Z" } // 已开始
    const mid = { ...ev("mid"), start: "2026-01-02T12:05:00Z" } // 窗口内（12:05 - 10min = 11:55 ≤ now）
    const late = { ...ev("late"), start: "2026-01-02T20:00:00Z" }
    const now = Date.parse("2026-01-02T12:00:00Z")
    const map: ReminderMap = { ...on("early"), ...on("mid"), ...on("late") }
    const plan = collectDue([early, mid, late], map, now)
    expect(plan.toFire.map((e) => e.id)).toEqual(["mid"])
    expect(plan.toExpire).toEqual(["early"])
  })
})

describe("readReminders", () => {
  it("无 localStorage 环境（node 测试）返回空对象且不抛错", () => {
    expect(readReminders()).toEqual({})
  })
})
