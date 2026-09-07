import { useSyncExternalStore } from "react"

/**
 * 三套主题（参考 shadcn/ui 官网 Themes）：每套在 index.css 中持有完整 token 集
 * （background/card/border/muted/primary/ring/chart-1~5），切换时全站联动。
 * mono 即黑白原版（默认）；blue / violet 取自 shadcn 官方色板 dark 模式原值。
 * swatch 与各主题的 --primary 保持一致。
 */
export const THEMES = [
  { id: "mono", name: "石墨黑白", en: "MONO", swatch: "oklch(0.985 0 0)" },
  { id: "blue", name: "电光蓝", en: "BLUE", swatch: "hsl(217.2 91.2% 59.8%)" },
  { id: "violet", name: "暗夜紫", en: "VIOLET", swatch: "hsl(263.4 70% 50.4%)" },
] as const

export type ThemeId = (typeof THEMES)[number]["id"]

const STORAGE_KEY = "crypto-status-theme"

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
    try {
      current = normalize(localStorage.getItem(STORAGE_KEY))
    } catch {
      current = "mono"
    }
  }
  return current
}

export function setTheme(t: ThemeId) {
  if (t === getSnapshot()) return
  current = t
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem(STORAGE_KEY, t)
  } catch {
    /* 隐私模式等场景下静默降级为会话内生效 */
  }
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
