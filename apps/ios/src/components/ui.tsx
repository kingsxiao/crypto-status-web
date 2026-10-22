import type { ReactNode } from "react"
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { formatPct, formatPrice } from "@repo/core/format"
import { radius } from "@repo/ui-tokens/theme"

import { useAppTheme } from "../lib/theme"

/* ------------------------------ 排版（Dynamic Type） ------------------------------ */

/** 排版档（与 web 端字号节奏对齐）；Text 默认 allowFontScaling=true 即 Dynamic Type */
const TYPE = {
  display: { fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  title: { fontSize: 17, lineHeight: 22 },
  body: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 12, lineHeight: 16, letterSpacing: 1 },
} as const

/**
 * 文体族映射（与 web 全站 Inter 同栈；expo-font 打包名，失败自动回退 SF）。
 * 非 mono 正文经 style.fontWeight 选 Inter 档位；显式 fontFamily 优先。
 */
const INTER = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const

/** fontWeight（RN 字符串档）→ Inter 静态字族档 */
function interOf(fw: TextStyle["fontWeight"]): string {
  switch (fw) {
    case "700":
    case "bold":
      return INTER.bold
    case "600":
    case "semibold":
      return INTER.semiBold
    case "500":
    case "medium":
      return INTER.medium
    default:
      return INTER.regular
  }
}

/** 中文界面不指定拉丁字族（保 PingFang 字重层次）；显式 fontFamily 优先 */
function bodyFont(mono: boolean, explicit: string | undefined, fw: TextStyle["fontWeight"]): string | undefined {
  if (explicit) return explicit
  if (mono) return "JetBrainsMono_500Medium"
  return interOf(fw)
}

/**
 * 文本原语：variant 控字号档，mono 切 JetBrains Mono（数字/代码），
 * maxScale 封顶 Dynamic Type 放大（HIG 建议信息密集页 1.3-1.5，防布局溢出）。
 * 非 mono 默认 Inter（随 fontWeight 选档），与 web 全站 Inter 同栈。
 */
export function Txt({
  variant = "body",
  mono = false,
  maxScale = 1.4,
  numberOfLines,
  ellipsizeMode,
  style,
  children,
}: {
  variant?: keyof typeof TYPE
  mono?: boolean
  maxScale?: number
  numberOfLines?: number
  ellipsizeMode?: "head" | "middle" | "tail" | "clip"
  style?: StyleProp<TextStyle>
  children: ReactNode
}) {
  const { c } = useAppTheme()
  const flat = StyleSheet.flatten(style)
  const fontFamily = bodyFont(mono, flat?.fontFamily, flat?.fontWeight)
  return (
    <Text
      maxFontSizeMultiplier={maxScale}
      numberOfLines={numberOfLines}
      ellipsizeMode={ellipsizeMode}
      style={[{ color: c("foreground") }, TYPE[variant], fontFamily != null && { fontFamily }, style]}
    >
      {children}
    </Text>
  )
}

/* ------------------------------ 触控（≥44pt） ------------------------------ */

/**
 * 触控原语：minHeight/minWidth 44（HIG 最小触控目标），内容居中；
 * 图标/星标等小元素必须套本原语或外层补足 44pt 命中区（hitSlop 不够时）。
 */
export function Tap({
  onPress,
  style,
  children,
}: {
  onPress: () => void
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  const { c } = useAppTheme()
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        { minHeight: 44, minWidth: 44, justifyContent: "center", alignItems: "center", opacity: pressed ? 0.6 : 1 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={typeof children === "string" ? children : undefined}
    >
      <Text style={{ color: c("primary"), fontFamily: INTER.regular }}>{children}</Text>
    </Pressable>
  )
}

/** 黑白极简卡片：card/border/muted + 1px hairline（ui-tokens → RN 色值） */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { c } = useAppTheme()
  return (
    <View
      style={[
        {
          backgroundColor: c("card"),
          borderColor: c("border"),
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: radius.lg,
          padding: 12,
          gap: 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return <Text style={{ color: c("muted-foreground"), fontSize: 12, letterSpacing: 1, fontFamily: INTER.medium }}>{children}</Text>
}

export function Stat({ label, value }: { label: string; value: string }) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: INTER.regular }}>{label}</Text>
      <Text style={{ color: c("foreground"), fontSize: 15, fontFamily: "JetBrainsMono_500Medium" }}>{value}</Text>
    </View>
  )
}

/** 价格 + 涨跌幅（涨跌功能色全主题共享） */
export function PricePct({
  price,
  pct,
  big,
}: {
  price: number | null | undefined
  pct: number | null | undefined
  big?: boolean
}) {
  const { c } = useAppTheme()
  const up = (pct ?? 0) >= 0
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
      <Text
        style={{
          color: c("foreground"),
          fontSize: big ? 26 : 14,
          fontFamily: "JetBrainsMono_500Medium",
        }}
      >
        {formatPrice(price ?? null)}
      </Text>
      {pct != null && (
        <Text style={{ color: up ? c("up") : c("down"), fontSize: big ? 14 : 12, fontFamily: "JetBrainsMono_400Regular" }}>
          {formatPct(pct)}
        </Text>
      )}
    </View>
  )
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, style]}>{children}</View>
}

export function Page({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={[{ flex: 1, backgroundColor: c("background"), padding: 12, gap: 10 }, s.page, { paddingTop: insets.top + 12 }]}>
      {children}
    </View>
  )
}

const s = StyleSheet.create({
  page: { paddingBottom: 24 },
})
