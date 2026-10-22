import { useCallback, useMemo, useRef, useState } from "react"
import { Text, View } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg"

import { dateLocale, t } from "@repo/core/i18n"
import { useLocale, useT } from "@repo/react/i18n"
import type { Analysis } from "@repo/core/indicators"
import type { MarketChart as ChartData } from "@repo/data/api"
import { formatPrice } from "@repo/core/format"

import { useAppTheme } from "../../lib/theme"
import { Card } from "../ui"
import { alpha } from "./color"
import { FONT } from "./util"

const H = 240
const PAD_T = 16
const PAD_B = 26
const PAD_L = 8
const PAD_R = 8

/** 悬停探针：i = 最近数据点索引，fx = 探针横向比例（0-1，用于小签定位） */
interface Probe {
  i: number
  fx: number
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/**
 * BTC 近一年走势 + 200 日均线叠加（黑白双线）。
 * 签名交互（触屏版）：按住/横拖出十字线（竖 hairline + 浮动 mono 小签，
 * 读日期/价格/MA200）；横拖经 gesture-handler 捕获、十字线随手指逐帧
 * 吸附最近数据点（reanimated UI 线程），竖向滑动让位给页面滚动。
 * MA200 暖机期（前 199 点）缺段，不从 0 画起 —— 与 web 分段口径一致。
 */
export const BtcChartCard = ({
  chart,
  analysis,
}: {
  chart: ChartData
  analysis: Analysis | null
}) => {
  useT()
  const { locale } = useLocale()
  const { c } = useAppTheme()
  const [chartW, setChartW] = useState(0)
  const [probe, setProbe] = useState<Probe | null>(null)

  const W = chartW

  const model = useMemo(() => {
    const pts = chart.prices
    if (pts.length < 210 || W <= 0) return null

    const closes = pts.map(([, p]) => p)
    const ma200: (number | null)[] = pts.map((_, i) =>
      i >= 199 ? closes.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : null,
    )

    const all = [...closes, ...(ma200.filter((v) => v != null) as number[])]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const span = max - min || 1

    const x = (i: number) => PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R)
    const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B)

    const priceLine = closes.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const area = `${priceLine} L${x(closes.length - 1).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`

    // 均线暖机期 null → 分段（与 web/CandleChart 同口径）
    const maSegs: string[] = []
    let seg = ""
    ma200.forEach((v, i) => {
      if (v == null) {
        if (seg) maSegs.push(seg)
        seg = ""
      } else {
        seg += `${seg === "" ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      }
    })
    if (seg) maSegs.push(seg)

    // 月份刻度（label 随语言在渲染期生成）
    const ticks: { x: number; ts: number }[] = []
    let lastMonth = -1
    pts.forEach(([ts], i) => {
      const d = new Date(ts)
      if (d.getMonth() !== lastMonth && i > 0) {
        lastMonth = d.getMonth()
        ticks.push({ x: x(i), ts })
      }
    })

    return { priceLine, area, maSegs, ticks, min, max, x, y, closes, maVals: ma200, len: pts.length }
  }, [chart, W])

  const tickFmt = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(locale), { month: "short" }),
    [locale],
  )
  const probeDateFmt = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(locale), { month: "short", day: "numeric" }),
    [locale],
  )

  const lastClose = model ? model.closes[model.closes.length - 1] : null
  const ma200Now = analysis?.btc.ma200 ?? null

  /* ------------------------------ 十字线探针 ------------------------------ */
  const fx = useSharedValue(0)
  const active = useSharedValue(false)
  const probeRef = useRef<Probe | null>(null)
  probeRef.current = probe

  const commit = useCallback(
    (nfx: number) => {
      if (!model) return
      const last = model.len - 1
      const i = Math.min(last, Math.max(0, Math.round(nfx * last)))
      const prev = probeRef.current
      if (!prev || prev.i !== i) setProbe({ i, fx: nfx })
      else if (Math.abs(prev.fx - nfx) > 0.02) setProbe({ i, fx: nfx })
    },
    [model],
  )
  const clear = useCallback(() => {
    active.value = false
    setProbe(null)
  }, [active])

  const len = model?.len ?? 2
  const snappedX = useDerivedValue(() => {
    const last = len - 1
    const i = Math.min(last, Math.max(0, Math.round(fx.value * last)))
    return PAD_L + (i / last) * (W - PAD_L - PAD_R)
  }, [W, len])
  const crosshair = useAnimatedStyle(() => ({
    transform: [{ translateX: snappedX.value }],
    opacity: withTiming(active.value ? 1 : 0, { duration: 120 }),
  }))

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        // 横向 8pt 内不激活（让位竖向滚动）；按下即出探针（onBegin）
        .activeOffsetX([-8, 8])
        .onBegin((e) => {
          const nfx = clamp01(e.x / W)
          active.value = true
          fx.value = nfx
          runOnJS(commit)(nfx)
        })
        .onUpdate((e) => {
          const nfx = clamp01(e.x / W)
          fx.value = nfx
          runOnJS(commit)(nfx)
        })
        .onFinalize(() => {
          runOnJS(clear)()
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [W, commit, clear, active, fx],
  )

  const pi = probe && model ? Math.min(probe.i, model.len - 1) : 0
  const probePrice = model && probe ? model.closes[pi] : null
  const probeMa = model && probe ? model.maVals[pi] : null

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ gap: 5 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 14, fontFamily: FONT.semi }}>
          {t("btc.title")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View style={{ width: 16, height: 2, borderRadius: 1, backgroundColor: c("primary") }} />
            <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono }}>
              {t("btc.price")}{" "}
              <Text style={{ color: c("foreground"), fontFamily: FONT.monoMed }}>
                ${lastClose != null ? formatPrice(lastClose) : "—"}
              </Text>
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Svg width={16} height={2}>
              <Line x1={0} y1={1} x2={16} y2={1} stroke={c("chart-5")} strokeWidth={1.5} strokeDasharray="4 3" />
            </Svg>
            <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono }}>
              MA200{" "}
              <Text style={{ color: c("foreground"), fontFamily: FONT.monoMed }}>
                {ma200Now != null ? `$${formatPrice(ma200Now)}` : "—"}
              </Text>
            </Text>
          </View>
        </View>
      </View>

      <View
        onLayout={(e) => setChartW(e.nativeEvent.layout.width)}
        style={{ position: "relative" }}
      >
        {model ? (
          <GestureDetector gesture={gesture}>
            <View style={{ position: "relative" }} accessible accessibilityLabel={t("btc.aria")}>
              <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={t("btc.aria")}>
                <Defs>
                  <LinearGradient id="btcfill" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={c("primary")} stopOpacity={0.16} />
                    <Stop offset="1" stopColor={c("primary")} stopOpacity={0} />
                  </LinearGradient>
                </Defs>

                {/* 水平网格 */}
                {[0.25, 0.5, 0.75].map((g) => (
                  <Line
                    key={g}
                    x1={PAD_L}
                    x2={W - PAD_R}
                    y1={PAD_T + g * (H - PAD_T - PAD_B)}
                    y2={PAD_T + g * (H - PAD_T - PAD_B)}
                    stroke={c("foreground")}
                    strokeOpacity={0.08}
                    strokeWidth={1}
                  />
                ))}

                {/* 价格在线上方区域高亮（牛市区间） */}
                <Path d={model.area} fill="url(#btcfill)" />
                {/* MA200 虚线（暖机期缺段） */}
                {model.maSegs.map((s, i) => (
                  <Path
                    key={i}
                    d={s}
                    fill="none"
                    stroke={c("chart-5")}
                    strokeOpacity={0.85}
                    strokeWidth={1.5}
                    strokeDasharray="6 5"
                  />
                ))}
                {/* 主线 + 末点标记 */}
                <Path d={model.priceLine} fill="none" stroke={c("primary")} strokeWidth={2} strokeLinejoin="round" />
                <Circle cx={model.x(model.len - 1)} cy={model.y(lastClose!)} r={4} fill={c("primary")} />

                {/* 探针数据点高亮（十字线为 reanimated 覆盖层） */}
                {probe && (
                  <Circle cx={model.x(pi)} cy={model.y(probePrice!)} r={3.5} fill={c("primary")} />
                )}

                {/* 月份刻度 + 上下沿价格 */}
                {model.ticks.map((tk, i) => (
                  <SvgText
                    key={i}
                    x={tk.x}
                    y={H - 6}
                    fontSize={10}
                    fill={c("foreground")}
                    fillOpacity={0.4}
                    textAnchor="middle"
                    fontFamily={FONT.mono}
                  >
                    {tickFmt.format(tk.ts)}
                  </SvgText>
                ))}
                <SvgText x={PAD_L} y={PAD_T + 4} fontSize={10} fill={c("foreground")} fillOpacity={0.5} fontFamily={FONT.mono}>
                  ${formatPrice(model.max)}
                </SvgText>
                <SvgText x={PAD_L} y={H - PAD_B - 2} fontSize={10} fill={c("foreground")} fillOpacity={0.5} fontFamily={FONT.mono}>
                  ${formatPrice(model.min)}
                </SvgText>
              </Svg>

              {/* 十字线（竖 hairline，UI 线程逐帧吸附最近数据点） */}
              <Animated.View
                pointerEvents="none"
                style={[
                  crosshair,
                  {
                    position: "absolute",
                    left: 0,
                    top: PAD_T,
                    width: 1,
                    height: H - PAD_T - PAD_B,
                    backgroundColor: alpha(c("foreground"), 0.4),
                  },
                ]}
              />

              {/* 浮动 mono 小签：日期 / 价格 / MA200（全宽居中，左右边界免钳位） */}
              {probe && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 2,
                    left: 4,
                    right: 4,
                    alignSelf: "center",
                    alignItems: "center",
                    borderRadius: 4,
                    borderWidth: 1,
                    borderColor: alpha(c("border"), 0.6),
                    backgroundColor: c("popover"),
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono }}>
                    {probeDateFmt.format(chart.prices[pi][0])}
                    {"  "}
                    <Text style={{ color: c("foreground"), fontFamily: FONT.monoMed }}>
                      ${formatPrice(probePrice!)}
                    </Text>
                    {"  MA200 "}
                    {probeMa != null ? `$${formatPrice(probeMa)}` : "—"}
                  </Text>
                </View>
              )}
            </View>
          </GestureDetector>
        ) : chart.prices.length >= 210 ? (
          // 布局尚未测得宽度：先占位，避免误报「数据不可用」
          <View style={{ height: H }} />
        ) : (
          <View style={{ height: H, alignItems: "center", justifyContent: "center" }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12 }}>
              {t("btc.unavailable")}
            </Text>
          </View>
        )}
      </View>
    </Card>
  )
}
