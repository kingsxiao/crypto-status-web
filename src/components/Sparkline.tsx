import { memo, useMemo } from "react"

import { cn } from "@/lib/utils"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  strokeWidth?: number
}

/** 单色火花线：白色描线 + 向下渐隐的面积填充 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 120,
  height = 36,
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  const gradientId = useMemo(() => `sg-${Math.random().toString(36).slice(2, 8)}`, [])

  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "" }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const pad = strokeWidth
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = pad + (1 - (v - min) / span) * (height - pad * 2)
      return [x, y] as const
    })
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
    const a = `${d} L${width},${height} L0,${height} Z`
    return { line: d, area: a }
  }, [data, width, height, strokeWidth])

  if (!line) {
    return <div style={{ width, height }} className={cn("rounded bg-secondary", className)} />
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
})
