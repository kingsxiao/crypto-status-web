import { memo, useEffect, useMemo, useRef, useState } from "react"

import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { dateLocale, t } from "@repo/core/i18n"
import { useLocale, useT } from "@repo/react/i18n"
import type { Analysis } from "@repo/core/indicators"
import type { MarketChart as ChartData } from "@repo/data/api"
import { formatPrice } from "@repo/core/format"

/** 悬停/键盘探针：i = 最近数据点索引，fx = 探针横向比例（0-1，用于浮动小签定位） */
interface Probe {
  i: number
  fx: number
}

/** BTC 近一年走势 + 200 日均线叠加（黑白双线）。
 *  签名交互：悬停/方向键出十字线（竖 hairline + 浮动 mono 小签，读日期/价格/MA200）；
 *  挂载时主线 stroke-dashoffset 描线一次（900ms），MA200 虚线与面积随后淡入。 */
export const BtcChartCard = memo(function BtcChartCard({
  chart,
  analysis,
}: {
  chart: ChartData
  analysis: Analysis | null
}) {
  useT()
  const { locale } = useLocale()
  const svgRef = useRef<SVGSVGElement>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  // 探针提交节流（对齐 CandleChart 的 rafRef 模式）：高报率鼠标下一帧最多提交一次
  const rafRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )
  const W = 1000
  const H = 240
  const PAD_T = 16
  const PAD_B = 26
  const PAD_L = 8
  const PAD_R = 8

  const model = useMemo(() => {
    const pts = chart.prices
    if (pts.length < 210) return null

    // 200 日均线序列（从第 200 个点开始有值）
    const closes = pts.map(([, p]) => p)
    const ma200: [number, number | null][] = pts.map(([t], i) => [
      t,
      i >= 199 ? closes.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200 : null,
    ])

    const all = [...closes, ...ma200.map(([, v]) => v ?? Infinity).filter((v) => v !== Infinity)]
    const min = Math.min(...all)
    const max = Math.max(...all)
    const span = max - min || 1

    const x = (i: number) => PAD_L + (i / (pts.length - 1)) * (W - PAD_L - PAD_R)
    const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B)

    const priceLine = closes.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
    const area = `${priceLine} L${x(closes.length - 1).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`

    const maSegs: string[] = []
    let seg = ""
    ma200.forEach(([, v], i) => {
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

    return { priceLine, area, maSegs, ticks, min, max, x, y, closes, maVals: ma200.map(([, v]) => v) }
  }, [chart])

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

  /** 指针横坐标 → 最近数据点索引 + 归一化比例。
   *  rAF 节流：一帧内多次 pointermove 只提交首个（与 CandleChart applyHover 同标准），
   *  避免 120Hz+ 高报率鼠标逐事件触发整组件重渲染 */
  const probeFromClientX = (clientX: number) => {
    if (!svgRef.current || !model) return
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = svgRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const fx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const vx = fx * W
      const last = model.closes.length - 1
      const i = Math.round(((vx - PAD_L) / (W - PAD_L - PAD_R)) * last)
      setProbe({ i: Math.min(last, Math.max(0, i)), fx })
    })
  }

  /** 键盘可达：←/→ 逐点移动探针（未探测时从对应端起步），Esc 收起 */
  const onProbeKey = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (!model) return
    if (e.key === "Escape") {
      setProbe(null)
      return
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
    e.preventDefault()
    const last = model.closes.length - 1
    if (!probe) {
      const i = e.key === "ArrowRight" ? 0 : last
      setProbe({ i, fx: model.x(i) / W })
      return
    }
    const step = e.key === "ArrowRight" ? 1 : -1
    const i = Math.min(last, Math.max(0, probe.i + step))
    setProbe({ i, fx: model.x(i) / W })
  }

  // 图表数据 5s 采样回填会更新 model；探针索引防御性钳位到新序列范围内
  const pi = probe && model ? Math.min(probe.i, model.closes.length - 1) : 0
  const probePrice = model && probe ? model.closes[pi] : null
  const probeMa = model && probe ? model.maVals[pi] : null
  const probeX = model && probe ? model.x(pi) : 0

  return (
    <Card>
      <CardHeader>
        <CardHead
          title={t("btc.title")}
          desc={t("btc.desc")}
        >
          <div className="flex items-center gap-5 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-5 bg-primary" />
              <span className="text-muted-foreground">
                {t("btc.price")} <span className="font-semibold text-foreground">${lastClose ? formatPrice(lastClose) : "—"}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-5 border-t border-dashed" style={{ borderColor: "var(--chart-5)" }} />
              <span className="text-muted-foreground">
                MA200 <span className="font-semibold text-foreground">{ma200Now ? `$${formatPrice(ma200Now)}` : "—"}</span>
              </span>
            </div>
          </div>
        </CardHead>
      </CardHeader>

      <CardContent>
        {model ? (
          <div className="relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="h-[240px] w-full cursor-crosshair"
              preserveAspectRatio="none"
              role="img"
              aria-label={t("btc.aria")}
              tabIndex={0}
              onPointerMove={(e) => probeFromClientX(e.clientX)}
              onPointerLeave={() => {
                if (rafRef.current != null) {
                  cancelAnimationFrame(rafRef.current)
                  rafRef.current = null
                }
                setProbe(null)
              }}
              onKeyDown={onProbeKey}
            >
              <defs>
                <linearGradient id="btcfill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* 水平网格 */}
              {[0.25, 0.5, 0.75].map((t) => (
                <line
                  key={t}
                  x1={PAD_L}
                  x2={W - PAD_R}
                  y1={PAD_T + t * (H - PAD_T - PAD_B)}
                  y2={PAD_T + t * (H - PAD_T - PAD_B)}
                  stroke="currentColor"
                  strokeOpacity="0.08"
                />
              ))}

              {/* 价格在线上方区域高亮（牛市区间）：随描线铺开淡入 */}
              <path d={model.area} fill="url(#btcfill)" className="area-fade" />
              {model.maSegs.map((s, i) => (
                <path
                  key={i}
                  d={s}
                  fill="none"
                  stroke="var(--chart-5)"
                  strokeOpacity="0.85"
                  strokeWidth="1.5"
                  strokeDasharray="6 5"
                  className="ma-fade"
                />
              ))}
              {/* 主线挂载描线一次（900ms，pathLength 归一化）；
                  数据 5s 回填只改 d，元素不重挂则动画不重播 */}
              <path
                d={model.priceLine}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2"
                strokeLinejoin="round"
                pathLength={1}
                className="spark-draw"
              />

              {/* 末点标记：描线收尾时现身 */}
              <circle
                cx={model.x(model.closes.length - 1)}
                cy={model.y(lastClose!)}
                r="4"
                fill="var(--primary)"
                className="dot-fade"
              />

              {/* 十字线探针（悬停/方向键）：竖 hairline + 数据点高亮，
                  随指针直接定位（非逐帧动画）；装饰层，读数由浮动小签呈现 */}
              {probe && (
                <g aria-hidden>
                  <line
                    x1={probeX}
                    x2={probeX}
                    y1={PAD_T}
                    y2={H - PAD_B}
                    stroke="currentColor"
                    strokeOpacity="0.4"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx={probeX} cy={model.y(probePrice!)} r="3.5" fill="var(--primary)" />
                </g>
              )}

              {/* 月份刻度 */}
              {model.ticks.map((tk, i) => (
                <text
                  key={i}
                  x={tk.x}
                  y={H - 6}
                  fontSize="11"
                  fill="currentColor"
                  fillOpacity="0.4"
                  textAnchor="middle"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tickFmt.format(tk.ts)}
                </text>
              ))}
              <text x={PAD_L} y={PAD_T + 4} fontSize="11" fill="currentColor" fillOpacity="0.5" fontFamily="JetBrains Mono, monospace">
                ${formatPrice(model.max)}
              </text>
              <text x={PAD_L} y={H - PAD_B - 2} fontSize="11" fill="currentColor" fillOpacity="0.5" fontFamily="JetBrains Mono, monospace">
                ${formatPrice(model.min)}
              </text>
            </svg>

            {/* 浮动 mono 小签：日期 / 价格 / MA200；左右边界内钳位。
                指针回声层（信息与十字线一致），对读屏隐藏 */}
            {probe && (
              <div
                aria-hidden
                className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-md border border-border/60 bg-popover px-2 py-1 font-mono text-[11px] leading-none whitespace-nowrap text-muted-foreground shadow-[0_8px_24px_-12px_oklch(0_0_0/0.6)]"
                style={{ left: `${Math.min(0.86, Math.max(0.14, probe.fx)) * 100}%` }}
              >
                {probeDateFmt.format(chart.prices[pi][0])}
                <span className="type-num mx-1.5 text-foreground">
                  ${formatPrice(probePrice!)}
                </span>
                MA200{" "}
                <span className="tabular">
                  {probeMa != null ? `$${formatPrice(probeMa)}` : "—"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
            {t("btc.unavailable")}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
