import { useSyncExternalStore } from "react"

import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

/**
 * 三套主题（参考 shadcn/ui 官网 Themes）：每套在 index.css 中持有完整 token 集
 * （background/card/border/muted/primary/ring/chart-1~5），切换时全站联动。
 * mono 即黑白原版（默认）；blue / violet 取自 shadcn 官方色板 dark 模式原值。
 * swatch 与各主题的 --primary 保持一致；nameKey 经词典按语言取词。
 */
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
 */
const THEME_COLORS: Record<ThemeId, string> = {
  mono: "#171717", // oklch(0.09 0 0)
  blue: "#020817", // hsl(222.2 84% 4.9%)
  violet: "#030712", // hsl(224 71.4% 4.1%)
}

function normalize(v: string | null): ThemeId {
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : "mono"
}

/**
 * 主题是模块级单一数据源：Header / Footer / AboutPage 等多处 useTheme()
 * 共享同一状态，切换动作同步写 html[data-theme] 与 localStorage。
 * 之前各实例各持 useState 副本，任何持有旧值的实例重挂载（路由切换 / HMR）
 * 都会把主题拍回旧值——useSyncExternalStore 订阅同一 store 后该竞态不再存在。
 */
let current: ThemeId | null = null
const listeners = new Set<() => void>()

function getSnapshot(): ThemeId {
  if (current == null) {
    current = normalize(storageGet(STORAGE_KEY))
  }
  return current
}

export function setTheme(t: ThemeId) {
  if (t === getSnapshot()) return
  current = t
  const root = document.documentElement
  // 主题平滑过渡：临时挂 html.theme-anim（index.css 对 background-color /
  // border-color / color / fill / stroke 开 250ms 过渡），300ms 后移除。
  // 窗口内会临时覆盖 .card-hover 等元素的 transition-property，属已知可接受行为。
  root.classList.add("theme-anim")
  root.dataset.theme = t
  window.setTimeout(() => root.classList.remove("theme-anim"), 300)
  // 同步 PWA/移动端顶栏颜色（index.html 初始 #171717）
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[t])
  storageSet(STORAGE_KEY, t)
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot)
  return { theme, setTheme }
}
