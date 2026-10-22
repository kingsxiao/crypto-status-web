import { useEffect, type ReactNode } from "react"
import { View, useWindowDimensions } from "react-native"
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated"

import { useAppTheme } from "../../lib/theme"
import { Card } from "../ui"
import { alpha } from "./color"

const EASE_PULSE = Easing.inOut(Easing.quad)

/** 骨架块：secondary 底 + 呼吸脉冲（web Skeleton 的 RN 版） */
function SkBlock({ h, w, dim, style }: { h: number; w?: number | `${string}%`; dim?: boolean; style?: object }) {
  const { c } = useAppTheme()
  const op = useSharedValue(1)
  useEffect(() => {
    op.value = withRepeat(
      withTiming(dim ? 0.35 : 0.55, { duration: 900, easing: EASE_PULSE }),
      -1,
      true,
    )
  }, [dim, op])
  const a = useAnimatedStyle(() => ({ opacity: op.value }))
  return (
    <Animated.View
      style={[
        { height: h, width: w ?? "100%", borderRadius: 5, backgroundColor: alpha(c("secondary"), 0.9) },
        a,
        style,
      ] as object}
    />
  )
}

/** 头部两行（标题条 + 说明条） */
function SkHeader() {
  return (
    <View style={{ gap: 6 }}>
      <SkBlock h={12} w={80} />
      <SkBlock h={8} w={130} dim />
    </View>
  )
}

/** 迷你柱组（牛熊示意 / 情绪 30 日剪影） */
function SkMiniBars({ count, h = 40 }: { count: number; h?: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: h }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkBlock key={i} h={10 + ((i * 37) % Math.max(1, h - 12))} w={6} style={{ borderRadius: 2 }} />
      ))}
    </View>
  )
}

/** 进度条剪影 */
function SkProgress({ fill }: { fill: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ height: 4, borderRadius: 2, backgroundColor: alpha(c("secondary"), 0.6), overflow: "hidden" }}>
      <View style={{ height: 4, width: `${fill}%`, borderRadius: 2, backgroundColor: alpha(c("muted-foreground"), 0.4) }} />
    </View>
  )
}

/** 图表剪影：柱状排 */
function SkChart({ bars, h }: { bars: number; h: number }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: h }}>
      {Array.from({ length: bars }).map((_, i) => (
        <SkBlock key={i} h={18 + ((i * 53) % (h - 24))} w={5} style={{ flex: 1 }} />
      ))}
    </View>
  )
}

function Section({ children }: { children: ReactNode }) {
  return <View style={{ gap: 10 }}>{children}</View>
}

/** 总览骨架：与正式布局同构（信号/牛熊/情绪 → 概览条 → BTC 走势 → 实时价格） */
export function DashboardSkeleton() {
  const { c } = useAppTheme()
  const { width: winW } = useWindowDimensions()
  const gauge = Math.min(winW - 48, 260)
  return (
    <View style={{ gap: 16 }}>
      {/* 第一屏：信号 / 牛熊 / 情绪 */}
      <Section>
        <Card style={{ gap: 12, minHeight: 380 }}>
          <SkHeader />
          <View style={{ alignItems: "center", gap: 18, paddingVertical: 8 }}>
            <View
              style={{
                width: gauge,
                height: gauge * 0.65,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: gauge * 0.4,
                borderWidth: 3,
                borderColor: alpha(c("secondary"), 0.7),
              }}
            >
              <SkBlock h={26} w={72} />
            </View>
            <SkBlock h={22} w={90} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
              <SkBlock h={9} w={60} dim />
              <SkBlock h={9} w={46} dim />
              <SkBlock h={9} w={60} dim />
            </View>
          </View>
        </Card>
        <Card style={{ gap: 14, minHeight: 260 }}>
          <SkHeader />
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View style={{ gap: 8 }}>
              <SkBlock h={28} w={110} />
              <SkBlock h={9} w={76} dim />
            </View>
            <SkMiniBars count={9} h={52} />
          </View>
          <View style={{ gap: 8 }}>
            <SkProgress fill={54} />
            <SkProgress fill={76} />
          </View>
        </Card>
        <Card style={{ gap: 14, minHeight: 220 }}>
          <SkHeader />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <SkBlock h={38} w={64} />
            <View style={{ gap: 5, paddingBottom: 4 }}>
              <SkBlock h={12} w={56} />
              <SkBlock h={8} w={30} dim />
            </View>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: alpha(c("secondary"), 0.6) }} />
          <SkMiniBars count={12} h={48} />
        </Card>
      </Section>

      {/* 全球市场概览 */}
      <Card style={{ padding: 0, flexDirection: "row", flexWrap: "wrap" }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: "50%", padding: 14, gap: 8, borderTopWidth: i >= 2 ? 1 : 0, borderLeftWidth: i % 2 === 1 ? 1 : 0, borderColor: alpha(c("border"), 0.4) }}>
            <SkBlock h={9} w={72} dim />
            <SkBlock h={15} w={90} />
            <SkBlock h={8} w={56} dim />
          </View>
        ))}
      </Card>

      {/* BTC 走势 */}
      <Section>
        <SkBlock h={10} w={150} dim />
        <Card style={{ gap: 14, paddingTop: 18 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <SkBlock h={13} w={120} />
            <SkBlock h={9} w={160} dim />
          </View>
          <SkChart bars={30} h={200} />
        </Card>
      </Section>

      {/* 实时价格 */}
      <Section>
        <SkBlock h={10} w={130} dim />
        <Card style={{ gap: 12 }}>
          <SkBlock h={13} w={90} />
          <SkBlock h={30} w="100%" dim style={{ borderRadius: 6 }} />
          {Array.from({ length: 7 }).map((_, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <SkBlock h={12} w={14} dim />
              <SkBlock h={12} w={48} />
              <View style={{ flex: 1 }} />
              <SkBlock h={12} w={64} />
              <SkBlock h={10} w={38} dim />
            </View>
          ))}
        </Card>
      </Section>
    </View>
  )
}
