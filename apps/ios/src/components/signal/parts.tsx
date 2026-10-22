/**
 * 「信号与情绪」页面组共享原语 — web 端 OpinionBoard / Gauge / stance-style /
 * loading 的 RN 对应物（apps/web/src/pages/{VerdictPage,SentimentPage}.tsx 移植）：
 *   - PageHead / Kicker / SectionLabel：页头与卡头层级（PageHeader/CardKicker/SectionLabel）
 *   - Pill / StanceBadge：描边徽章（涨跌色只染边框文字，不染容器 —— 与 web 同构）
 *   - DivergingBar / CompositeBar：中线 0 发散条
 *   - SignalGauge：半圆多空仪表（react-native-svg 自绘，弧段色 = web Gauge 原串）
 *   - GrowIn / useGrowIn：web「进入视口生长」的 RN 近似（挂载触发 + stagger）
 *   - SkBlock / LoadingDots / PaneShell：骨架 / 加载点 / 可下拉刷新的页容器
 * 色值纪律：主题 token 一律 useAppTheme().c()；fngShade / FNG_GRADIENT /
 * 仪表弧段的 oklch 原串经 rnColor() 程序化转换，页面组内无第二份手工色值。
 */

import { useEffect, useMemo, type ReactNode } from "react"
import { Animated, Easing, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native"
import Svg, { Circle, Defs, LinearGradient, Line, Path, Rect, Stop, Text as SvgText } from "react-native-svg"

import { STANCE_KEY, type Stance } from "@repo/core/crossAsset"
import { FNG_GRADIENT, fngShade } from "@repo/core/fng"
import { t } from "@repo/core/i18n"
import { useLocale } from "@repo/react/i18n"

import { rnColor } from "../../lib/colors"
import { useAppTheme } from "../../lib/theme"
import { Txt } from "../ui"

/* ------------------------------ FNG 功能色 ------------------------------ */

/** fngShade 的 oklch 原串 → RN 色值（单一事实源在 @repo/core/fng） */
export const fngColor = (v: number): string => rnColor(fngShade(v))

/** FNG_GRADIENT 的 5 个停靠色（解析 CSS 原串，不另立色值） */
export const FNG_STOPS = FNG_GRADIENT.slice("linear-gradient(90deg, ".length, -1).split(", ")

/* ------------------------------ 页头 / 卡头 ------------------------------ */

/** 统一页头：EN 眉题 + 右延 hairline → 主标题 → 副标题 → 动作区 */
export function PageHead({
  en,
  title,
  desc,
  children,
}: {
  en: string
  title: string
  desc?: string
  children?: ReactNode
}) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Txt variant="label" maxScale={1.3} style={{ color: c("primary"), letterSpacing: 3.2 }}>
          {en}
        </Txt>
        <View style={{ height: StyleSheet.hairlineWidth, width: 24, backgroundColor: c("primary"), opacity: 0.4 }} />
      </View>
      <Txt variant="title" maxScale={1.3} style={{ fontSize: 20, lineHeight: 26, fontWeight: "700" }}>
        {title}
      </Txt>
      {desc != null && (
        <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 18 }}>
          {desc}
        </Txt>
      )}
      {children != null && <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }}>{children}</View>}
    </View>
  )
}

/** 眉题卡头：小号弱化标题 + 等宽 EN 角标（仅中文界面显示，与 web CardKicker 同策略）+ 描述行 + 右槽徽章 */
export function Kicker({
  title,
  en,
  desc,
  right,
}: {
  title: string
  en?: string
  desc?: ReactNode
  right?: ReactNode
}) {
  const { c } = useAppTheme()
  const { locale } = useLocale()
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Txt
          variant="caption"
          maxScale={1.2}
          style={{ color: c("muted-foreground"), fontWeight: "600", textTransform: "uppercase", letterSpacing: 1.2, flexShrink: 1 }}
        >
          {title}
        </Txt>
        {right != null ? (
          right
        ) : (
          en != null &&
          locale === "zh" && (
            <Txt variant="label" mono maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground"), opacity: 0.6, letterSpacing: 1.8 }}>
              {en}
            </Txt>
          )
        )}
      </View>
      {desc != null && (
        <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 17 }}>
          {desc}
        </Txt>
      )}
    </View>
  )
}

