/**
 * 主题 store（纯状态层，DOM 副作用拆分为各端订阅者）：
 *  - 三套主题（参考 shadcn/ui 官网 Themes）：每套在 apps/web/src/index.css
 *    持有完整 token 集，切换时全站联动。mono 即黑白原版（默认）；blue /
 *    violet 取自 shadcn 官方色板 dark 模式原值。
 *  - THEME_COLORS 是「状态栏色（各主题 background 的 hex 近似）」三主题
 *    映射唯一事实源：web 端 meta theme-color / RN 状态栏 / index.html
 *    首帧内联脚本均以此为对齐目标（对齐测试锁死三契约）。
 *
 * 主题是模块级单一数据源：切换动作同步落 storageBus 并通知订阅者；
 * DOM 写入（html[data-theme]、theme-anim 过渡、meta theme-color）由
 * web 订阅者（apps/web/src/lib/theme-dom.ts）承担。
 */

import { STORAGE_KEYS, storageGet, storageSet } from "./storageBus"

export const THEMES = [
  { id: "mono", nameKey: "theme.mono", en: "MONO", swatch: "oklch(0.985 0 0)" },
  { id: "blue", nameKey: "theme.blue", en: "BLUE", swatch: "hsl(217.2 91.2% 59.8%)" },
  { id: "violet", nameKey: "theme.violet", en: "VIOLET", swatch: "hsl(263.4 70% 50.4%)" },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]

const STORAGE_KEY = STORAGE_KEYS.theme

/**
 * 各主题 background 的 hex 近似值，用于同步 <meta name="theme-color">
 * （PWA 状态栏 / 移动端浏览器顶栏配色；index.html 初始值 #171717 = mono）。
 * 三契约（index.css / 本常量 / index.html 首帧内联脚本）由对齐测试锁死。
 */
export const THEME_COLORS: Record<ThemeId, string> = {
  mono: "#171717", // oklch(0.09 0 0)
  blue: "#020817", // hsl(222.2 84% 4.9%)
  violet: "#030712", // hsl(224 71.4% 4.1%)
}

function normalize(v: string | null): ThemeId {
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : "mono"
}

let current: ThemeId | null = null
const listeners = new Set<() => void>()

export function getTheme(): ThemeId {
  if (current == null) {
    current = normalize(storageGet(STORAGE_KEY))
  }
  return current
}

export function setTheme(t: ThemeId) {
  if (t === getTheme()) return
  current = t
  storageSet(STORAGE_KEY, t)
  listeners.forEach((l) => l())
}

export function subscribeTheme(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** 水合后校正：按持久化重读（注册前检测值可能不符），变化时通知订阅者；不落盘 */
export function hydratePersistedTheme(): void {
  const persisted = normalize(storageGet(STORAGE_KEY))
  if (persisted !== current) {
    current = persisted
    listeners.forEach((l) => l())
  }
}
