/**
 * 事件提醒 — localStorage 持久化的事件 ID 集（含触发记录）。
 *
 * EventReminderEngine（挂在 App 根部）每秒检查：
 *   进入提前窗口（开始前 REMINDER_LEAD_MS）→ toast + 浏览器通知 + 提示音；
 *   已开始却未触发（如页面在窗口期之后才打开）→ 静默核销，避免打开即轰炸。
 *
 * 与 alerts.ts 同一套「写库派发自定义事件 + storage 事件跨标签同步」模式。
 * 提醒同样只在站点打开期间有效 —— 静态站的固有限制，页面文案已披露。
 */

import { useCallback, useEffect, useState } from "react"

import { eventStartMs, type MarketEvent } from "@/lib/events"
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

/** 提前多少毫秒提醒 */
export const REMINDER_LEAD_MS = 10 * 60_000

export interface ReminderEntry {
  addedAt: number
  firedAt: number | null
}

export type ReminderMap = Record<string, ReminderEntry>

const STORAGE_KEY = STORAGE_KEYS.eventReminders
/** 库变更事件（页内写库后派发）；触发引擎订阅它重读，免去每秒 JSON.parse */
export const REMINDERS_CHANGE_EVENT = "crypto-status:event-reminders-change"
const EVENT = REMINDERS_CHANGE_EVENT

function sanitize(raw: unknown): ReminderMap {
  const out: ReminderMap = {}
  if (typeof raw !== "object" || raw === null) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "object" || v === null) continue
    const r = v as Record<string, unknown>
    out[id] = {
      addedAt: typeof r.addedAt === "number" ? r.addedAt : Date.now(),
      firedAt: typeof r.firedAt === "number" ? r.firedAt : null,
    }
  }
  return out
}

export function readReminders(): ReminderMap {
  const raw = storageGet(STORAGE_KEY)
  try {
    return sanitize(JSON.parse(raw ?? "{}"))
  } catch {
    return {}
  }
}

function write(map: ReminderMap) {
  storageSet(STORAGE_KEY, JSON.stringify(map))
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** 开关某事件的提醒；返回开关后的状态（true = 已开启） */
export function toggleReminder(id: string): boolean {
  const map = readReminders()
  if (map[id]) delete map[id]
  else map[id] = { addedAt: Date.now(), firedAt: null }
  write(map)
  return id in map
}

/** 触发引擎直接调用的写库入口（不经 hook，避免闭包过期） */
export function markFired(id: string) {
  const map = readReminders()
  if (!map[id] || map[id].firedAt != null) return
  map[id] = { ...map[id], firedAt: Date.now() }
  write(map)
}

export interface DuePlan {
  /** 进入提前窗口、应立即提醒的事件 */
  toFire: MarketEvent[]
  /** 已开始、窗口已错过、应静默核销的事件 id */
  toExpire: string[]
}

/** 到期检查（纯函数）：未设/已触发的跳过；窗口内待触发，已开始则核销 */
export function collectDue(events: MarketEvent[], map: ReminderMap, now: number): DuePlan {
  const plan: DuePlan = { toFire: [], toExpire: [] }
  for (const e of events) {
    const r = map[e.id]
    if (!r || r.firedAt != null) continue
    const start = eventStartMs(e)
    if (now >= start) plan.toExpire.push(e.id)
    else if (now >= start - REMINDER_LEAD_MS) plan.toFire.push(e)
  }
  return plan
}

/* --------------------------------- hook --------------------------------- */

export function useEventReminders() {
  const [reminders, setReminders] = useState<ReminderMap>(readReminders)

  useEffect(() => {
    const sync = () => setReminders(readReminders())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const toggle = useCallback((id: string) => toggleReminder(id), [])

  return { reminders, toggle }
}
