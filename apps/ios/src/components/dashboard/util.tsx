import type { ReactNode } from "react"
import { Text, View } from "react-native"
import { Easing } from "react-native-reanimated"

import { useT } from "@repo/react/i18n"

import { useAppTheme } from "../../lib/theme"
import { alpha } from "./color"

/** 状态切换档缓动（web cubic-bezier(0.21,1,0.33,1) 的 reanimated 等价） */
export const EASE_STATE = Easing.bezier(0.21, 1, 0.33, 1)

/**
 * 页面组内部共用小件：字族常量 / 卡片眉题（对齐 web CardKicker）。
 * 字族名 = expo-font 打包名（与 web Google Fonts 同名同栈），
 * 加载失败时 RN 对未知 fontFamily 自动回退系统 SF/PingFang SC。
 */

export const FONT = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semi: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "JetBrainsMono_400Regular",
  monoMed: "JetBrainsMono_500Medium",
} as const

/**
 * 卡片眉题：glyph + 标题 + EN 小签 + 口径说明（web CardKicker 的 RN 版）。
 * glyph 用系统字形替代 lucide 图标（SF 内置，无需矢量资源）。
 */
export function CardKicker({
  glyph,
  title,
  en,
  desc,
}: {
  glyph: string
  title: string
  en: string
  desc?: string
}) {
  useT()
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 3 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ color: c("primary"), fontSize: 13 }}>{glyph}</Text>
        <Text
          maxFontSizeMultiplier={1.3}
          style={{ color: c("foreground"), fontSize: 14, fontFamily: FONT.semi, flexShrink: 1 }}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            color: c("muted-foreground"),
            fontSize: 9,
            fontFamily: FONT.mono,
            letterSpacing: 1.2,
            flexShrink: 0,
          }}
        >
          {en}
        </Text>
      </View>
      {desc ? (
        <Text
          maxFontSizeMultiplier={1.3}
          numberOfLines={2}
          style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}
        >
          {desc}
        </Text>
      ) : null}
    </View>
  )
}

/** hairline 分隔线（1px 描边语言，黑白极简无阴影） */
export function Hairline({ style }: { style?: { marginBottom?: number; marginTop?: number } }) {
  const { c } = useAppTheme()
  return (
    <View
      style={{
        height: 1,
        backgroundColor: alpha(c("border"), 0.6),
        ...style,
      }}
    />
  )
}

/** 空态/缺数据占位（居中、muted） */
export function EmptyNote({ children, tall }: { children: ReactNode; tall?: boolean }) {
  const { c } = useAppTheme()
  return (
    <View
      style={{
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: tall ? 48 : 20,
        gap: 4,
      }}
    >
      <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, textAlign: "center" }}>
        {children}
      </Text>
    </View>
  )
}
