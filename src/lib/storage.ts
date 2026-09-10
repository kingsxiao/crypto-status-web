/**
 * localStorage 集中治理：
 *  - 全站键名的唯一出处（统一 crypto-status: 前缀）
 *  - 读写一律走 safe 访问器：SSR / 测试环境（无 localStorage 全局）与
 *    隐私模式（配额拒绝）都安全降级，模块层无需各自 try-catch
 *  - 历史遗留的两个连字符键（theme / locale）首次读取时自动迁移到新键
 */

export const STORAGE_KEYS = {
  favorites: "crypto-status:favorites",
  alerts: "crypto-status:alerts",
  alertSound: "crypto-status:alert-sound",
  portfolio: "crypto-status:portfolio",
  verdictHistory: "crypto-status:verdict-history-v1",
  eventReminders: "crypto-status:event-reminders",
  chartPrefs: "crypto-status:chart-prefs",
  theme: "crypto-status:theme",
  locale: "crypto-status:locale",
} as const

/** 旧命名 → 新键（仅 theme / locale 两个历史连字符键需要迁移） */
const LEGACY_TO_NEW: Record<string, string> = {
  "crypto-status-theme": STORAGE_KEYS.theme,
  "crypto-status-locale": STORAGE_KEYS.locale,
}

export function storageGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    const cur = localStorage.getItem(key)
    if (cur != null) return cur
    const legacy = Object.entries(LEGACY_TO_NEW).find(([, newKey]) => newKey === key)?.[0]
    if (!legacy) return null
    const oldVal = localStorage.getItem(legacy)
    if (oldVal == null) return null
    // 首次读到旧键：搬运到新键并清掉旧键，避免双份漂移
    localStorage.setItem(key, oldVal)
    localStorage.removeItem(legacy)
    return oldVal
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 配额满等场景静默失败 */
  }
}
