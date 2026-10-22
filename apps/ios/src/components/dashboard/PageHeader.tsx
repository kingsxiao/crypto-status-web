import type { ReactNode } from "react"
import { Text, View } from "react-native"

import { useAppTheme } from "../../lib/theme"
import { alpha } from "./color"
import { FONT } from "./util"

/**
 * 统一页头（web PageHeader 的 RN 版）：眉题(EN) → 主标题 → 副标题，
 * 右侧动作区交给 children（总览页放 alerts/events/settings/about 入口）。
 */
export function PageHeader({
  en,
  title,
  description,
  children,
}: {
  en: string
  title: string
  description?: string
  children?: ReactNode
}) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{ color: c("primary"), fontSize: 11, fontFamily: FONT.mono, letterSpacing: 3.2 }}
        >
          {en}
        </Text>
        <View style={{ height: 1, width: 24, backgroundColor: alpha(c("primary"), 0.4) }} />
      </View>
      <Text
        maxFontSizeMultiplier={1.4}
        style={{ color: c("foreground"), fontSize: 22, lineHeight: 28, fontFamily: FONT.bold, letterSpacing: 0.3 }}
      >
        {title}
      </Text>
      {description ? (
        <Text
          maxFontSizeMultiplier={1.4}
          style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 17 }}
        >
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  )
}

/** 区块标签：眉题字阶 + 右延 hairline（web SectionLabel 的 RN 版） */
export function SectionLabel({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: 20 }}>
      <Text
        style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: FONT.mono, letterSpacing: 2 }}
      >
        {children}
      </Text>
      <View style={{ height: 1, minWidth: 8, flex: 1, backgroundColor: alpha(c("border"), 0.6) }} />
    </View>
  )
}
