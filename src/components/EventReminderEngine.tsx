/**
 * 事件提醒引擎 — 挂在 App 根部的无头组件（与 AlertEngine 同层）。
 *
 * useNow 每秒驱动：读库（不闭包 state）→ collectDue 检查到期 →
 *   提前窗口内 → 标记已触发 + toast + 浏览器通知（已授权时）+ 提示音 + 振动
 *   已开始（错过窗口）→ 静默核销
 *
 * 提醒规则由事件日历页写入 localStorage；站点任意页面打开期间均有效。
 */

import { useEffect, useRef } from "react"

import { pushToast } from "@/components/ui/toast"
import { useNow } from "@/hooks/useNow"
import { dateLocale, t, useLocale } from "@/i18n"
import { readSound } from "@/lib/alerts"
import { alertBeep } from "@/lib/beep"
import { MARKET_EVENTS } from "@/lib/events"
import { collectDue, markFired, readReminders, REMINDERS_CHANGE_EVENT, type ReminderMap } from "@/lib/eventReminders"

export function EventReminderEngine() {
  const now = useNow()
  const { locale } = useLocale()

  // 提醒簿镜像：挂载与库变更事件时重读（与 AlertEngine 同模式），
  // 旧实现每秒随 useNow 心跳 JSON.parse 整个提醒簿
  const mapRef = useRef<ReminderMap>({})
  useEffect(() => {
    const sync = () => {
      mapRef.current = readReminders()
    }
    sync()
    window.addEventListener(REMINDERS_CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(REMINDERS_CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  useEffect(() => {
    const plan = collectDue(MARKET_EVENTS, mapRef.current, now)
    for (const id of plan.toExpire) markFired(id)
    for (const e of plan.toFire) {
      markFired(e.id)

      const title = t("ev.toast.title")
      const when = new Date(Date.parse(e.start)).toLocaleTimeString(dateLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      const desc = t("ev.toast.desc", { title: locale === "en" ? e.en : e.zh, time: when })

      pushToast({ title, desc, to: "/events" })

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(title, { body: desc, tag: `event-${e.id}` })
          n.onclick = () => {
            window.focus()
            location.hash = "#/events"
          }
        } catch {
          /* 部分环境（如部分 WebView）构造失败，忽略 */
        }
      }

      if (readSound()) alertBeep()
      try {
        navigator.vibrate?.([120, 60, 120])
      } catch {
        /* 不支持则跳过 */
      }
    }
  }, [now, locale])

  return null
}
