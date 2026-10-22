/**
 * K 线图（react-native-svg 自绘）— web CandleChart.tsx 的全功能移植：
 *  - 蜡烛/折线双渲染模式；主图叠加 MA(7/25/99) / BOLL(20,2) / 自动斐波那契回撤
 *  - 副图 RSI(14) / MACD(12,26,9) / KDJ(9,3,3)；成交量涨跌色柱
 *  - 手势：拖动平移窗口 / 双指缩放（焦点锚定）/ 点按十字线读数 / 快速双击复位
 *  - 指标一律对全量序列整算一次（ta.smaSeries 等暖机期 null 口径：
 *    均线缺段而非从 0 画起），窗口缩放/平移只切片显示、绝不重算
 *
 * 十字线纵线经 react-native-reanimated（useSharedValue + useAnimatedProps）
 * 驱动，点按/平移不重渲染静态图层；窗口平移/缩放走 react-native-gesture-handler。
 * 配色：主蜡烛 up/down 功能色（全主题共享），指标线 chart-1..5 随主题，
 * 斐波那契 primary —— 全部经 useAppTheme().c() 取，无裸色值。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import Animated, { runOnJS, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated"

import { t } from "@repo/core/i18n"
import type { Candle } from "@repo/data/kline"
import { autoFibonacci, bollSeries, kdjSeries, macdSeries, rsiSeries, smaSeries, type AutoFib } from "@repo/core/ta"

import { useAppTheme } from "../lib/theme"
import { Tap } from "./ui"

const AnimatedLine = Animated.createAnimatedComponent(Line)

interface Props {
  candles: Candle[]
  renderMode: "candles" | "line"
  overlays: { ma: boolean; boll: boolean; fib: boolean }
  panes: { rsi: boolean; macd: boolean; kdj: boolean }
  intervalKey: string
}

const SUB_PANE_H = 76
const PANE_GAP = 8
const PAD_R = 56
const PAD_L = 6
const AXIS_H = 20
const MIN_BARS = 15
/** 主图高（含成交量区）：手机竖屏固定档，web 的 max(280, w*0.36) 等效收窄 */
const MAIN_H = 232
const VOL_RATIO = 0.2

/** 可见窗口 [start, start+count)，null = 全量视图（随数据更新自动跟随右沿） */
interface ChartView {
  start: number
  count: number
}

function linePath(pts: (readonly [number, number] | null)[]): string {
  let d = ""
  let started = false
  for (const p of pts) {
    if (!p) {
      started = false
      continue
    }
    d += `${started ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)} `
    started = true
  }
  return d
}

const fmtTime = (time: number, itv: string) => {
  const d = new Date(time)
  const p = (n: number) => String(n).padStart(2, "0")
  if (itv === "1s") return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  if (itv.endsWith("m") || itv === "1h" || itv === "4h")
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  return `${String(d.getFullYear()).slice(2)}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

const fmtNum = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

const fmtVol = (v: number) =>
  v >= 1e9
    ? `${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
      ? `${(v / 1e6).toFixed(2)}M`
      : v >= 1e3
        ? `${(v / 1e3).toFixed(1)}K`
        : v.toFixed(0)

const fibRatioLabel = (r: number) => r.toFixed(3).replace(/\.?0+$/, "")

/* ------------------------------ 色板（主题取词） ------------------------------ */

function useChartColors() {
  const { c } = useAppTheme()
  return useMemo(
    () => ({
      up: c("up"),
      down: c("down"),
      upText: c("up-foreground"),
      downText: c("down-foreground"),
      line1: c("chart-1"), // MA7 / KDJ-K
      line2: c("chart-2"), // MA25 / RSI / KDJ-J
      line3: c("chart-3"), // MA99 / MACD-DIF / KDJ-D
      line4: c("chart-4"), // BOLL 上下轨
      line5: c("chart-5"), // BOLL 中轨 / MACD-DEA
      fib: c("primary"),
      grid: c("border"),
      textDim: c("muted-foreground"),
      foreground: c("foreground"),
      background: c("background"),
      popover: c("popover"),
      popoverForeground: c("popover-foreground"),
    }),
    [c],
  )
}
type ChartColors = ReturnType<typeof useChartColors>

/* ------------------------------ 指标层与模型 ------------------------------ */

interface IndicatorLayer {
  ma7: (number | null)[] | null
  ma25: (number | null)[] | null
  ma99: (number | null)[] | null
  boll: { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } | null
  rsi: (number | null)[] | null
  macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } | null
  kdj: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } | null
  fib: AutoFib | null
}

