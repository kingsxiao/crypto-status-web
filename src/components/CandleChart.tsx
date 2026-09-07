import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"

import { t, useT } from "@/i18n"
import type { Candle } from "@/lib/kline"
import { bollSeries, kdjSeries, macdSeries, rsiSeries, smaSeries } from "@/lib/ta"

interface Props {
  candles: Candle[]
  renderMode: "candles" | "line"
  overlays: { ma: boolean; boll: boolean }
  panes: { rsi: boolean; macd: boolean; kdj: boolean }
  intervalKey: string
}

/* 涨跌色（功能色，全主题共享）：涨=绿 跌=红 */
const UP = "var(--up)"
const DOWN = "var(--down)"
const UP_TEXT = "var(--up-foreground)"
const DOWN_TEXT = "var(--down-foreground)"
/* 指标线配色：走 chart token 随主题整体切换（mono=琥珀/紫/蓝/青/橙，blue/green=shadcn 官方图表色） */
const LINE1 = "var(--chart-1)" // MA7 / KDJ-K
const LINE2 = "var(--chart-2)" // MA25 / RSI / KDJ-J
const LINE3 = "var(--chart-3)" // MA99 / MACD-DIF / KDJ-D
const LINE4 = "var(--chart-4)" // BOLL 上下轨
const LINE5 = "var(--chart-5)" // BOLL 中轨 / MACD-DEA
const GRID = "var(--border)"
const TEXT_DIM = "var(--muted-foreground)"

const SUB_PANE_H = 96
const PANE_GAP = 10
const PAD_R = 56
const PAD_L = 6
const AXIS_H = 20
const VOL_RATIO = 0.2

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

