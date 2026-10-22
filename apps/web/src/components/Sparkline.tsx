import { memo, useMemo } from "react"

import { cn } from "@/lib/utils"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  className?: string
  strokeWidth?: number
  /** 端点圆点（最新值标记，opt-in 默认关）。常渲染、由行容器 group-hover 点亮
   *  （纯 CSS 联动：行级 hover state 会让整页表格逐行全量重渲染） */
  showDot?: boolean
  /** 描线进场：stroke-dasharray + pathLength 归一化，900ms 一次性（opt-in 默认关）。
   *  数据后续刷新不会重播（元素不重挂则 animation 不重启） */
  animateDraw?: boolean
}

/** 单色火花线：白色描线 + 向下渐隐的面积填充 */
export const Sparkline = memo(function Sparkline({
  data,
  width = 120,
  height = 36,
  className,
  strokeWidth = 1.5,
  showDot = false,
  animateDraw = false,
}: SparklineProps) {
  const gradientId = useMemo(() => `sg-${Math.random().toString(36).slice(2, 8)}`, [])

  const { line, area, lastX, lastY } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "", lastX: 0, lastY: 0 }
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
    const [lx, ly] = pts[pts.length - 1]
    return { line: d, area: a, lastX: lx, lastY: ly }
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
        pathLength={animateDraw ? 1 : undefined}
        className={animateDraw ? "spark-draw" : undefined}
      />
      {showDot && (
        <g className="opacity-0 transition-opacity duration-[160ms] [transition-timing-function:var(--ease-soft)] group-hover:opacity-100">
          {/* 端点光晕：颜色取自主题 token 层，不引入新色相 */}
          <circle cx={lastX} cy={lastY} r={strokeWidth * 2.6} fill="currentColor" opacity={0.18} />
          <circle cx={lastX} cy={lastY} r={strokeWidth} fill="currentColor" />
        </g>
      )}
    </svg>
  )
})
