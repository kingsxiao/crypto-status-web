import { memo, useMemo } from "react"

import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { dateLocale, t, useLocale, useT } from "@/i18n"
import type { Analysis } from "@/lib/indicators"
import type { MarketChart as ChartData } from "@/lib/api"
import { formatPrice } from "@/lib/format"

/** BTC 近一年走势 + 200 日均线叠加（黑白双线） */
export const BtcChartCard = memo(function BtcChartCard({
  chart,
  analysis,
}: {
  chart: ChartData
  analysis: Analysis | null
}) {
  useT()
  const { locale } = useLocale()
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

    return { priceLine, area, maSegs, ticks, min, max, x, y, closes }
  }, [chart])

  const tickFmt = useMemo(
    () => new Intl.DateTimeFormat(dateLocale(locale), { month: "short" }),
    [locale],
  )

  const lastClose = model ? model.closes[model.closes.length - 1] : null
  const ma200Now = analysis?.btc.ma200 ?? null

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
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-[240px] w-full"
            preserveAspectRatio="none"
            role="img"
            aria-label={t("btc.aria")}
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

            {/* 价格在线上方区域高亮（牛市区间） */}
            <path d={model.area} fill="url(#btcfill)" />
            {model.maSegs.map((s, i) => (
              <path
                key={i}
                d={s}
                fill="none"
                stroke="var(--chart-5)"
                strokeOpacity="0.85"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
            ))}
            <path
              d={model.priceLine}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2"
              strokeLinejoin="round"
            />

            {/* 末点标记 */}
            <circle
              cx={model.x(model.closes.length - 1)}
              cy={model.y(lastClose!)}
              r="4"
              fill="var(--primary)"
            />

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
        ) : (
          <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
            {t("btc.unavailable")}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
