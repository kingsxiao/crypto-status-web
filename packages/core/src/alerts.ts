/**
 * 价格预警 — localStorage 持久化的预警规则簿。
 * 触发引擎（AlertEngine）在实时行情每秒刷新时检查 active 规则：
 *   上穿（above）：现价 ≥ 目标价；下穿（below）：现价 ≤ 目标价。
 * 触发后规则转为 triggered 保留在列表中作为历史，可一键重新武装。
 *
 * 提示音开关归属本模块；浏览器通知权限（Notification API）属 web 平台，
 * 在 apps/web/src/lib/notifications.ts。hook（useAlerts）在 @repo/react。
 */

import { dispatchDomainChange, DOMAIN_CHANGE_EVENTS } from "./eventPort"
import { STORAGE_KEYS, storageGet, storageSet } from "./storageBus"

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
export const ALERTS_CHANGE_EVENT = DOMAIN_CHANGE_EVENTS.alerts

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

export function readAlerts(): AlertRule[] {
  const raw = storageGet(STORAGE_KEY)
  try {
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.map(sanitizeRule).filter((a): a is AlertRule => a !== null)
  } catch {
    return []
  }
}

export function writeAlerts(list: AlertRule[]) {
  storageSet(STORAGE_KEY, JSON.stringify(list))
  dispatchDomainChange("alerts")
}

/* ------------------------------ 提示音开关 ------------------------------ */

export function readSound(): boolean {
  return storageGet(SOUND_KEY) !== "0"
}

export function writeSound(on: boolean) {
  storageSet(SOUND_KEY, on ? "1" : "0")
  dispatchDomainChange("alerts")
}

/** 触发引擎直接调用的写库入口（不经 hook，避免闭包过期） */
export function markTriggered(id: string, price: number) {
  writeAlerts(
    readAlerts().map((x) =>
      x.id === id
        ? { ...x, status: "triggered" as const, triggeredAt: Date.now(), triggeredPrice: price }
        : x
    )
  )
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
