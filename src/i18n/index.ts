import { useSyncExternalStore } from "react"

import { en } from "./en"
import { zh, type MessageKey } from "./zh"

export type { MessageKey } from "./zh"

/**
 * 轻量 i18n — 与 useTheme 同一套 useSyncExternalStore 单例 store 模式：
 * 模块级唯一 locale 状态，Header 语言切换 / 任意 useT() 消费者共享，
 * 切换动作同步写 html[lang] 与 localStorage，零依赖。
 *
 * 首次访问（localStorage 无记录）时按 navigator.languages 检测系统语言
 * 并写入，作为默认语言；此后以用户显式选择为准。
 */

export const LOCALES = [
  { id: "zh", label: "中文", abbr: "ZH" },
  { id: "en", label: "English", abbr: "EN" },
] as const

export type Locale = (typeof LOCALES)[number]["id"]

const STORAGE_KEY = "crypto-status-locale"

/** 可翻译消息：lib 层输出 key + 中性参数，渲染层由 tm() 还原为文案 */
export interface LMsg {
  key: MessageKey
  params?: Record<string, string | number>
}

/** 按浏览器语言偏好检测默认语言；非中英文环境回退英文 */
function detectLocale(): Locale {
  const langs =
    typeof navigator !== "undefined"
      ? (navigator.languages ?? [navigator.language]).filter(Boolean)
      : []
  for (const l of langs) {
    const low = l.toLowerCase()
    if (low.startsWith("zh")) return "zh"
    if (low.startsWith("en")) return "en"
  }
  return "en"
}

let current: Locale | null = null
const listeners = new Set<() => void>()

function getSnapshot(): Locale {
  if (current == null) {
    let v: Locale | null = null
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      v = raw === "zh" || raw === "en" ? raw : null
    } catch {
      /* 隐私模式等场景读取失败，走检测 */
    }
    if (v == null) {
      v = detectLocale()
      try {
        localStorage.setItem(STORAGE_KEY, v)
      } catch {
        /* 写不进则仅会话内生效 */
      }
    }
    current = v
    document.documentElement.lang = v === "zh" ? "zh-CN" : "en"
  }
  return current
}

export function setLocale(l: Locale) {
  if (l === getSnapshot()) return
  current = l
  document.documentElement.lang = l === "zh" ? "zh-CN" : "en"
  try {
    localStorage.setItem(STORAGE_KEY, l)
  } catch {
    /* 隐私模式等场景下静默降级为会话内生效 */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function useLocale() {
  const locale = useSyncExternalStore(subscribe, getSnapshot)
  return { locale, setLocale }
}

/**
 * 取词 + {x} 插值。非 hook：读取 store 当前值，可在渲染与事件回调中直接用；
 * 组件内请通过 useT() 获取以保证语言切换时重渲染。
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const dict = getSnapshot() === "en" ? en : zh
  let s: string = dict[key] ?? zh[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

/** lib 结构化消息（或已经是展示串）→ 文案 */
export function tm(m: string | LMsg): string {
  return typeof m === "string" ? m : t(m.key, m.params)
}

/** 订阅语言切换并返回 t（组件内取词统一入口） */
export function useT() {
  useLocale()
  return t
}

/** 列表连接：中文顿号 / 英文逗号 */
export function joinList(items: string[], locale?: Locale): string {
  const l = locale ?? getSnapshot()
  return items.join(l === "zh" ? "、" : ", ")
}

/** 日期格式化所用 BCP-47 区域（月刻度 / 近 30 日轴标签共用） */
export function dateLocale(locale?: Locale): string {
  return (locale ?? getSnapshot()) === "zh" ? "zh-CN" : "en-US"
}
