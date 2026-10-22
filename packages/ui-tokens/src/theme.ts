/**
 * RN 三主题色板 — 以 apps/web/src/index.css 为唯一事实源手工对齐
 * （对齐测试锁死；改 index.css 必跑 packages/ui-tokens 测试）：
 *  - 每主题一套完整 token（background/card/border/muted/primary/ring/
 *    chart-1..5/涨跌功能色），色值逐字保留 CSS 原串（NativeWind 消费）
 *  - chart-1..5 每主题各自一套：mono 为琥珀/紫/蓝/青/橙（原 K 线指标
 *    配色），blue/violet 为 shadcn dark 通用图表色（index.css 覆盖值）
 *  - --up/--down 涨跌功能色全主题共享（价格涨跌不随主题色变化）
 *  - 状态栏色不在此处另立事实源：转述 @repo/core/theme 的 THEME_COLORS
 *  - radius 派生档 sm/md/lg/xl（--radius 0.625rem = 10px 起算，
 *    与 index.css 的 calc 派生规则一致）
 *  - 字体：iOS 经 expo-font 打包 Inter / JetBrains Mono 与 web 的
 *    Google Fonts 同名同栈；未装时回退系统 SF / 等宽
 */

import { THEME_COLORS, THEMES, type ThemeId } from "@repo/core/theme"

/** 单主题完整 token（CSS 原串；键名与 index.css 变量一一对应） */
export interface ThemeCssTokens {
  background: string
  foreground: string
  card: string
  "card-foreground": string
  popover: string
  "popover-foreground": string
  primary: string
  "primary-foreground": string
  secondary: string
  "secondary-foreground": string
  muted: string
  "muted-foreground": string
  accent: string
  "accent-foreground": string
  destructive: string
  border: string
  input: string
  ring: string
  "chart-1": string
  "chart-2": string
  "chart-3": string
  "chart-4": string
  "chart-5": string
  /** 涨跌功能色（全主题共享，逐字保留） */
  up: string
  down: string
  "up-foreground": string
  "down-foreground": string
}

const SHARED_UP_DOWN = {
  up: "oklch(0.79 0.17 152)",
  down: "oklch(0.72 0.19 25)",
  "up-foreground": "oklch(0.13 0 0)",
  "down-foreground": "oklch(0.13 0 0)",
} as const

/** mono · 石墨黑白（默认）— index.css :root/.dark 块逐字对齐 */
const mono: ThemeCssTokens = {
  background: "oklch(0.09 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.13 0 0)",
  "card-foreground": "oklch(0.985 0 0)",
  popover: "oklch(0.13 0 0)",
  "popover-foreground": "oklch(0.985 0 0)",
  primary: "oklch(0.985 0 0)",
  "primary-foreground": "oklch(0.205 0 0)",
  secondary: "oklch(0.185 0 0)",
  "secondary-foreground": "oklch(0.985 0 0)",
  muted: "oklch(0.185 0 0)",
  "muted-foreground": "oklch(0.68 0 0)",
  accent: "oklch(0.22 0 0)",
  "accent-foreground": "oklch(0.985 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
  border: "oklch(0.235 0 0)",
  input: "oklch(0.235 0 0)",
  ring: "oklch(0.556 0 0)",
  /* mono 图表色:沿用原 K 线指标配色(琥珀/紫/蓝/青/橙) */
  "chart-1": "oklch(0.83 0.15 88)",
  "chart-2": "oklch(0.72 0.18 300)",
  "chart-3": "oklch(0.76 0.12 250)",
  "chart-4": "oklch(0.82 0.1 200)",
  "chart-5": "oklch(0.8 0.14 60)",
  ...SHARED_UP_DOWN,
}