const fmtTime = (t: number, itv: string) => {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, "0")
  if (itv === "1h" || itv === "4h") return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:00`
  return `${String(d.getFullYear()).slice(2)}/${p(d.getMonth() + 1)}/${p(d.getDate())}`
}

const fmtNum = (v: number) => {
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

interface ChartModel {
  closes: number[]
  ma7: (number | null)[] | null
  ma25: (number | null)[] | null
  ma99: (number | null)[] | null
  boll: { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] } | null
  rsi: (number | null)[] | null
  macd: { dif: (number | null)[]; dea: (number | null)[]; hist: (number | null)[] } | null
  kdj: { k: (number | null)[]; d: (number | null)[]; j: (number | null)[] } | null
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

/**
 * 静态图层：网格 / 蜡烛 / 均线 / 副图 / 时间轴。
 * hover 十字光标移动时这些内容完全不变，抽成 memo 组件后
 * 光标移动只重渲染十字线与读数条，不再 reconcile 上千个 SVG 节点。
 */
const ChartLayers = memo(function ChartLayers({
  candles,
  model,
  renderMode,
  w,
  mainH,
  subPanes,
  chartH,
  intervalKey,
}: {
  candles: Candle[]
  model: ChartModel
  renderMode: "candles" | "line"
  w: number
  mainH: number
  subPanes: SubPane[]
  chartH: number
  intervalKey: string
}) {
  return (
    <>
      {/* 网格与价格轴 */}
      {model.priceTicks.map((t, i) => (
        <g key={i}>
          <line x1={PAD_L} x2={w - PAD_R} y1={model.y(t)} y2={model.y(t)} stroke={GRID} strokeOpacity="0.6" />
          <text x={w - PAD_R + 6} y={model.y(t) + 3.5} fontSize="10" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">
            {fmtNum(t)}
          </text>
        </g>
      ))}

      {/* BOLL 带填充 */}
      {model.boll && (
        <path
          d={
            linePath(model.boll.upper.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const)))) +
            " " +
            linePath(model.boll.lower.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))).reverse()).replace("M", "L")
          }
          fill={LINE4}
          fillOpacity="0.07"
          stroke="none"
        />
      )}

      {/* 成交量：涨绿跌红 */}
      {candles.map((c, i) =>
        c.volume == null ? null : (
          <rect
            key={i}
            x={model.x(i) - model.cw / 2}
            y={model.vy(c.volume)}
            width={model.cw}
            height={Math.max(1, mainH - model.vy(c.volume))}
            fill={c.close >= c.open ? UP : DOWN}
            fillOpacity="0.45"
          />
        )
      )}

      {/* 蜡烛 / 折线 */}
      {renderMode === "candles" ? (
        candles.map((c, i) => {
          const up = c.close >= c.open
          const color = up ? UP : DOWN
          const yO = model.y(c.open)
          const yC = model.y(c.close)
          const top = Math.min(yO, yC)
          const bodyH = Math.max(1, Math.abs(yC - yO))
          return (
            <g key={i}>
              <line x1={model.x(i)} x2={model.x(i)} y1={model.y(c.high)} y2={model.y(c.low)} stroke={color} strokeWidth="1" />
              <rect
                x={model.x(i) - model.cw / 2}
                y={top}
                width={model.cw}
                height={bodyH}
                fill={up ? color : color}
                stroke={color}
                strokeWidth="0.5"
                rx={model.cw > 3 ? 1 : 0}
              />
            </g>
          )
        })
      ) : (
        <path
          d={linePath(candles.map((c, i) => [model.x(i), model.y(c.close)] as const))}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="1.8"
        />
      )}

      {/* MA 叠加 */}
      {model.ma7 && (
        <path d={linePath(model.ma7.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE1} strokeWidth="1.4" />
      )}
      {model.ma25 && (
        <path d={linePath(model.ma25.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE2} strokeWidth="1.4" />
      )}
      {model.ma99 && (
        <path d={linePath(model.ma99.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE3} strokeWidth="1.4" />
      )}

      {/* BOLL 线 */}
      {model.boll && (
        <>
          <path d={linePath(model.boll.mid.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE5} strokeWidth="1" strokeDasharray="4 3" />
          <path d={linePath(model.boll.upper.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE4} strokeWidth="0.9" />
          <path d={linePath(model.boll.lower.map((v, i) => (v == null ? null : ([model.x(i), model.y(v)] as const))))} fill="none" stroke={LINE4} strokeWidth="0.9" />
        </>
      )}

      {/* 最新价虚线 + 涨跌色价签 */}
      <line
        x1={PAD_L}
        x2={w - PAD_R}
        y1={model.y(candles[candles.length - 1].close)}
        y2={model.y(candles[candles.length - 1].close)}
        stroke="var(--foreground)"
        strokeOpacity="0.3"
        strokeDasharray="2 3"
      />
      <rect x={w - PAD_R + 2} y={model.y(candles[candles.length - 1].close) - 8} width={PAD_R - 4} height={16} rx="3" fill={candles[candles.length - 1].close >= candles[candles.length - 1].open ? UP : DOWN} />
      <text x={w - PAD_R + 6} y={model.y(candles[candles.length - 1].close) + 4} fontSize="10" fontWeight="700" fill={candles[candles.length - 1].close >= candles[candles.length - 1].open ? UP_TEXT : DOWN_TEXT} fontFamily="JetBrains Mono, monospace">
        {fmtNum(candles[candles.length - 1].close)}
      </text>

      {/* 副图 */}
      {subPanes.map((pane) => {
        const inner = pane.h - 18
        if (pane.key === "rsi" && model.rsi) {
          const ry = (v: number) => pane.top + 9 + (1 - v / 100) * inner
          return (
            <g key={pane.key}>
              <text x={PAD_L} y={pane.top + 8} fontSize="10" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">{pane.label}</text>
              {[70, 30].map((lv) => (
                <g key={lv}>
                  <line x1={PAD_L} x2={w - PAD_R} y1={ry(lv)} y2={ry(lv)} stroke="var(--border)" strokeDasharray="3 3" />
                  <text x={w - PAD_R + 6} y={ry(lv) + 3} fontSize="9" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">{lv}</text>
                </g>
              ))}
              <line x1={PAD_L} x2={w - PAD_R} y1={ry(50)} y2={ry(50)} stroke={GRID} strokeOpacity="0.6" />
              <path d={linePath(model.rsi.map((v, i) => (v == null ? null : ([model.x(i), ry(v)] as const))))} fill="none" stroke={LINE2} strokeWidth="1.3" />
            </g>
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
            <g key={pane.key}>
              <text x={PAD_L} y={pane.top + 8} fontSize="10" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">{pane.label}</text>
              <line x1={PAD_L} x2={w - PAD_R} y1={my(0)} y2={my(0)} stroke="var(--border)" />
              <text x={w - PAD_R + 6} y={my(0) + 3} fontSize="9" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">0</text>
              {model.macd.hist.map((v, i) =>
                v == null ? null : (
                  <rect key={i} x={model.x(i) - model.cw / 2} y={Math.min(my(v), my(0))} width={model.cw} height={Math.max(1, Math.abs(my(v) - my(0)))} fill={v >= 0 ? UP : DOWN} fillOpacity="0.45" />
                )
              )}
              <path d={linePath(model.macd.dif.map((v, i) => (v == null ? null : ([model.x(i), my(v)] as const))))} fill="none" stroke={LINE3} strokeWidth="1.2" />
              <path d={linePath(model.macd.dea.map((v, i) => (v == null ? null : ([model.x(i), my(v)] as const))))} fill="none" stroke={LINE5} strokeWidth="1.2" />
            </g>
          )
        }
        // KDJ
        if (model.kdj) {
          const ky = (v: number) => pane.top + 9 + (1 - Math.max(0, Math.min(120, v)) / 120) * inner
          return (
            <g key={pane.key}>
              <text x={PAD_L} y={pane.top + 8} fontSize="10" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">{pane.label}</text>
              {[80, 20].map((lv) => (
                <g key={lv}>
                  <line x1={PAD_L} x2={w - PAD_R} y1={ky(lv)} y2={ky(lv)} stroke="var(--border)" strokeDasharray="3 3" />
                  <text x={w - PAD_R + 6} y={ky(lv) + 3} fontSize="9" fill={TEXT_DIM} fontFamily="JetBrains Mono, monospace">{lv}</text>
                </g>
              ))}
              <path d={linePath(model.kdj.k.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={LINE1} strokeWidth="1.2" />
              <path d={linePath(model.kdj.d.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={LINE3} strokeWidth="1.2" />
              <path d={linePath(model.kdj.j.map((v, i) => (v == null ? null : ([model.x(i), ky(v)] as const))))} fill="none" stroke={LINE2} strokeWidth="1" strokeDasharray="3 2" />
            </g>
          )
        }
        return null
      })}

      {/* 时间轴 */}
      {model.timeTicks.map((i) => (
        <text key={i} x={model.x(i)} y={chartH - 5} fontSize="10" fill={TEXT_DIM} textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          {fmtTime(candles[i].time, intervalKey)}
        </text>
      ))}
    </>
  )
})

export const CandleChart = memo(function CandleChart({ candles, renderMode, overlays, panes, intervalKey }: Props) {
  useT()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(860)
  const [hover, setHover] = useState<{ idx: number; x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width > 0) setW(width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 卸载时取消挂起的 rAF
  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
  }, [])

  const mainH = Math.max(280, Math.round(w * 0.36))
  const volH = mainH * VOL_RATIO
  const priceH = mainH - volH - 6

  const model = useMemo<ChartModel | null>(() => {
    if (candles.length < 2) return null
    const closes = candles.map((c) => c.close)
    const highs = candles.map((c) => c.high)
    const lows = candles.map((c) => c.low)

    const ma7 = overlays.ma ? smaSeries(closes, 7) : null
    const ma25 = overlays.ma ? smaSeries(closes, 25) : null
    const ma99 = overlays.ma ? smaSeries(closes, 99) : null
    const boll = overlays.boll ? bollSeries(closes, 20, 2) : null
    const rsi = panes.rsi ? rsiSeries(closes, 14) : null
    const macd = panes.macd ? macdSeries(closes) : null
    const kdj = panes.kdj ? kdjSeries(highs, lows, closes) : null

    let pMin = Infinity
    let pMax = -Infinity
    candles.forEach((c) => {
      pMin = Math.min(pMin, c.low)
      pMax = Math.max(pMax, c.high)
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

    const vMax = Math.max(...candles.map((c) => c.volume ?? 0), 1)

    const innerW = w - PAD_L - PAD_R
    const step = innerW / candles.length
    const cw = Math.max(1, Math.min(14, step * 0.62))
    const x = (i: number) => PAD_L + (i + 0.5) * step
    const y = (v: number) => 6 + (1 - (v - pMin) / (pMax - pMin)) * (priceH - 12)
    const vy = (v: number) => mainH - (v / vMax) * (volH - 4)

    const priceTicks = Array.from({ length: 5 }, (_, i) => pMin + ((pMax - pMin) * i) / 4)

    const timeTickCount = Math.min(7, candles.length)
    const timeTicks = Array.from({ length: timeTickCount }, (_, i) =>
      Math.round((i * (candles.length - 1)) / (timeTickCount - 1))
    ).filter((v, i, a) => a.indexOf(v) === i)

    return {
      closes, ma7, ma25, ma99, boll, rsi, macd, kdj,
      pMin, pMax, vMax, step, cw, x, y, vy, priceTicks, timeTicks,
    }
  }, [candles, overlays, panes, w, priceH, volH, mainH])

  /* 副图布局（只随副图开关变化，与 hover 无关） */
  const { subPanes, chartH } = useMemo(() => {
    const list: SubPane[] = []
    let cursorTop = AXIS_H + mainH + PANE_GAP
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
    return { subPanes: list, chartH: Math.max(cursorTop - PANE_GAP, AXIS_H + mainH) }
  }, [panes, mainH])

  /* 十字光标：rAF 节流，坐标未变时保持原 state 引用跳过重渲染 */
  const onMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!model) return
      const svg = e.currentTarget
      const clientX = e.clientX
      const clientY = e.clientY
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const rect = svg.getBoundingClientRect()
        const px = clientX - rect.left
        const py = clientY - rect.top
        const idx = Math.max(0, Math.min(candles.length - 1, Math.round((px - PAD_L) / model.step - 0.5)))
        const x = model.x(idx)
        setHover((prev) => {
          if (prev && prev.idx === idx && Math.abs(prev.y - py) < 1) return prev
          return { idx, x, y: py }
        })
      })
    },
    [model, candles.length]
  )

  if (!model) {
    return (
      <div ref={wrapRef} className="flex h-72 items-center justify-center text-xs text-muted-foreground">
        {t("candle.insufficient")}
      </div>
    )
  }

  // hover 索引可能越过当前K线边界（切范围/周期后数组变短），统一钳制
  const hoverIdx = hover ? Math.max(0, Math.min(hover.idx, candles.length - 1)) : candles.length - 1
  const cur = candles[hoverIdx]
  const curChange = ((cur.close - cur.open) / cur.open) * 100
  const crossX = hover ? model.x(hoverIdx) : 0

  const seriesAt = (s: (number | null)[] | null) => (s ? s[hoverIdx] : null)

  return (
    <div ref={wrapRef} className="w-full select-none">
      {/* 读数条 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] leading-none">
        <span className="text-muted-foreground">
          {t("candle.open")} <span className={cur.close >= cur.open ? "text-up" : "text-down"}>{fmtNum(cur.open)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("candle.high")} <span className={cur.close >= cur.open ? "text-up" : "text-down"}>{fmtNum(cur.high)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("candle.low")} <span className={cur.close >= cur.open ? "text-up" : "text-down"}>{fmtNum(cur.low)}</span>
        </span>
        <span className="text-muted-foreground">
          {t("candle.close")} <span className={cur.close >= cur.open ? "text-up" : "text-down"}>{fmtNum(cur.close)}</span>
        </span>
        <span className={curChange >= 0 ? "text-up" : "text-down"}>
          {curChange >= 0 ? "+" : ""}
          {curChange.toFixed(2)}%
        </span>
        {cur.volume != null && (
          <span className="text-muted-foreground">
            {t("candle.volume")} <span className="text-foreground">${(cur.volume / 1e6).toFixed(1)}M</span>
          </span>
        )}
        {overlays.ma && (
          <span className="text-muted-foreground">
            MA7<span className="ml-0.5" style={{ color: LINE1 }}>{seriesAt(model.ma7)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5" style={{ color: LINE2 }}>25</span>
            <span style={{ color: LINE2 }}>{seriesAt(model.ma25)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5" style={{ color: LINE3 }}>99</span>
            <span style={{ color: LINE3 }}>{seriesAt(model.ma99)?.toFixed(1) ?? "—"}</span>
          </span>
        )}
        {model.boll && (
          <span className="text-muted-foreground">
            BOLL {t("candle.boll.upper")}<span className="ml-0.5 text-foreground">{seriesAt(model.boll.upper)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5">{t("candle.boll.mid")}</span>
            <span className="text-foreground">{seriesAt(model.boll.mid)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5">{t("candle.boll.lower")}</span>
            <span className="text-foreground">{seriesAt(model.boll.lower)?.toFixed(1) ?? "—"}</span>
          </span>
        )}
        {model.rsi && (
          <span className="text-muted-foreground">
            RSI <span className="text-foreground">{seriesAt(model.rsi)?.toFixed(1) ?? "—"}</span>
          </span>
        )}
        {model.macd && (
          <span className="text-muted-foreground">
            DIF <span className="text-foreground">{seriesAt(model.macd.dif)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5">DEA</span>
            <span className="text-foreground">{seriesAt(model.macd.dea)?.toFixed(1) ?? "—"}</span>
          </span>
        )}
        {model.kdj && (
          <span className="text-muted-foreground">
            K <span className="text-foreground">{seriesAt(model.kdj.k)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5">D</span>
            <span className="text-foreground">{seriesAt(model.kdj.d)?.toFixed(1) ?? "—"}</span>
            <span className="mx-1.5">J</span>
            <span className="text-foreground">{seriesAt(model.kdj.j)?.toFixed(1) ?? "—"}</span>
          </span>
        )}
      </div>

      <svg
        width={w}
        height={chartH}
        className="block cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={t("candle.aria")}
      >
        <ChartLayers
          candles={candles}
          model={model}
          renderMode={renderMode}
          w={w}
          mainH={mainH}
          subPanes={subPanes}
          chartH={chartH}
          intervalKey={intervalKey}
        />

        {/* 十字光标（唯一随 hover 变化的图层） */}
        {hover && (
          <g pointerEvents="none">
            <line x1={crossX} x2={crossX} y1={4} y2={chartH - AXIS_H} stroke="var(--foreground)" strokeOpacity="0.4" strokeDasharray="3 3" />
            <line x1={PAD_L} x2={w - PAD_R} y1={hover.y} y2={hover.y} stroke="var(--foreground)" strokeOpacity="0.3" strokeDasharray="3 3" />
            <rect x={Math.min(Math.max(crossX - 34, PAD_L), w - PAD_R - 68)} y={chartH - AXIS_H + 2} width="68" height="15" rx="3" fill="var(--popover)" />
            <text x={Math.min(Math.max(crossX - 30, PAD_L + 4), w - PAD_R - 64)} y={chartH - AXIS_H + 13} fontSize="9.5" fontWeight="600" fill="var(--popover-foreground)" fontFamily="JetBrains Mono, monospace">
              {fmtTime(cur.time, intervalKey)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
})
