/**
 * 价格预警 — localStorage 持久化的预警规则簿。
 * 触发引擎（AlertEngine）在实时行情每秒刷新时检查 active 规则：
 *   上穿（above）：现价 ≥ 目标价；下穿（below）：现价 ≤ 目标价。
 * 触发后规则转为 triggered 保留在列表中作为历史，可一键重新武装。
 *
 * 浏览器通知权限与提示音开关也归属本模块（同为预警体验的一部分）。
 */

import { useCallback, useEffect, useState } from "react"

import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

export type AlertKind = "above" | "below"
export type AlertStatus = "active" | "triggered"

export interface AlertRule {
  id: string
  coinId: string
  /** 展示用冗余字段，数据源缺失时兜底 */
  symbol: string
  kind: AlertKind
  /** 目标价（> 0） */
  price: number
  createdAt: number
  status: AlertStatus
  triggeredAt: number | null
  triggeredPrice: number | null
}

const STORAGE_KEY = STORAGE_KEYS.alerts
const SOUND_KEY = STORAGE_KEYS.alertSound
/** 库变更事件（页内写库后派发）；触发引擎订阅它重读，免去每秒 JSON.parse */
export const ALERTS_CHANGE_EVENT = "crypto-status:alerts-change"
const EVENT = ALERTS_CHANGE_EVENT

/** 规则数上限：防止 localStorage 无限增长，也避免表格失控 */
export const MAX_ALERTS = 30

function sanitizeRule(raw: unknown): AlertRule | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.coinId !== "string" || !r.coinId) return null
  if (r.kind !== "above" && r.kind !== "below") return null
  const price = Number(r.price)
  if (!Number.isFinite(price) || price <= 0) return null
  const id = typeof r.id === "string" && r.id ? r.id : `${r.coinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    coinId: r.coinId,
    symbol: typeof r.symbol === "string" && r.symbol ? r.symbol : r.coinId.slice(0, 4).toUpperCase(),
    kind: r.kind,
    price,
    createdAt: typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    status: r.status === "triggered" ? "triggered" : "active",
    triggeredAt: typeof r.triggeredAt === "number" ? r.triggeredAt : null,
    triggeredPrice:
      r.triggeredPrice != null && Number.isFinite(Number(r.triggeredPrice))
        ? Number(r.triggeredPrice)
        : null,
  }
}

function read(): AlertRule[] {
  const raw = storageGet(STORAGE_KEY)
  try {
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.map(sanitizeRule).filter((a): a is AlertRule => a !== null)
  } catch {
    return []
  }
}

function write(list: AlertRule[]) {
  storageSet(STORAGE_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function readAlerts(): AlertRule[] {
  return read()
}

/* ------------------------------ 提示音开关 ------------------------------ */

export function readSound(): boolean {
  return storageGet(SOUND_KEY) !== "0"
}

function writeSound(on: boolean) {
  storageSet(SOUND_KEY, on ? "1" : "0")
  window.dispatchEvent(new CustomEvent(EVENT))
}

/* ------------------------------ 浏览器通知 ------------------------------ */

export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  return notifySupported() ? Notification.permission : "unsupported"
}

/** 需在用户手势（点击创建预警）内调用，否则部分浏览器会拒绝 */
export function requestNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notifySupported()) return Promise.resolve("unsupported")
  return Notification.requestPermission()
}

/** 触发引擎直接调用的写库入口（不经 hook，避免闭包过期） */
export function markTriggered(id: string, price: number) {
  write(
    read().map((x) =>
      x.id === id
        ? { ...x, status: "triggered" as const, triggeredAt: Date.now(), triggeredPrice: price }
        : x
    )
  )
}

/* --------------------------------- hook --------------------------------- */

export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertRule[]>(read)
  const [sound, setSoundState] = useState<boolean>(readSound)

  useEffect(() => {
    const sync = () => {
      setAlerts(read())
      setSoundState(readSound())
    }
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const add = useCallback(
    (a: { coinId: string; symbol: string; kind: AlertKind; price: number }): AlertRule | null => {
      const cur = read()
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
      write([rule, ...cur])
      return rule
    },
    []
  )

  const remove = useCallback((id: string) => {
    write(read().filter((x) => x.id !== id))
  }, [])

  /** 重新武装已触发的规则 */
  const rearm = useCallback((id: string) => {
    write(
      read().map((x) =>
        x.id === id ? { ...x, status: "active" as const, triggeredAt: null, triggeredPrice: null } : x
      )
    )
  }, [])

  /** 清空全部历史（仅删除 triggered，保留 active） */
  const clearTriggered = useCallback(() => {
    write(read().filter((x) => x.status === "active"))
  }, [])

  const setSound = useCallback((on: boolean) => writeSound(on), [])

  return { alerts, add, remove, rearm, clearTriggered, markTriggered, sound, setSound }
}

/* ------------------------------ 判定（纯函数） ------------------------------ */

export function isTriggered(rule: Pick<AlertRule, "kind" | "price">, price: number): boolean {
  if (!Number.isFinite(price)) return false
  return rule.kind === "above" ? price >= rule.price : price <= rule.price
}

/** 目标价距当前价的百分比：above 为正（还需涨多少），below 为负 */
export function distancePct(
  rule: Pick<AlertRule, "kind" | "price">,
  price: number
): number | null {
  if (!Number.isFinite(price) || price <= 0) return null
  return ((rule.price - price) / price) * 100
}
