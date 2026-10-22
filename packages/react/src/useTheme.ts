import { useSyncExternalStore } from "react"

import { getTheme, setTheme, subscribeTheme, type ThemeId } from "@repo/core/theme"

/**
 * 主题 react 绑定：store 状态在 @repo/core/theme（模块级单一数据源），
 * 任何持有旧值的实例重挂载（路由切换 / HMR）都不会把主题拍回旧值。
 */
export function useTheme(): { theme: ThemeId; setTheme: (t: ThemeId) => void } {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)
  return { theme, setTheme }
}

// 主题常量随 store 一并转述（消费方免二次跳包）
export { THEMES, THEME_COLORS, type ThemeId } from "@repo/core/theme"