/** blue · 电光蓝 — shadcn 官方 Blue 主题(dark)，index.css 逐字对齐 */
const blue: ThemeCssTokens = {
  background: "hsl(222.2 84% 4.9%)",
  foreground: "hsl(210 40% 98%)",
  card: "hsl(222.2 84% 4.9%)",
  "card-foreground": "hsl(210 40% 98%)",
  popover: "hsl(222.2 84% 4.9%)",
  "popover-foreground": "hsl(210 40% 98%)",
  primary: "hsl(217.2 91.2% 59.8%)",
  "primary-foreground": "hsl(222.2 47.4% 11.2%)",
  secondary: "hsl(217.2 32.6% 17.5%)",
  "secondary-foreground": "hsl(210 40% 98%)",
  muted: "hsl(217.2 32.6% 17.5%)",
  "muted-foreground": "hsl(215 20.2% 65.1%)",
  accent: "hsl(217.2 32.6% 17.5%)",
  "accent-foreground": "hsl(210 40% 98%)",
  destructive: "hsl(0 62.8% 30.6%)",
  border: "hsl(217.2 32.6% 17.5%)",
  input: "hsl(217.2 32.6% 17.5%)",
  ring: "hsl(224.3 76.3% 48%)",
  "chart-1": "hsl(220 70% 50%)",
  "chart-2": "hsl(160 60% 45%)",
  "chart-3": "hsl(30 80% 55%)",
  "chart-4": "hsl(280 65% 60%)",
  "chart-5": "hsl(340 75% 55%)",
  ...SHARED_UP_DOWN,
}

/** violet · 暗夜紫 — shadcn 官方 Violet 主题(dark)，index.css 逐字对齐 */
const violet: ThemeCssTokens = {
  background: "hsl(224 71.4% 4.1%)",
  foreground: "hsl(210 20% 98%)",
  card: "hsl(224 71.4% 4.1%)",
  "card-foreground": "hsl(210 20% 98%)",
  popover: "hsl(224 71.4% 4.1%)",
  "popover-foreground": "hsl(210 20% 98%)",
  primary: "hsl(263.4 70% 50.4%)",
  "primary-foreground": "hsl(210 20% 98%)",
  secondary: "hsl(215 27.9% 16.9%)",
  "secondary-foreground": "hsl(210 20% 98%)",
  muted: "hsl(215 27.9% 16.9%)",
  "muted-foreground": "hsl(217.9 10.6% 64.9%)",
  accent: "hsl(215 27.9% 16.9%)",
  "accent-foreground": "hsl(210 20% 98%)",
  destructive: "hsl(0 62.8% 30.6%)",
  border: "hsl(215 27.9% 16.9%)",
  input: "hsl(215 27.9% 16.9%)",
  ring: "hsl(263.4 70% 50.4%)",
  "chart-1": "hsl(220 70% 50%)",
  "chart-2": "hsl(160 60% 45%)",
  "chart-3": "hsl(30 80% 55%)",
  "chart-4": "hsl(280 65% 60%)",
  "chart-5": "hsl(340 75% 55%)",
  ...SHARED_UP_DOWN,
}

/** 三主题全量色板（键 = ThemeId，与 core THEMES 枚举一致） */
export const cssTokens: Record<ThemeId, ThemeCssTokens> = { mono, blue, violet }

/** 当前主题色板（配合 @repo/react/theme 的 useTheme 使用） */
export function themeOf(id: ThemeId): ThemeCssTokens {
  return cssTokens[id]
}

/** 主题枚举转述（名称取词仍在 i18n） */
export { THEMES, THEME_COLORS }
export type { ThemeId }

/* ------------------------------ radius 派生档 ------------------------------ */

/** --radius: 0.625rem = 10px（index.css :root） */
export const RADIUS_BASE = 10

/**
 * 派生档与 index.css @theme inline 的 calc 规则一致：
 * sm = r-4 / md = r-2 / lg = r / xl = r+4（px）
 */
export const radius = {
  sm: RADIUS_BASE - 4,
  md: RADIUS_BASE - 2,
  lg: RADIUS_BASE,
  xl: RADIUS_BASE + 4,
} as const

/* -------------------------------- 字体栈 -------------------------------- */

/**
 * Inter / JetBrains Mono 与 web（Google Fonts，index.html:24-28）同名；
 * iOS 经 expo-font 打包加载后字体族名一致，未装时回退系统 SF / 等宽。
 */
export const fontStacks = {
  sans: ["Inter", "System", "PingFang SC", "Hiragino Sans GB"],
  mono: ["JetBrains Mono", "SF Mono", "Menlo"],
} as const
