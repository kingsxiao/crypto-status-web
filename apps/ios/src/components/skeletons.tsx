/**
 * 骨架原语 — web loading.tsx 的 RN 移植：
 * 灰阶层次 secondary/80 · /60 · /40 由色阶 token（muted/secondary/border）
 * 承担；呼吸脉冲用 react-native Animated（1.4s 呼吸，贴近 web shimmer 节奏）。
 * 图表区用「柱状剪影 + 底部基线」占位（确定性伪随机高度，与 web 同公式）。
 */

import { useEffect, useRef, type ReactNode } from "react"
import { Animated, StyleSheet, View } from "react-native"

import { useAppTheme } from "../lib/theme"

/** 呼吸透明度：0.55 ↔ 1，1.4s 循环 */
function usePulse() {
  const val = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(val, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(val, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [val])
  return val
}

/** 单条骨架：圆角矩形，tone 控灰阶层次 */
export function SkBar({
  w,
  h = 8,
  tone = "secondary",
  radius = 3,
}: {
  w: number | `${number}%`
  h?: number
  tone?: "primary" | "secondary" | "muted"
  radius?: number
}) {
  const { c } = useAppTheme()
  const opacity = usePulse()
  return (
    <Animated.View
      style={{
        width: w,
        height: h,
        borderRadius: radius,
        backgroundColor: tone === "primary" ? c("secondary") : tone === "muted" ? c("border") : c("muted"),
        opacity,
      }}
    />
  )
}

/** 圆形骨架（头像/图标位） */
export function SkCircle({ size = 28 }: { size?: number }) {
  const { c } = useAppTheme()
  const opacity = usePulse()
  return <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c("muted"), opacity }} />
}

/** 表格骨架：表头小条 + 数据行（圆点 + 头像 + 双行文本 + 右侧数字 + 迷你走势） */
export function TableSkeleton({ rows = 10 }: { rows?: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 0 }} accessibilityLabel="loading">
      <View style={{ flexDirection: "row", gap: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c("border") }}>
        <SkCircle size={6} />
        <SkBar w={24} tone="muted" />
        <SkBar w={56} tone="muted" />
        <View style={{ marginLeft: "auto", alignItems: "flex-end", gap: 6 }}>
          <SkBar w={48} />
          <SkBar w={40} />
        </View>
      </View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 56 }}>
          <SkCircle size={6} />
          <SkCircle size={28} />
          <View style={{ gap: 6 }}>
            <SkBar w={96} h={10} />
            <SkBar w={40} tone="muted" h={6} />
          </View>
          <View style={{ marginLeft: "auto", alignItems: "flex-end", gap: 6 }}>
            <SkBar w={56} h={10} />
            <SkBar w={40} />
          </View>
        </View>
      ))}
    </View>
  )
}

/** 图表区骨架：底对齐柱状剪影 + 1px 基线（高度公式与 web ChartSkeleton 一致） */
export function ChartSkeleton({ bars = 44, height = 260 }: { bars?: number; height?: number }) {
  const { c } = useAppTheme()
  const opacity = usePulse()
  const list = Array.from({ length: bars }, (_, i) => 22 + ((i * 47) % 13) * 4.4)
  return (
    <View style={{ height, justifyContent: "flex-end" }} accessibilityLabel="chart loading">
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: "2.5%", paddingBottom: 16, flex: 1 }}>
        {list.map((h, i) => (
          <Animated.View
            key={i}
            style={{
              flex: 1,
              height: `${h}%`,
              borderRadius: 3,
              backgroundColor: c("muted"),
              opacity: Animated.multiply(opacity, 0.8),
            }}
          />
        ))}
      </View>
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c("border") }} />
    </View>
  )
}

/** 通用骨架块（卡片标题/段落组合） */
export function SkBlock({ children }: { children: ReactNode }) {
  return <View style={{ gap: 10 }}>{children}</View>
}
