/**
 * 本地数据一键备份 — 持仓 / 预警 / 自选 / 事件提醒四域的 JSON 导出与导入。
 * 这些数据唯一存于 localStorage（无账号、无后端），清缓存即全部丢失；
 * 备份文件随身保存，换设备或清缓存后可一键还原。
 *
 * 导入只做「版本字段 + 四域容器结构」的粗粒度校验（刻意不依赖各域
 * sanitize —— alerts.ts 的 sanitizeRule 等均未导出），条目级脏数据由
 * 各域读侧 sanitize 兜底（如 alerts read() 的 map(sanitizeRule).filter、
 * portfolio read() 的 map(sanitizeHolding)）。校验不通过立即拒绝，
 * 绝不动现有数据。
 */

import { ALERTS_CHANGE_EVENT } from "@/lib/alerts"
import { REMINDERS_CHANGE_EVENT } from "@/lib/eventReminders"
import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

/** 备份格式版本：结构不兼容的变更时递增，导入端只接受同版本文件 */
export const BACKUP_VERSION = 1

export const BACKUP_FILENAME_PREFIX = "crypto-status-backup"

/** 备份文件结构：四域数据以各自库内存量形态（数组 / 对象）内嵌 */
export interface BackupFile {
  app: "crypto-status"
  version: number
  exportedAt: number
  data: {
    /** 自选 coin id 列表（读侧会过滤非字符串项） */
    favorites: unknown[]
    /** Holding[]（读侧逐条 sanitize） */
    portfolio: unknown[]
    /** AlertRule[]（读侧逐条 sanitize） */
    alerts: unknown[]
    /** 事件提醒 map（读侧逐条 sanitize） */
    eventReminders: Record<string, unknown>
  }
}

/**
 * favorites / portfolio 的变更事件常量未导出（useFavorites.ts /
 * portfolio.ts 内的私有字面量，且不在本模块可改范围），与库内派发的
 * 字符串同名即可触发各 hook 重读。
 */
const FAVORITES_CHANGE_EVENT = "crypto-status:favorites-change"
const PORTFOLIO_CHANGE_EVENT = "crypto-status:portfolio-change"

/** 导入成功后需要唤醒重读的四域变更事件 */
const CHANGE_EVENTS = [
  FAVORITES_CHANGE_EVENT,
  PORTFOLIO_CHANGE_EVENT,
  ALERTS_CHANGE_EVENT,
  REMINDERS_CHANGE_EVENT,
]

/** 读库并宽容解析：键不存在 / 内容损坏时回退默认值（导出永远产出合法文件） */
function readLeniently(key: string, fallback: unknown[]): unknown[] {
  const raw = storageGet(key)
  if (raw == null) return fallback
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : fallback
  } catch {
    return fallback
  }
}

function readRemindersLeniently(): Record<string, unknown> {
  const raw = storageGet(STORAGE_KEYS.eventReminders)
  if (raw == null) return {}
  try {
    const v = JSON.parse(raw)
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {}
    return v as Record<string, unknown>
  } catch {
    return {}
  }
}

/** 打包当前四域数据为备份对象（导出的唯一入口） */
export function buildBackup(): BackupFile {
  return {
    app: "crypto-status",
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    data: {
      favorites: readLeniently(STORAGE_KEYS.favorites, []),
      portfolio: readLeniently(STORAGE_KEYS.portfolio, []),
      alerts: readLeniently(STORAGE_KEYS.alerts, []),
      eventReminders: readRemindersLeniently(),
    },
  }
}

/** 浏览器内生成备份 JSON 并触发下载（复刻事件页 ICS 导出的 a.download 先例） */
export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${BACKUP_FILENAME_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  // 立即 revoke 在个别浏览器会截断尚未开始的下载，让出一拍再回收
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export interface ImportCounts {
  favorites: number
  portfolio: number
  alerts: number
  eventReminders: number
}

export type ImportResult =
  | { ok: true; counts: ImportCounts }
  | { ok: false; error: "parse" | "shape" }

/** 粗粒度校验：app 标识 + 版本号 + 四域容器类型，通过才允许写库 */
function validateBackup(raw: unknown): BackupFile | null {
  if (typeof raw !== "object" || raw === null) return null
  const f = raw as Record<string, unknown>
  if (f.app !== "crypto-status") return null
  if (f.version !== BACKUP_VERSION) return null
  if (typeof f.data !== "object" || f.data === null) return null
  const d = f.data as Record<string, unknown>
  if (!Array.isArray(d.favorites)) return null
  if (!Array.isArray(d.portfolio)) return null
  if (!Array.isArray(d.alerts)) return null
  if (typeof d.eventReminders !== "object" || d.eventReminders === null || Array.isArray(d.eventReminders)) {
    return null
  }
  return {
    app: "crypto-status",
    version: BACKUP_VERSION,
    exportedAt: typeof f.exportedAt === "number" ? f.exportedAt : Date.now(),
    data: {
      favorites: d.favorites,
      portfolio: d.portfolio,
      alerts: d.alerts,
      eventReminders: d.eventReminders as Record<string, unknown>,
    },
  }
}

/**
 * 校验并导入备份：整体校验通过后一次性写回四域原始存储键，随后派发
 * 各域变更事件让页内 hooks 立即重读。任一校验失败直接返回错误，
 * 现有数据分毫不动。
 */
export function importBackup(text: string): ImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "parse" }
  }
  const backup = validateBackup(parsed)
  if (!backup) return { ok: false, error: "shape" }

  storageSet(STORAGE_KEYS.favorites, JSON.stringify(backup.data.favorites))
  storageSet(STORAGE_KEYS.portfolio, JSON.stringify(backup.data.portfolio))
  storageSet(STORAGE_KEYS.alerts, JSON.stringify(backup.data.alerts))
  storageSet(STORAGE_KEYS.eventReminders, JSON.stringify(backup.data.eventReminders))
  for (const ev of CHANGE_EVENTS) window.dispatchEvent(new CustomEvent(ev))

  return {
    ok: true,
    counts: {
      favorites: backup.data.favorites.length,
      portfolio: backup.data.portfolio.length,
      alerts: backup.data.alerts.length,
      eventReminders: Object.keys(backup.data.eventReminders).length,
    },
  }
}
