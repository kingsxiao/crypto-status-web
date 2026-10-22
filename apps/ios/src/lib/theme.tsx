import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { StatusBar } from "expo-status-bar"

import { getTheme, subscribeTheme, THEMES, type ThemeId } from "@repo/core/theme"
import { cssTokens, radius } from "@repo/ui-tokens/theme"

import { rnColor } from "./colors"

/**
 * RN 主题上下文 — store 在 @repo/core/theme；色板转述 @repo/ui-tokens
 * （apps/web/src/index.css 唯一事实源）。iOS edge-to-edge 下状态栏色由
 * 系统 UI 接管（THEME_COLORS 的消费点在 web meta / 自定义导航条背景）。
 * RN 原生不识别 oklch()：rnColor() 按色值字符串程序化转换
 * （hsl 直通，oklch 经 OKLab→sRGB 数值转换，无第二份手工事实源）。
 */

const ThemeCtx = createContext<{
  theme: ThemeId
  tokens: (typeof cssTokens)[ThemeId]
  c: (key: keyof (typeof cssTokens)["mono"]) => string
}>({ theme: "mono", tokens: cssTokens.mono, c: (k) => rnColor(cssTokens.mono[k]) })

export function useAppTheme() {
  return useContext(ThemeCtx)
}

/** 主题枚举转述（设置页切换用） */
export { THEMES, type ThemeId, radius }

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(getTheme)
  useEffect(() => subscribeTheme(() => setThemeState(getTheme())), [])
  const tokens = cssTokens[theme]
  const c = (k: keyof typeof tokens) => rnColor(tokens[k])
  return (
    <ThemeCtx.Provider value={{ theme, tokens, c }}>
      <StatusBar style="light" />
      {children}
    </ThemeCtx.Provider>
  )
}
