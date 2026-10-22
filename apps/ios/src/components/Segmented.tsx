/**
 * 分段单选 + 工具栏切换芯片 — web Segmented / CoinDetail Toggle 的 RN 移植。
 * 触控 ≥44pt：分段项 minHeight 36 + 纵向 hitSlop 4（≈44 命中区）；
 * 芯片 minHeight 32 + hitSlop 6。切换一律 hapticSelection（分段规范）。
 */

import type { ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"

import { radius } from "@repo/ui-tokens/theme"

import { hapticSelection } from "../lib/haptics"
import { useAppTheme } from "../lib/theme"

/** 分段单选（范围筛选 / 图表类型）：容器 muted 底 + 激活项反白 */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
}) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", backgroundColor: c("muted"), borderRadius: radius.md, padding: 3, alignSelf: "flex-start" }}>
      {items.map((it) => {
        const active = it.value === value
        return (
          <Pressable
            key={it.value}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) hapticSelection()
              onChange(it.value)
            }}
            style={({ pressed }) => [
              {
                minHeight: 36,
                paddingHorizontal: 14,
                justifyContent: "center",
                alignItems: "center",
                borderRadius: radius.sm,
                opacity: pressed ? 0.6 : 1,
              },
              active && { backgroundColor: c("background") },
            ]}
          >
            {typeof it.label === "string" ? (
              <Text style={{ color: active ? c("primary") : c("muted-foreground"), fontSize: 14, fontWeight: "500" }}>{it.label}</Text>
            ) : (
              it.label
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

/** 等宽小字分段项（K线周期九档）；invert = 反白底（primary-foreground 文字） */
export function MonoSegmentLabel({ text, active, invert }: { text: string; active: boolean; invert?: boolean }) {
  const { c } = useAppTheme()
  return (
    <Text
      style={{
        color: invert ? c("primary-foreground") : active ? c("primary") : c("muted-foreground"),
        fontSize: 12,
        fontFamily: "JetBrainsMono_500Medium",
      }}
    >
      {text}
    </Text>
  )
}

/** 工具栏切换芯片（范围 100/250/500 · MA/BOLL/FIB · RSI/MACD/KDJ）：激活反白 */
export function Chip({
  active,
  onPress,
  children,
  disabled,
  accessibilityLabel,
}: {
  active: boolean
  onPress: () => void
  children: ReactNode
  disabled?: boolean
  accessibilityLabel?: string
}) {
  const { c } = useAppTheme()
  return (
    <Pressable
      hitSlop={6}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active, disabled }}
      onPress={() => {
        hapticSelection()
        onPress()
      }}
      style={({ pressed }) => [
        s.chip,
        active
          ? { backgroundColor: c("primary"), borderColor: c("primary") }
          : { borderColor: c("border") },
        disabled && { opacity: 0.4 },
        pressed && { opacity: 0.6 },
      ]}
    >
      {typeof children === "string" ? (
        <Text
          style={{
            color: active ? c("primary-foreground") : c("muted-foreground"),
            fontSize: 11,
            fontFamily: "JetBrainsMono_500Medium",
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  )
}

/** 分组标签：等宽小字号大写字距（范围/叠加/副图） */
export function GroupLabel({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return (
    <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: "JetBrainsMono_400Regular", letterSpacing: 1, textTransform: "uppercase" }}>
      {children}
    </Text>
  )
}

/** 竖向 hairline 分隔（工具栏三组控件间，与 web Separator 同语言） */
export function VSeparator() {
  const { c } = useAppTheme()
  return <View style={{ width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c("border") }} />
}

const s = StyleSheet.create({
  chip: {
    minHeight: 32,
    minWidth: 44,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
})