/** 区块标签：眉题字阶 + 右延 hairline */
export function SectionLabel({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <Txt variant="label" maxScale={1.3} style={{ color: c("muted-foreground") }}>
        {children}
      </Txt>
      <View style={{ height: StyleSheet.hairlineWidth, minWidth: 16, flex: 1, backgroundColor: c("border"), opacity: 0.6 }} />
    </View>
  )
}

/* ------------------------------ 徽章 ------------------------------ */

type PillTone = "up" | "upSolid" | "down" | "downSolid" | "muted" | "plain"

/** 描边徽章（判定/评分档位用）：涨跌色只染边框与文字；Solid 档为实底反白 */
export function Pill({ tone = "muted", children, bold }: { tone?: PillTone; children: string; bold?: boolean }) {
  const { c } = useAppTheme()
  const map: Record<PillTone, { border: string; fg: string; bg?: string }> = {
    up: { border: c("up"), fg: c("up") },
    upSolid: { border: "transparent", fg: c("up-foreground"), bg: c("up") },
    down: { border: c("down"), fg: c("down") },
    downSolid: { border: "transparent", fg: c("down-foreground"), bg: c("down") },
    muted: { border: c("border"), fg: c("muted-foreground") },
    plain: { border: c("border"), fg: c("foreground") },
  }
  const m = map[tone]
  return (
    <View
      style={{
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: m.border,
        backgroundColor: m.bg,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text maxFontSizeMultiplier={1.2} style={{ color: m.fg, fontSize: 10, lineHeight: 14, letterSpacing: 0.6, fontWeight: bold ? "700" : "600" }}>
        {children}
      </Text>
    </View>
  )
}

/** 五档市场立场徽章（web stance-style 的 token 化重述：两端实底 / 次档描边 / 中性弱化） */
export function StanceBadge({ stance }: { stance: Stance }) {
  const tone: PillTone =
    stance === "risk_on"
      ? "upSolid"
      : stance === "cautiously_risk_on"
        ? "up"
        : stance === "neutral"
          ? "muted"
          : stance === "cautiously_risk_off"
            ? "down"
            : "downSolid"
  return (
    <Pill tone={tone} bold>
      {t(STANCE_KEY[stance])}
    </Pill>
  )
}

/* ------------------------------ 发散条 ------------------------------ */

/** 单指标发散条：中线 0，左红（空）右绿（多）；score ∈ [-2, +2] */
export function DivergingBar({ score }: { score: number }) {
  const { c } = useAppTheme()
  const pct = (Math.max(-2, Math.min(2, score)) / 2) * 50
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c("secondary"), overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: StyleSheet.hairlineWidth, backgroundColor: c("border") }} />
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: pct >= 0 ? "50%" : `${50 - Math.abs(pct)}%`,
          width: `${Math.abs(pct)}%`,
          borderRadius: 3,
          backgroundColor: pct >= 0 ? c("up") : c("down"),
        }}
      />
    </View>
  )
}

/** 综合分横条：中线 0，左空右多，composite ∈ [-100, +100] */
export function CompositeBar({ composite }: { composite: number }) {
  const { c } = useAppTheme()
  const clamped = Math.max(-100, Math.min(100, composite))
  const pct = (Math.abs(clamped) / 100) * 50
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: c("secondary"), overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: StyleSheet.hairlineWidth, backgroundColor: c("border") }} />
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: clamped >= 0 ? "50%" : `${50 - pct}%`,
          width: `${pct}%`,
          borderRadius: 5,
          backgroundColor: clamped >= 0 ? c("up") : c("down"),
        }}
      />
    </View>
  )
}

/* ------------------------------ 半圆仪表 ------------------------------ */

/** 仪表弧段热力色（与 web Gauge.tsx 的 oklch 原串一致；null = 主题中性段） */
const GAUGE_ARCS = [
  { from: -100, to: -60, color: "oklch(0.62 0.21 27)", cap: true },
  { from: -57, to: -20, color: "oklch(0.72 0.15 45)", cap: false },
  { from: -17, to: 17, color: null, cap: false },
  { from: 20, to: 57, color: "oklch(0.77 0.13 145)", cap: false },
  { from: 60, to: 100, color: "oklch(0.78 0.17 152)", cap: true },
] as const

