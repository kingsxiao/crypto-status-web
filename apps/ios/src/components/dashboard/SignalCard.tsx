import { memo, useEffect, useMemo, useState } from "react"
import { Text, View, useWindowDimensions } from "react-native"
import { Circle, Line, Path, Svg, Text as SvgText } from "react-native-svg"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { VERDICT_LEVEL_KEY } from "@repo/core/coinAnalysis"
import type { Analysis } from "@repo/core/indicators"

import { useAppTheme } from "../../lib/theme"
import { rnColor } from "../../lib/colors"
import { Card, CardTitle } from "../ui"
import { alpha } from "./color"
import { EASE_STATE, FONT } from "./util"

/** 仪表盘弧段热力色（web Gauge.tsx 同源 oklch 原串，经 rnColor 程序化转换） */
const HEAT = {
  strongBear: rnColor("oklch(0.62 0.21 27)"),
  bear: rnColor("oklch(0.72 0.15 45)"),
  bull: rnColor("oklch(0.77 0.13 145)"),
  strongBull: rnColor("oklch(0.78 0.17 152)"),
  bearLabel: rnColor("oklch(0.68 0.18 27)"),
  bullLabel: rnColor("oklch(0.8 0.16 152)"),
} as const

/**
 * 半圆多空仪表盘（−100 → +100，红 → 灰 → 绿）。
 * 指针挂载由中性位（0 分）摆到综合分（reanimated 450ms 状态切换档），
 * 其后实时重算平滑跟随 —— 与 web 的 CSS transform 过渡同口径。
 */