interface ChartModel {
  ma7: (number | null)[] | null
  ma25: (number | null)[] | null
  ma99: (number | null)[] | null
  boll: { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } | null
  rsi: (number | null)[] | null
  macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } | null
  kdj: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } | null
  fib: (AutoFib & { startIndex: number; endIndex: number }) | null
  pMin: number
  pMax: number
  vMax: number
  step: number
  cw: number
  x: (i: number) => number
  y: (v: number) => number
  vy: (v: number) => number
  priceTicks: number[]
  timeTicks: number[]
}

interface SubPane {
  key: string
  label: string
  top: number
  h: number
}

const MONO = "JetBrainsMono_400Regular"

/* ------------------------------ 静态图层（memo） ------------------------------ */

const ChartLayers = memo(function ChartLayers({
  candles,
  model,
  renderMode,
  w,
  mainH,
  subPanes,
  chartH,
  intervalKey,
  col,
}: {
  candles: Candle[]
  model: ChartModel
  renderMode: "candles" | "line"
  w: number
  mainH: number
  subPanes: SubPane[]
  chartH: number
  intervalKey: string
  col: ChartColors
}) {
  /* 网格与价格轴 */
  const grid = model.priceTicks.map((tv, i) => (
    <G key={`g${i}`}>
      <Line x1={PAD_L} x2={w - PAD_R} y1={model.y(tv)} y2={model.y(tv)} stroke={col.grid} strokeOpacity={0.6} strokeWidth={1} />
      <SvgText x={w - PAD_R + 6} y={model.y(tv) + 3.5} fontSize={9} fill={col.textDim} fontFamily={MONO}>
        {fmtNum(tv)}
      </SvgText>
    </G>
  ))

  /* BOLL 带填充 */
  const bollBand =
    model.boll != null ? (
      <Path
        d={
          linePath(model.boll.upper.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const)))) +
          " " +
          linePath(model.boll.lower.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))).slice().reverse()).replace("M", "L")
        }
        fill={col.line4}
        fillOpacity={0.07}
      />
    ) : null

  /* 成交量：涨绿跌红 */
  const vols = candles.map((cd, i) =>
    cd.volume == null ? null : (
      <Rect
        key={`v${i}`}
        x={model.x(i) - model.cw / 2}
        y={model.vy(cd.volume)}
        width={model.cw}
        height={Math.max(1, mainH - model.vy(cd.volume))}
        fill={cd.close >= cd.open ? col.up : col.down}
        fillOpacity={0.45}
      />
    ),
  )

  /* 蜡烛 / 折线 */
  const body =
    renderMode === "candles" ? (
      candles.map((cd, i) => {
        const up = cd.close >= cd.open
        const color = up ? col.up : col.down
        const yO = model.y(cd.open)
        const yC = model.y(cd.close)
        const top = Math.min(yO, yC)
        const bodyH = Math.max(1, Math.abs(yC - yO))
        return (
          <G key={`c${i}`}>
            <Line x1={model.x(i)} x2={model.x(i)} y1={model.y(cd.high)} y2={model.y(cd.low)} stroke={color} strokeWidth={1} />
            <Rect x={model.x(i) - model.cw / 2} y={top} width={model.cw} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} />
          </G>
        )
      })
    ) : (
      <Path d={linePath(candles.map((cd, i) => [model.x(i), model.y(cd.close)] as const))} fill="none" stroke={col.fib} strokeWidth={1.8} />
    )

  /* MA 叠加 */
  const maPaths = (
    <>
      {model.ma7 != null && (
        <Path d={linePath(model.ma7.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line1} strokeWidth={1.4} />
      )}
      {model.ma25 != null && (
        <Path d={linePath(model.ma25.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line2} strokeWidth={1.4} />
      )}
      {model.ma99 != null && (
        <Path d={linePath(model.ma99.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line3} strokeWidth={1.4} />
      )}
    </>
  )

  /* BOLL 线 */
  const bollLines =
    model.boll != null ? (
      <>
        <Path d={linePath(model.boll.mid.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line5} strokeWidth={1} strokeDasharray="4 3" />
        <Path d={linePath(model.boll.upper.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line4} strokeWidth={0.9} />
        <Path d={linePath(model.boll.lower.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={col.line4} strokeWidth={0.9} />
      </>
    ) : null

  /* 斐波那契回撤（起止索引已平移到窗口局部坐标） */
  const fib = (() => {
    const f = model.fib
    if (!f) return null
    const x0 = model.x(Math.min(f.startIndex, f.endIndex))
    const xRight = w - PAD_R
    const yEnd = model.y(f.endPrice)
    const yStart = model.y(f.startPrice)
    return (
      <G>
        <Rect x={x0} y={Math.min(yStart, yEnd)} width={Math.max(0, xRight - x0)} height={Math.abs(yEnd - yStart)} fill={col.fib} fillOpacity={0.045} />
        <Line x1={model.x(f.startIndex)} y1={yStart} x2={model.x(f.endIndex)} y2={yEnd} stroke={col.fib} strokeWidth={1} strokeOpacity={0.7} strokeDasharray="5 4" />
        <Circle cx={model.x(f.startIndex)} cy={yStart} r={2.5} fill={col.fib} />
        <Circle cx={model.x(f.endIndex)} cy={yEnd} r={2.5} fill={col.fib} />
        {f.levels.map((l) => {
          const edge = l.ratio === 0 || l.ratio === 1
          const ly = model.y(l.price)
          return (
            <G key={`fib${l.ratio}`}>
              <Line
                x1={x0}
                x2={xRight}
                y1={ly}
                y2={ly}
                stroke={col.fib}
                strokeWidth={edge ? 1.2 : 0.9}
                strokeOpacity={edge || l.ratio === 0.618 ? 0.9 : 0.55}
                strokeDasharray={edge ? undefined : "4 3"}
              />
              <SvgText x={xRight - 4} y={ly - 3} fontSize={9} fontWeight="600" textAnchor="end" fill={col.fib} fontFamily={MONO}>
                {fibRatioLabel(l.ratio)} {fmtNum(l.price)}
              </SvgText>
            </G>
          )
        })}
      </G>
    )
  })()

  /* 可见窗口末根K线：虚线 + 涨跌色价签 */
  const lastC = candles[candles.length - 1]
  const lastUp = lastC.close >= lastC.open
  const lastY = model.y(lastC.close)
  const lastPriceTag = (
    <G>
      <Line x1={PAD_L} x2={w - PAD_R} y1={lastY} y2={lastY} stroke={col.foreground} strokeOpacity={0.3} strokeDasharray="2 3" strokeWidth={1} />
      <Rect x={w - PAD_R + 2} y={lastY - 8} width={PAD_R - 4} height={16} rx={3} fill={lastUp ? col.up : col.down} />
      <SvgText x={w - PAD_R + 6} y={lastY + 4} fontSize={10} fontWeight="700" fill={lastUp ? col.upText : col.downText} fontFamily={MONO}>
        {fmtNum(lastC.close)}
      </SvgText>
    </G>
  )

  /* 副图 */
  const subPanesEls = subPanes.map((pane) => {
    const inner = pane.h - 18
    if (pane.key === "rsi" && model.rsi) {
      const ry = (v: number) => pane.top + 9 + (1 - v / 100) * inner
      return (
        <G key={pane.key}>
          <SvgText x={PAD_L} y={pane.top + 8} fontSize={9} fill={col.textDim} fontFamily={MONO}>{pane.label}</SvgText>
          {[70, 30].map((lv) => (
            <G key={`rsilv${lv}`}>
              <Line x1={PAD_L} x2={w - PAD_R} y1={ry(lv)} y2={ry(lv)} stroke={col.grid} strokeDasharray="3 3" strokeWidth={1} />
              <SvgText x={w - PAD_R + 6} y={ry(lv) + 3} fontSize={9} fill={col.textDim} fontFamily={MONO}>{lv}</SvgText>
            </G>
          ))}
          <Line x1={PAD_L} x2={w - PAD_R} y1={ry(50)} y2={ry(50)} stroke={col.grid} strokeOpacity={0.6} strokeWidth={1} />
          <Path d={linePath(model.rsi.map((v, i) => (v == null ? null : ([model.x(i), ry(v)] as const))))} fill="none" stroke={col.line2} strokeWidth={1.3} />
        </G>
      )
    }
    if (pane.key === "macd" && model.macd) {
      let mMin = Infinity
      let mMax = -Infinity
      for (const s of [model.macd.dif, model.macd.dea, model.macd.hist]) {
        s.forEach((v) => {
          if (v != null) {
            mMin = Math.min(mMin, v)
            mMax = Math.max(mMax, v)
          }
        })
      }
      const mPad = (mMax - mMin) * 0.12 || 1
      mMin -= mPad
      mMax += mPad
      const my = (v: number) => pane.top + 9 + (1 - (v - mMin) / (mMax - mMin)) * inner
      return (
        <G key={pane.key}>
          <SvgText x={PAD_L} y={pane.top + 8} fontSize={9} fill={col.textDim} fontFamily={MONO}>{pane.label}</SvgText>
          <Line x1={PAD_L} x2={w - PAD_R} y1={my(0)} y2={my(0)} stroke={col.grid} strokeWidth={1} />
          <SvgText x={w - PAD_R + 6} y={my(0) + 3} fontSize={9} fill={col.textDim} fontFamily={MONO}>0</SvgText>
          {model.macd.hist.map((v, i) =>
            v == null ? null : (
              <Rect key={`mh${i}`} x={model.x(i) - model.cw / 2} y={Math.min(my(v), my(0))} width={model.cw} height={Math.max(1, Math.abs(my(v) - my(0)))} fill={v >= 0 ? col.up : col.down} fillOpacity={0.45} />
            ),
          )}
          <Path d={linePath(model.macd.dif.map((v, i) => (v == null ? null : ([model.x(i), my(v)] as const))))} fill="none" stroke={col.line3} strokeWidth={1.2} />
          <Path d={linePath(model.macd.dea.map((v, i) => (v == null ? null : ([model.x(i), my(v)] as const))))} fill="none" stroke={col.line5} strokeWidth={1.2} />
        </G>
      )
    }
    if (pane.key === "kdj" && model.kdj) {
      const ky = (v: number) => pane.top + 9 + (1 - Math.max(0, Math.min(120, v)) / 120) * inner
      return (
        <G key={pane.key}>
          <SvgText x={PAD_L} y={pane.top + 8} fontSize={9} fill={col.textDim} fontFamily={MONO}>{pane.label}</SvgText>
          {[80, 20].map((lv) => (
            <G key={`kjlv${lv}`}>
              <Line x1={PAD_L} x2={w - PAD_R} y1={ky(lv)} y2={ky(lv)} stroke={col.grid} strokeDasharray="3 3" strokeWidth={1} />
              <SvgText x={w - PAD_R + 6} y={ky(lv) + 3} fontSize={9} fill={col.textDim} fontFamily={MONO}>{lv}</SvgText>
            </G>
          ))}
          <Path d={linePath(model.kdj.k.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={col.line1} strokeWidth={1.2} />
          <Path d={linePath(model.kdj.d.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={col.line3} strokeWidth={1.2} />
          <Path d={linePath(model.kdj.j.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={col.line2} strokeWidth={1} strokeDasharray="3 2" />
        </G>
      )
    }
    return null
  })

  /* 时间轴 */
  const timeAxis = model.timeTicks.map((i) => (
    <SvgText key={`t${i}`} x={model.x(i)} y={chartH - 5} fontSize={9} fill={col.textDim} textAnchor="middle" fontFamily={MONO}>
      {fmtTime(candles[i].time, intervalKey)}
    </SvgText>
  ))

  return (
    <G>
      {grid}
      {bollBand}
      {vols}
      {body}
      {maPaths}
      {bollLines}
      {fib}
      {lastPriceTag}
      {subPanesEls}
      {timeAxis}
    </G>
  )
})

/* ------------------------------ 主组件 ------------------------------ */

export function CandleChart({ candles, renderMode, overlays, panes, intervalKey }: Props) {
  const col = useChartColors()
  const { c } = useAppTheme()
  const [w, setW] = useState(320)
  const [view, setView] = useState<ChartView | null>(null)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const len = candles.length

  /* 十字线（reanimated）：纵线位置 + 显隐，点按/平移不触发静态图层重渲染 */
  const crossX = useSharedValue(-1)
  const crossOpacity = useSharedValue(0)
  /** 十字线是否处于点亮态（worklet 侧判定，避免每帧 runOnJS） */
  const hasCrossSV = useSharedValue(0)
  const lineProps = useAnimatedProps(() => ({
    x1: crossX.value,
    x2: crossX.value,
    opacity: crossOpacity.value,
  }))

  /* 手势 worklet 侧的窗口参数镜像 */
  const stepSV = useSharedValue(1)
  const winStartSV = useSharedValue(0)
  const countSV = useSharedValue(len)
  const lenSV = useSharedValue(len)
  const widthSV = useSharedValue(320)
  const anchorX = useSharedValue(0)
  const anchorStart = useSharedValue(0)
  const pinchStartCount = useSharedValue(len)
  const pinchStart = useSharedValue(0)

  const volH = MAIN_H * VOL_RATIO
  const priceH = MAIN_H - volH - 6

  /* 可见窗口（null = 全量，随数据更新自动跟随右沿） */
  const win: ChartView = useMemo(() => {
    if (!view) return { start: 0, count: len }
    const count = Math.max(1, Math.min(view.count, len))
    const start = Math.max(0, Math.min(view.start, len - count))
    return view.start === start && view.count === count ? view : { start, count }
  }, [view, len])

  /* 数据更新时的窗口维护（与 web 同规则）：
     同长度替换保持窗口；滚入新K线且贴右沿则跟随；长度大变重置全量 */
  const prevLenRef = useRef(len)
  useEffect(() => {
    const prev = prevLenRef.current
    prevLenRef.current = len
    if (prev === len) return
    setView((v) => {
      if (!v) return null
      const diff = len - prev
      if (Math.abs(diff) > 2) return null
      const count = Math.max(1, Math.min(v.count, len))
      const pinned = v.start + v.count >= prev
      const raw = pinned ? len - count : v.start
      const start = Math.max(0, Math.min(raw, len - count))
      if (start === v.start && count === v.count) return v
      return { start, count }
    })
  }, [len])

  /* 全量指标：与窗口无关整算一次（暖机期 null 口径由 ta 保证） */
  const indicators = useMemo<IndicatorLayer | null>(() => {
    if (len < 2) return null
    const closes = candles.map((k) => k.close)
    const highs = candles.map((k) => k.high)
    const lows = candles.map((k) => k.low)
    return {
      ma7: overlays.ma ? smaSeries(closes, 7) : null,
      ma25: overlays.ma ? smaSeries(closes, 25) : null,
      ma99: overlays.ma ? smaSeries(closes, 99) : null,
      boll: overlays.boll ? bollSeries(closes, 20, 2) : null,
      rsi: panes.rsi ? rsiSeries(closes, 14) : null,
      macd: panes.macd ? macdSeries(closes) : null,
      kdj: panes.kdj ? kdjSeries(highs, lows, closes) : null,
      fib: overlays.fib ? autoFibonacci(candles) : null,
    }
  }, [candles, overlays, panes, len])

  /* 窗口模型：指标切片 + 标度重算 */
  const model = useMemo<ChartModel | null>(() => {
    if (!indicators) return null
    const { start, count } = win
    const end = start + count
    const winCandles = candles.slice(start, end)
    const cut = (s: (number | null)[] | null) => (s ? s.slice(start, end) : null)

    const ma7 = cut(indicators.ma7)
    const ma25 = cut(indicators.ma25)
    const ma99 = cut(indicators.ma99)
    const boll = indicators.boll
      ? { upper: cut(indicators.boll.upper)!, mid: cut(indicators.boll.mid)!, lower: cut(indicators.boll.lower)! }
      : null
    const rsi = cut(indicators.rsi)
    const macd = indicators.macd
      ? { dif: cut(indicators.macd.dif)!, dea: cut(indicators.macd.dea)!, hist: cut(indicators.macd.hist)! }
      : null
    const kdj = indicators.kdj
      ? { k: cut(indicators.kdj.k)!, d: cut(indicators.kdj.d)!, j: cut(indicators.kdj.j)! }
      : null
    const fib = indicators.fib
      ? { ...indicators.fib, startIndex: indicators.fib.startIndex - start, endIndex: indicators.fib.endIndex - start }
      : null

    let pMin = Infinity
    let pMax = -Infinity
    winCandles.forEach((k) => {
      pMin = Math.min(pMin, k.low)
      pMax = Math.max(pMax, k.high)
    })
    for (const s of [boll?.upper, boll?.lower, ma99]) {
      s?.forEach((v) => {
        if (v != null) {
          pMin = Math.min(pMin, v)
          pMax = Math.max(pMax, v)
        }
      })
    }
    const pad = (pMax - pMin) * 0.06 || pMax * 0.02
    pMin -= pad
    pMax += pad

    const vMax = Math.max(...winCandles.map((k) => k.volume ?? 0), 1)

    const innerW = w - PAD_L - PAD_R
    const step = innerW / count
    const cw = Math.max(1, Math.min(14, step * 0.62))
    const x = (i: number) => PAD_L + (i + 0.5) * step
    const y = (v: number) => 6 + (1 - (v - pMin) / (pMax - pMin)) * (priceH - 12)
    const vy = (v: number) => MAIN_H - (v / vMax) * (volH - 4)

    const priceTicks = Array.from({ length: 5 }, (_, i) => pMin + ((pMax - pMin) * i) / 4)
    const timeTickCount = Math.min(5, count)
    const timeTicks = Array.from({ length: timeTickCount }, (_, i) =>
      Math.round((i * (count - 1)) / Math.max(1, timeTickCount - 1)),
    ).filter((v, i, a) => a.indexOf(v) === i)

    return { ma7, ma25, ma99, boll, rsi, macd, kdj, fib, pMin, pMax, vMax, step, cw, x, y, vy, priceTicks, timeTicks }
  }, [candles, indicators, win, w, priceH, volH])

  const winCandles = useMemo(() => candles.slice(win.start, win.start + win.count), [candles, win])

  /* 副图布局（只随副图开关变化） */
  const { subPanes, chartH } = useMemo(() => {
    const list: SubPane[] = []
    let cursorTop = AXIS_H + MAIN_H + PANE_GAP
    if (panes.rsi) {
      list.push({ key: "rsi", label: "RSI(14)", top: cursorTop, h: SUB_PANE_H })
      cursorTop += SUB_PANE_H + PANE_GAP
    }
    if (panes.macd) {
      list.push({ key: "macd", label: "MACD(12,26,9)", top: cursorTop, h: SUB_PANE_H })
      cursorTop += SUB_PANE_H + PANE_GAP
    }
    if (panes.kdj) {
      list.push({ key: "kdj", label: "KDJ(9,3,3)", top: cursorTop, h: SUB_PANE_H })
      cursorTop += SUB_PANE_H + PANE_GAP
    }
    return { subPanes: list, chartH: Math.max(cursorTop - PANE_GAP, AXIS_H + MAIN_H) }
  }, [panes])

  /* worklet 参数镜像同步 */
  useEffect(() => {
    stepSV.value = model?.step ?? 1
    winStartSV.value = win.start
    countSV.value = win.count
    lenSV.value = len
    widthSV.value = w
  }, [model, win, len, w, stepSV, winStartSV, countSV, lenSV, widthSV])

  /* 点按十字线 + 快速双击复位（双击 = 300ms 内两次点按） */
  const lastTapRef = useRef(0)
  const handleTap = useCallback(
    (x: number) => {
      if (!model) return
      const now = Date.now()
      const isDouble = now - lastTapRef.current < 300
      lastTapRef.current = now
      if (isDouble) {
        setView(null)
        hasCrossSV.value = 0
        crossOpacity.value = withTiming(0, { duration: 80 })
        setSelectedIdx(null)
        return
      }
      const local = Math.max(0, Math.min(win.count - 1, Math.round((x - PAD_L) / model.step - 0.5)))
      hasCrossSV.value = 1
      crossX.value = withTiming(PAD_L + (local + 0.5) * model.step, { duration: 120 })
      crossOpacity.value = withTiming(1, { duration: 120 })
      setSelectedIdx(win.start + local)
    },
    [model, win, crossX, crossOpacity, hasCrossSV],
  )

  const setViewStartJS = useCallback((start: number) => {
    setView((v) => ({ start, count: v?.count ?? countSV.value }))
  }, [countSV])

  const setViewZoomJS = useCallback((next: { start: number; count: number }) => {
    setView(next)
  }, [])

  const hideCross = useCallback(() => {
    setSelectedIdx(null)
  }, [])

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin((e) => {
      anchorX.value = e.x
      anchorStart.value = winStartSV.value
    })
    .onUpdate((e) => {
      // 平移开始即整体隐藏十字线（线 + 高亮框 + 时间签）
      if (hasCrossSV.value === 1) {
        hasCrossSV.value = 0
        crossOpacity.value = withTiming(0, { duration: 80 })
        runOnJS(hideCross)()
      }
      const dx = e.x - anchorX.value
      const step = stepSV.value
      if (step <= 0) return
      const l = lenSV.value
      const count = countSV.value
      const raw = Math.round(anchorStart.value - dx / step)
      const maxStart = Math.max(0, l - count)
      const start = Math.max(0, Math.min(maxStart, raw))
      if (start !== winStartSV.value) {
        winStartSV.value = start
        runOnJS(setViewStartJS)(start)
      }
    })
    .onEnd((_e, success) => {
      // 平移结束不恢复十字线（与 web applyHover(null) 同拍），等下一次点按
      if (success) runOnJS(hideCross)()
    })

  const pinch = Gesture.Pinch()
    .onStart(() => {
      pinchStartCount.value = countSV.value
      pinchStart.value = winStartSV.value
    })
    .onUpdate((e) => {
      const scale = Math.max(0.3, Math.min(3, e.scale))
      const l = lenSV.value
      const count = Math.max(MIN_BARS, Math.min(l, Math.round(pinchStartCount.value / scale)))
      if (count === pinchStartCount.value) return
      const stepNew = (widthSV.value - PAD_L - PAD_R) / count
      const stepStart = (widthSV.value - PAD_L - PAD_R) / pinchStartCount.value
      const gIdx = pinchStart.value + (e.focalX - PAD_L) / stepStart - 0.5
      const start = Math.max(0, Math.min(l - count, Math.round(gIdx - (e.focalX - PAD_L) / stepNew + 0.5)))
      winStartSV.value = start
      countSV.value = count
      runOnJS(setViewZoomJS)({ start, count })
    })

  const tap = Gesture.Tap().onEnd((e, success) => {
    if (success) runOnJS(handleTap)(e.x)
  })

  const composed = Gesture.Simultaneous(tap, pan, pinch)

  /* 读数条：悬点/末根K线的 OHLCV 与指标读数 */
  const hoverIdx = selectedIdx != null ? Math.max(0, Math.min(selectedIdx, len - 1)) : len - 1
  const cur = candles[hoverIdx]
  const curChange = ((cur.close - cur.open) / cur.open) * 100
  const seriesAt = (s: (number | null)[] | null) => (s ? s[hoverIdx] : null)

  if (!model || !indicators || !cur) {
    return (
      <View style={{ height: MAIN_H, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ color: c("muted-foreground"), fontSize: 12 }}>{t("candle.insufficient")}</Text>
      </View>
    )
  }

  const upDownColor = cur.close >= cur.open ? col.up : col.down
  const hoverLocal = selectedIdx != null ? selectedIdx - win.start : -1
  const hoverVisible = hoverLocal >= 0 && hoverLocal < win.count
  const crossLineX = hoverVisible ? model.x(hoverLocal) : -1
  const zoomed = view != null && (win.count < len || win.start > 0)

  return (
    <View accessibilityLabel={t("candle.aria")}>
      {/* 读数条（wrap 多行，等宽数字） */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4, marginBottom: 8, alignItems: "center" }}>
        <Text style={[s.ro, { color: c("foreground"), backgroundColor: c("secondary"), paddingHorizontal: 6, paddingVertical: 3, borderRadius: 3, fontWeight: "600" }]}>
          {fmtTime(cur.time, intervalKey)}
        </Text>
        <Text style={[s.ro, { color: c("muted-foreground") }]}>
          {t("candle.open")} <Text style={{ color: upDownColor }}>{fmtNum(cur.open)}</Text>
        </Text>
        <Text style={[s.ro, { color: c("muted-foreground") }]}>
          {t("candle.high")} <Text style={{ color: upDownColor }}>{fmtNum(cur.high)}</Text>
        </Text>
        <Text style={[s.ro, { color: c("muted-foreground") }]}>
          {t("candle.low")} <Text style={{ color: upDownColor }}>{fmtNum(cur.low)}</Text>
        </Text>
        <Text style={[s.ro, { color: c("muted-foreground") }]}>
          {t("candle.close")} <Text style={{ color: upDownColor }}>{fmtNum(cur.close)}</Text>
        </Text>
        <Text style={[s.ro, { color: curChange >= 0 ? col.up : col.down }]}>
          {curChange >= 0 ? "+" : ""}
          {curChange.toFixed(2)}%
        </Text>
        {cur.volume != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            {t("candle.volume")} <Text style={{ color: c("foreground") }}>${fmtVol(cur.volume)}</Text>
          </Text>
        )}
        {model.ma7 != null && indicators.ma7 != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            MA7 <Text style={{ color: col.line1 }}>{seriesAt(indicators.ma7)?.toFixed(1) ?? "—"}</Text>
            {"  25 "}
            <Text style={{ color: col.line2 }}>{seriesAt(indicators.ma25)?.toFixed(1) ?? "—"}</Text>
            {"  99 "}
            <Text style={{ color: col.line3 }}>{seriesAt(indicators.ma99)?.toFixed(1) ?? "—"}</Text>
          </Text>
        )}
        {model.boll != null && indicators.boll != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            BOLL {t("candle.boll.upper")}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.boll.upper)?.toFixed(1) ?? "—"}</Text>
            {` ${t("candle.boll.mid")} `}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.boll.mid)?.toFixed(1) ?? "—"}</Text>
            {` ${t("candle.boll.lower")} `}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.boll.lower)?.toFixed(1) ?? "—"}</Text>
          </Text>
        )}
        {model.rsi != null && indicators.rsi != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            RSI <Text style={{ color: c("foreground") }}>{seriesAt(indicators.rsi)?.toFixed(1) ?? "—"}</Text>
          </Text>
        )}
        {model.macd != null && indicators.macd != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            DIF <Text style={{ color: c("foreground") }}>{seriesAt(indicators.macd.dif)?.toFixed(1) ?? "—"}</Text>
            {" DEA "}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.macd.dea)?.toFixed(1) ?? "—"}</Text>
          </Text>
        )}
        {model.kdj != null && indicators.kdj != null && (
          <Text style={[s.ro, { color: c("muted-foreground") }]}>
            K <Text style={{ color: c("foreground") }}>{seriesAt(indicators.kdj.k)?.toFixed(1) ?? "—"}</Text>
            {" D "}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.kdj.d)?.toFixed(1) ?? "—"}</Text>
            {" J "}
            <Text style={{ color: c("foreground") }}>{seriesAt(indicators.kdj.j)?.toFixed(1) ?? "—"}</Text>
          </Text>
        )}
      </View>

      <View
        style={{ height: chartH }}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
      >
        <GestureDetector gesture={composed}>
          <View style={{ flex: 1 }} collapsable={false}>
            <Svg width="100%" height={chartH} viewBox={`0 0 ${w} ${chartH}`}>              <ChartLayers
                candles={winCandles}
                model={model}
                renderMode={renderMode}
                w={w}
                mainH={MAIN_H}
                subPanes={subPanes}
                chartH={chartH}
                intervalKey={intervalKey}
                col={col}
              />
              {/* 十字线层（纵线 reanimated 驱动；高亮框/时间签随选中K线离散更新） */}
              <AnimatedLine
                y1={4}
                y2={chartH - AXIS_H}
                stroke={col.foreground}
                strokeOpacity={0.4}
                strokeDasharray="3 3"
                strokeWidth={1}
                animatedProps={lineProps}
              />
              {hoverVisible && renderMode === "candles" && (
                <Rect
                  x={model.x(hoverLocal) - model.cw / 2 - 2}
                  y={model.y(Math.max(cur.open, cur.close)) - 2}
                  width={model.cw + 4}
                  height={Math.max(4, Math.abs(model.y(cur.close) - model.y(cur.open)) + 4)}
                  rx={2}
                  fill={upDownColor}
                  fillOpacity={0.1}
                  stroke={upDownColor}
                  strokeOpacity={0.8}
                  strokeWidth={1}
                />
              )}
              {hoverVisible && renderMode === "line" && (
                <Circle cx={model.x(hoverLocal)} cy={model.y(cur.close)} r={3} fill={col.fib} stroke={col.background} strokeWidth={1} />
              )}
              {hoverVisible && (
                <G>
                  <Rect x={Math.min(Math.max(crossLineX - 34, PAD_L), w - PAD_R - 68)} y={chartH - AXIS_H + 2} width={68} height={15} rx={3} fill={col.popover} />
                  <SvgText
                    x={Math.min(Math.max(crossLineX - 30, PAD_L + 4), w - PAD_R - 64)}
                    y={chartH - AXIS_H + 13}
                    fontSize={9.5}
                    fontWeight="600"
                    fill={col.popoverForeground}
                    fontFamily={MONO}
                  >
                    {fmtTime(cur.time, intervalKey)}
                  </SvgText>
                </G>
              )}
            </Svg>
          </View>
        </GestureDetector>
        {/* 窗口复位（缩放/平移后出现；双击图表等效） */}
        {zoomed && (
          <View style={{ position: "absolute", top: 2, left: 2 }}>
            <Tap
              onPress={() => {
                setView(null)
                hasCrossSV.value = 0
                setSelectedIdx(null)
                crossOpacity.value = withTiming(0, { duration: 80 })
              }}
            >
              ⤢
            </Tap>
          </View>
        )}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  ro: { fontSize: 11, fontFamily: "JetBrainsMono_400Regular" },
})