/** 半圆多空仪表盘（-100 → +100，红 → 灰 → 绿）：react-native-svg 自绘，指针随综合分定位 */
export function SignalGauge({ score }: { score: number }) {
  const { c } = useAppTheme()
  const clamped = Math.max(-100, Math.min(100, score))
  const cx = 130
  const cy = 120
  const r = 96

  const arc = (from: number, to: number) => {
    const a1 = Math.PI * (1 - (from + 100) / 200)
    const a2 = Math.PI * (1 - (to + 100) / 200)
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy - r * Math.sin(a2)
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`
  }

  // 针身绘制在 -100 位（指向左），svg rotate 绕表心顺时针转到目标：-100 → 0°，+100 → 180°
  const deg = ((clamped + 100) / 200) * 180

  return (
    <View accessibilityRole="image" accessibilityLabel={t("gauge.aria", { score })} style={{ width: "100%", aspectRatio: 260 / 168 }}>
      <Svg viewBox="0 -14 260 168" style={{ width: "100%", height: "100%" }}>
        {GAUGE_ARCS.map((seg) => (
          <Path
            key={seg.from}
            d={arc(seg.from, seg.to)}
            stroke={seg.color ? rnColor(seg.color) : c("muted-foreground")}
            strokeOpacity={seg.color ? 1 : 0.5}
            strokeWidth={10}
            strokeLinecap={seg.cap ? "round" : "butt"}
            fill="none"
          />
        ))}
        {[-100, -50, 0, 50, 100].map((tk) => {
          const a = Math.PI * (1 - (tk + 100) / 200)
          return (
            <Line
              key={tk}
              x1={cx + (r + 8) * Math.cos(a)}
              y1={cy - (r + 8) * Math.sin(a)}
              x2={cx + (r + 13) * Math.cos(a)}
              y2={cy - (r + 13) * Math.sin(a)}
              stroke={c("muted-foreground")}
              strokeOpacity={0.45}
              strokeWidth={1.5}
            />
          )
        })}
        <Line
          x1={cx}
          y1={cy}
          x2={cx - (r - 22)}
          y2={cy}
          stroke={c("primary")}
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${deg} ${cx} ${cy})`}
        />
        <Circle cx={cx} cy={cy} r={5.5} fill={c("primary")} />
        <Circle cx={cx} cy={cy} r={10} fill="none" stroke={c("primary")} strokeOpacity={0.3} strokeWidth={1} />
        <SvgText x={cx - r + 4} y={cy + 30} textAnchor="middle" fontSize={11} fontWeight="600" fill={rnColor("oklch(0.68 0.18 27)")}>
          {t("gauge.bear")}
        </SvgText>
        <SvgText x={cx} y={cy - r - 26} textAnchor="middle" fontSize={11} fontWeight="600" fill={c("muted-foreground")}>
          {t("gauge.neutral")}
        </SvgText>
        <SvgText x={cx + r - 4} y={cy + 30} textAnchor="middle" fontSize={11} fontWeight="600" fill={rnColor("oklch(0.8 0.16 152)")}>
          {t("gauge.bull")}
        </SvgText>
      </Svg>
    </View>
  )
}

/* ------------------------------ FNG 渐变条 ------------------------------ */

/** 0-100 情绪条渐变背景（FNG_GRADIENT 停靠色 → svg LinearGradient） */
export function FngGradientBar({ height, value }: { height: number; value: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ height, borderRadius: height / 2, overflow: "hidden", position: "relative" }}>
      <Svg style={{ width: "100%", height }} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="fngGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            {FNG_STOPS.map((col, i) => (
              <Stop key={i} offset={`${(i / (FNG_STOPS.length - 1)) * 100}%`} stopColor={rnColor(col)} />
            ))}
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={height} fill="url(#fngGrad)" opacity={0.9} />
      </Svg>
      {/* 当前值游标：3px 浮层色立标（web bg-popover） */}
      <View style={{ position: "absolute", top: 0, bottom: 0, left: `${value}%`, width: 3, marginLeft: -1.5, borderRadius: 1.5, backgroundColor: c("popover") }} />
    </View>
  )
}

/* ------------------------------ 生长动画 ------------------------------ */

/**
 * web「进入视口后自左向右/自下而上生长」（.w-anim 700ms cubic-bezier(0.21,1,0.33,1)）
 * 的 RN 近似：挂载触发（RN 无 IntersectionObserver 对应物），scaleX/scaleY 走
 * native driver。origin: left = 条形从左生长；bottom = 柱状从底生长。
 */