function SignalGauge({ score }: { score: number }) {
  useT()
  const { c } = useAppTheme()
  const { width: winW } = useWindowDimensions()
  // 卡内可用宽（Page 12 + Card 12 双侧 padding）
  const w = Math.min(winW - 48, 320)
  const scale = w / 260
  const h = (w * 168) / 260
  const cx = 130
  const cy = 120
  const r = 96

  const clamped = Math.max(-100, Math.min(100, score))
  const angle = useSharedValue(90) // 挂载前指中性位
  useEffect(() => {
    angle.value = withTiming(((clamped + 100) / 200) * 180, { duration: 450, easing: EASE_STATE })
  }, [clamped, angle])
  const needle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${angle.value}deg` }],
  }))

  const arc = (from: number, to: number) => {
    const a1 = Math.PI * (1 - (from + 100) / 200)
    const a2 = Math.PI * (1 - (to + 100) / 200)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy - r * Math.sin(a2)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  const ticks = useMemo(
    () =>
      [-100, -50, 0, 50, 100].map((v) => {
        const a = Math.PI * (1 - (v + 100) / 200)
        return {
          x1: cx + (r + 8) * Math.cos(a),
          y1: cy - (r + 8) * Math.sin(a),
          x2: cx + (r + 13) * Math.cos(a),
          y2: cy - (r + 13) * Math.sin(a),
        }
      }),
    [],
  )

  // 指针长（svg 用户单位 → px），锚在表心、向左伸出，旋转 0°=−100 位
  const needleLen = (r - 22) * scale
  const cxPx = cx * scale
  const cyPx = (cy + 14) * scale // viewBox 自 y=-14 起

  return (
    <View style={{ width: w, height: h, alignItems: "center" }}>
      <Svg width={w} height={h} viewBox="0 -14 260 168" accessibilityLabel={t("gauge.aria", { score })}>
        <Path d={arc(-100, -60)} stroke={HEAT.strongBear} strokeWidth={10} fill="none" strokeLinecap="round" />
        <Path d={arc(-57, -20)} stroke={HEAT.bear} strokeWidth={10} fill="none" />
        <Path d={arc(-17, 17)} stroke={c("muted-foreground")} strokeOpacity={0.5} strokeWidth={10} fill="none" />
        <Path d={arc(20, 57)} stroke={HEAT.bull} strokeWidth={10} fill="none" />
        <Path d={arc(60, 100)} stroke={HEAT.strongBull} strokeWidth={10} fill="none" strokeLinecap="round" />
        {ticks.map((tk, i) => (
          <Line
            key={i}
            x1={tk.x1}
            y1={tk.y1}
            x2={tk.x2}
            y2={tk.y2}
            stroke={c("muted-foreground")}
            strokeOpacity={0.45}
            strokeWidth={1.5}
          />
        ))}
        <Circle cx={cx} cy={cy} r={5.5} fill={c("primary")} />
        <Circle cx={cx} cy={cy} r={10} fill="none" stroke={c("primary")} strokeOpacity={0.3} strokeWidth={1} />
        <SvgText x={cx - r + 4} y={cy + 30} textAnchor="middle" fontSize={11} fontFamily={FONT.semi} fill={HEAT.bearLabel}>
          {t("gauge.bear")}
        </SvgText>
        <SvgText x={cx} y={cy - r - 26} textAnchor="middle" fontSize={11} fontFamily={FONT.semi} fill={c("muted-foreground")}>
          {t("gauge.neutral")}
        </SvgText>
        <SvgText x={cx + r - 4} y={cy + 30} textAnchor="middle" fontSize={11} fontFamily={FONT.semi} fill={HEAT.bullLabel}>
          {t("gauge.bull")}
        </SvgText>
      </Svg>
      {/* 指针：零尺寸锚点 View 绕表心旋转，子针身向左伸出（0°=−100 位） */}
      <Animated.View style={[needle, { position: "absolute", left: cxPx, top: cyPx, width: 0, height: 0 }]}>
        <View
          style={{
            position: "absolute",
            left: -needleLen,
            top: -1.25 * scale,
            width: needleLen,
            height: 2.5 * scale,
            borderRadius: 1.25 * scale,
            backgroundColor: c("primary"),
          }}
        />
      </Animated.View>
    </View>
  )
}

/** 综合多空信号卡：仪表盘 + 综合分 + 判定徽章 + 多/中性/空三档计数 */
export const SignalCard = memo(function SignalCard({ analysis }: { analysis: Analysis }) {
  useT()
  const { c } = useAppTheme()
  const { composite, signal, indicators } = analysis
  const bulls = indicators.filter((i) => i.score > 0.25).length
  const bears = indicators.filter((i) => i.score < -0.25).length
  const neutrals = indicators.length - bulls - bears

  const verdict: Record<
    Analysis["signal"]["level"],
    { bg?: string; border?: string; text: string }
  > = {
    "strong-long": { bg: c("up"), text: c("up-foreground") },
    long: { border: c("up"), text: c("up") },
    neutral: { text: c("muted-foreground") },
    short: { border: c("down"), text: c("down") },
    "strong-short": { bg: c("down"), text: c("down-foreground") },
  }
  const v = verdict[signal.level]

  return (
    <Card>
      <CardTitle>{t("sig.title")}</CardTitle>
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={2}
        style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}
      >
        {t("sig.desc")}
      </Text>
      <View style={{ alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 2 }}>
        <SignalGauge score={composite} />
        <View style={{ alignItems: "center", gap: 8 }}>
          <Text
            maxFontSizeMultiplier={1.4}
            style={{ color: c("foreground"), fontSize: 30, lineHeight: 36, fontFamily: FONT.monoMed }}
          >
            {composite > 0 ? "+" : ""}
            {composite.toFixed(0)}
          </Text>
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: v.border ? 1 : 0,
              borderColor: v.border,
              backgroundColor: v.bg,
            }}
          >
            <Text
              maxFontSizeMultiplier={1.3}
              style={{
                color: v.text,
                fontSize: 13,
                fontFamily: FONT.bold,
                letterSpacing: 3,
              }}
            >
              {t(VERDICT_LEVEL_KEY[signal.level])}
            </Text>
          </View>
        </View>
      </View>
      <View
        style={{
          height: 1,
          backgroundColor: alpha(c("border"), 0.6),
          marginVertical: 4,
        }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {(
          [
            { n: bulls, dot: c("up"), key: "sig.count.bull" as const },
            { n: neutrals, dot: alpha(c("primary"), 0.3), key: "sig.count.neutral" as const },
            { n: bears, dot: c("down"), key: "sig.count.bear" as const },
          ]
        ).map((it) => (
          <View key={it.key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: it.dot }} />
            <Text style={{ color: c("foreground"), fontSize: 12, fontFamily: FONT.monoMed }}>{it.n}</Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t(it.key)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
})
