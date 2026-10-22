import { useCallback, useEffect, useState } from "react"

import { readReminders, toggleReminder, type ReminderMap } from "@repo/core/eventReminders"
import { subscribeDomainChange } from "@repo/core/eventPort"

/** 事件提醒 hook — 域存储在 @repo/core/eventReminders；双通道端口同步。 */
export function useEventReminders() {
  const [reminders, setReminders] = useState<ReminderMap>(readReminders)

  useEffect(() => subscribeDomainChange("eventReminders", () => setReminders(readReminders())), [])

  const toggle = useCallback((id: string) => toggleReminder(id), [])

  return { reminders, toggle }
}
