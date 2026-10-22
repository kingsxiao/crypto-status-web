import { useCallback, useEffect, useState } from "react"

import {
  markTriggered,
  MAX_ALERTS,
  readAlerts,
  readSound,
  writeAlerts,
  writeSound,
  type AlertKind,
  type AlertRule,
} from "@repo/core/alerts"
import { subscribeDomainChange } from "@repo/core/eventPort"

/**
 * 价格预警 hook — 域存储在 @repo/core/alerts；
 * 同步走双通道端口（自定义变更事件 + 跨标签 storage 事件）。
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRule[]>(readAlerts)
  const [sound, setSoundState] = useState<boolean>(readSound)

  useEffect(
    () =>
      subscribeDomainChange("alerts", () => {
        setAlerts(readAlerts())
        setSoundState(readSound())
      }),
    [],
  )

  const add = useCallback(
    (a: { coinId: string; symbol: string; kind: AlertKind; price: number }): AlertRule | null => {
      const cur = readAlerts()
      if (cur.length >= MAX_ALERTS) return null
      const rule: AlertRule = {
        id: `${a.coinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        coinId: a.coinId,
        symbol: a.symbol,
        kind: a.kind,
        price: a.price,
        createdAt: Date.now(),
        status: "active",
        triggeredAt: null,
        triggeredPrice: null,
      }
      writeAlerts([rule, ...cur])
      return rule
    },
    []
  )

  const remove = useCallback((id: string) => {
    writeAlerts(readAlerts().filter((x) => x.id !== id))
  }, [])

  /** 重新武装已触发的规则 */
  const rearm = useCallback((id: string) => {
    writeAlerts(
      readAlerts().map((x) =>
        x.id === id ? { ...x, status: "active" as const, triggeredAt: null, triggeredPrice: null } : x
      )
    )
  }, [])

  /** 清空全部历史（仅删除 triggered，保留 active） */
  const clearTriggered = useCallback(() => {
    writeAlerts(readAlerts().filter((x) => x.status === "active"))
  }, [])

  const setSound = useCallback((on: boolean) => writeSound(on), [])

  return { alerts, add, remove, rearm, clearTriggered, markTriggered, sound, setSound }
}
