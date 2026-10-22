// @vitest-environment jsdom
/**
 * 事件提醒引擎（EventReminderEngine）的行为锁定 —— 组件实际消费
 * useNow 每秒心跳 + useLocale（不消费 LiveContext），到期检查由心跳驱动：
 *  - 提前窗口内到期 → collectDue → markFired → pushToast 恰好一次；
 *    后续心跳重复 tick 不重复触发（markFired 写库 → REMINDERS_CHANGE_EVENT
 *    → 提醒簿镜像重读 → firedAt 命中跳过）
 *  - REMINDERS_CHANGE_EVENT 后提醒簿重读：挂载后新开的提醒无需重挂载即可触发
 *  - 已开始（错过窗口）→ 静默核销（markFired 不 toast），打开页面不轰炸
 *
 * fake timers 同时接管 Date：用 vi.setSystemTime 把系统时间摆到目标事件
 * 的提前窗口内，再逐秒推进 useNow 心跳。
 */
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EventReminderEngine } from "@/components/EventReminderEngine"
import { eventStartMs, MARKET_EVENTS } from "@repo/core/events"
import {
  REMINDER_LEAD_MS,
  readReminders,
  toggleReminder,
} from "@repo/core/eventReminders"

/* ---------------------- 副作用出口全部打桩（toast/声音） ---------------------- */

const pushToast = vi.fn()
vi.mock("@/components/ui/toast", () => ({ pushToast: (...a: unknown[]) => pushToast(...a) }))
vi.mock("@repo/core/alerts", () => ({ readSound: () => false }))
vi.mock("@/lib/beep", () => ({ alertBeep: vi.fn() }))

/* -------------------------------- 事件选取 -------------------------------- */

/** 取一个有确定开始时刻的目标事件（避开只有时间窗的条目） */
const TARGET = MARKET_EVENTS.find((e) => e.id === "cpi-2026-09")!

describe("EventReminderEngine 到期触发", () => {
  beforeEach(() => {
    vi.useFakeTimers() // 接管 setInterval（useNow 心跳）与 Date
    localStorage.clear()
    pushToast.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it("提前窗口内：心跳驱动触发恰好一次，重复 tick 不重复触发", () => {
    const start = eventStartMs(TARGET)
    vi.setSystemTime(start - 60_000) // 开始前 1 分钟：落在 REMINDER_LEAD_MS(10min) 窗口内
    toggleReminder(TARGET.id)

    render(<EventReminderEngine />)
    // 挂载首拍（useNow 初始值即当前时刻）即评估并触发
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(readReminders()[TARGET.id]?.firedAt).toBe(start - 60_000)

    // 连续心跳推进 5 秒：firedAt 已落库，不得重复触发
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(pushToast).toHaveBeenCalledTimes(1)

    // toast 文案带事件标题（zh locale 下取 e.zh）
    expect(pushToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.any(String), to: "/events" }),
    )
  })

  it("REMINDERS_CHANGE_EVENT 后提醒簿重读：挂载后新开的提醒照样触发", () => {
    const start = eventStartMs(TARGET)
    vi.setSystemTime(start - 30_000)

    render(<EventReminderEngine />) // 挂载时无任何提醒
    expect(pushToast).not.toHaveBeenCalled()

    act(() => {
      toggleReminder(TARGET.id) // 写库 + 派发 REMINDERS_CHANGE_EVENT → 镜像重读
    })
    act(() => {
      vi.advanceTimersByTime(1000) // 下一拍心跳评估新提醒
    })
    expect(pushToast).toHaveBeenCalledTimes(1)
    expect(readReminders()[TARGET.id]?.firedAt).not.toBeNull()
  })

  it("已开始（错过提前窗口）：静默核销，不 toast", () => {
    const start = eventStartMs(TARGET)
    vi.setSystemTime(start + 1000) // 事件已开始但未触发（模拟页面晚打开）
    toggleReminder(TARGET.id)

    render(<EventReminderEngine />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(pushToast).not.toHaveBeenCalled()
    expect(readReminders()[TARGET.id]?.firedAt).not.toBeNull() // 核销落库，之后不再评估
  })

  it("未设提醒的心跳不产生任何触发", () => {
    const start = eventStartMs(TARGET)
    vi.setSystemTime(start - REMINDER_LEAD_MS + 1000) // 窗口内但用户没开提醒
    render(<EventReminderEngine />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(pushToast).not.toHaveBeenCalled()
    expect(readReminders()).toEqual({})
  })
})