export function GrowIn({
  delayMs = 0,
  durationMs = 700,
  origin = "left",
  style,
  children,
}: {
  delayMs?: number
  durationMs?: number
  origin?: "left" | "bottom"
  style?: ViewStyle
  children?: ReactNode
}) {
  const v = useMemo(() => new Animated.Value(0), [])
  useEffect(() => {
    const a = Animated.sequence([
      Animated.delay(delayMs),
      Animated.timing(v, { toValue: 1, duration: durationMs, easing: Easing.bezier(0.21, 1, 0.33, 1), useNativeDriver: true }),
    ])
    a.start()
    return () => {
      a.stop()
    }
  }, [v, delayMs, durationMs])
  return (
    <Animated.View
      style={[
        { transform: [origin === "left" ? { scaleX: v } : { scaleY: v }], transformOrigin: origin === "left" ? "0% 50%" : "50% 100%" },
        style,
      ]}
    >
      {children}
    </Animated.View>
  )
}

/** 逐项 stagger 生长（30 日柱状图的 25ms/步序列） */
export function useGrowIn(count: number, stepMs = 25, durationMs = 700): Animated.Value[] {
  const values = useMemo(() => Array.from({ length: count }, () => new Animated.Value(0)), [count])
  useEffect(() => {
    const anim = Animated.stagger(
      stepMs,
      values.map((v) => Animated.timing(v, { toValue: 1, duration: durationMs, easing: Easing.bezier(0.21, 1, 0.33, 1), useNativeDriver: true })),
    )
    anim.start()
    return () => {
      anim.stop()
    }
  }, [values, stepMs, durationMs])
  return values
}

/* ------------------------------ 骨架 / 加载 ------------------------------ */

/** 骨架块：secondary 底 + 0.5↔0.9 呼吸（web Skeleton 的 shimmer 近似） */
export function SkBlock({ w, h, r = 4, style }: { w?: number | string; h: number; r?: number; style?: ViewStyle }) {
  const { c } = useAppTheme()
  const v = useMemo(() => new Animated.Value(0.5), [])
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
    }
  }, [v])
  return <Animated.View style={[{ width: w as ViewStyle["width"], height: h, borderRadius: r, backgroundColor: c("secondary") }, style, { opacity: v }]} />
}

/** 卡头骨架 */
export function SkHead() {
  return (
    <View style={{ gap: 6 }}>
      <SkBlock w={96} h={10} />
      <SkBlock w="80%" h={8} />
    </View>
  )
}

/** 三点加载指示（web LoadingDots） */
export function LoadingDots({ count = 3 }: { count?: number }) {
  const { c } = useAppTheme()
  const vals = useMemo(() => Array.from({ length: count }, () => new Animated.Value(0.25)), [count])
  useEffect(() => {
    const anims = vals.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 160),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, { toValue: 1, duration: 420, useNativeDriver: true }),
            Animated.timing(v, { toValue: 0.25, duration: 420, useNativeDriver: true }),
          ]),
        ),
      ]),
    )
    anims.forEach((a) => a.start())
    return () => {
      anims.forEach((a) => a.stop())
    }
  }, [vals])
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {vals.map((v, i) => (
        <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c("muted-foreground"), opacity: v }} />
      ))}
    </View>
  )
}

/* ------------------------------ 页容器 ------------------------------ */

/**
 * 面板页容器：ScrollView + 下拉刷新。顶部安全区由 tab 壳的分段头承担
 * （app/(tabs)/signal.tsx insets.top），底部由 Tabs bar 自处理。
 */
export function PaneShell({
  refreshing,
  onRefresh,
  children,
}: {
  refreshing: boolean
  onRefresh: () => void
  children: ReactNode
}) {
  const { c } = useAppTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c("background") }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 28, gap: 12 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c("primary")} colors={[c("primary")]} progressBackgroundColor={c("card")} />
      }
    >
      {children}
    </ScrollView>
  )
}

/* ------------------------------ 通用小组件 ------------------------------ */

/** 涨跌差值（web delta()：↗/↘/— + 绝对值，涨跌功能色） */
export function Delta({ d }: { d: number }) {
  const { c } = useAppTheme()
  return (
    <Txt mono maxScale={1.2} style={{ fontSize: 12, color: d > 0 ? c("up") : d < 0 ? c("down") : c("muted-foreground") }}>
      {d > 0 ? `↗ ${Math.abs(d)}` : d < 0 ? `↘ ${Math.abs(d)}` : "— 0"}
    </Txt>
  )
}
