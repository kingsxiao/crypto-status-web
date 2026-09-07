import { cn } from "@/lib/utils"

/**
 * 半圆多空仪表盘（-100 → +100，红 → 灰 → 绿）。
 * 弧线五段由恐惧红过渡到贪婪绿，指针指向综合分数。
 */
export function SignalGauge({
  score,
  size = 260,
  className,
}: {
  score: number
  size?: number
  className?: string
}) {
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

  // 指针角度：-100 → 180°，+100 → 0°
  const angle = Math.PI * (1 - (clamped + 100) / 200)
  const nx = cx + (r - 22) * Math.cos(angle)
  const ny = cy - (r - 22) * Math.sin(angle)

  return (
    <svg
      viewBox="0 -14 260 168"
      width={size}
      height={(size * 168) / 260}
      className={className}
      role="img"
      aria-label={`综合信号 ${score}`}
    >
      {/* 分段弧：红 → 橙红 → 灰 → 浅绿 → 绿（语义热力色，不随主题变；中性段与刻度用主题 token） */}
      <path d={arc(-100, -60)} stroke="oklch(0.62 0.21 27)" strokeWidth="10" fill="none" strokeLinecap="round" />
      <path d={arc(-57, -20)} stroke="oklch(0.72 0.15 45)" strokeWidth="10" fill="none" />
      <path d={arc(-17, 17)} stroke="var(--muted-foreground)" strokeOpacity="0.5" strokeWidth="10" fill="none" />
      <path d={arc(20, 57)} stroke="oklch(0.77 0.13 145)" strokeWidth="10" fill="none" />
      <path d={arc(60, 100)} stroke="oklch(0.78 0.17 152)" strokeWidth="10" fill="none" strokeLinecap="round" />

      {/* 刻度 */}
      {[-100, -50, 0, 50, 100].map((t) => {
        const a = Math.PI * (1 - (t + 100) / 200)
        const x1 = cx + (r + 8) * Math.cos(a)
        const y1 = cy - (r + 8) * Math.sin(a)
        const x2 = cx + (r + 13) * Math.cos(a)
        const y2 = cy - (r + 13) * Math.sin(a)
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-foreground)" strokeOpacity="0.45" strokeWidth="1.5" />
      })}

      {/* 指针（继承容器文字色，随主题色变化） */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5.5" fill="currentColor" />
      <circle cx={cx} cy={cy} r="10" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1" />

      {/* 端点标签 */}
      <text x={cx - r + 4} y={cy + 30} textAnchor="middle" fontSize="11" fill="oklch(0.68 0.18 27)" fontWeight="600">看空</text>
      <text x={cx} y={cy - r - 26} textAnchor="middle" fontSize="11" fill="var(--muted-foreground)" fontWeight="600">中性</text>
      <text x={cx + r - 4} y={cy + 30} textAnchor="middle" fontSize="11" fill="oklch(0.8 0.16 152)" fontWeight="600">看多</text>
    </svg>
  )
}

/** 发散条：中线为 0，左红（空）右绿（多） */
export function DivergingBar({
  score,
  className,
}: {
  score: number // -2..+2
  className?: string
}) {
  const pct = (Math.max(-2, Math.min(2, score)) / 2) * 50
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-secondary", className)}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={cn(
          "absolute inset-y-0 rounded-full",
          pct >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down"
        )}
        style={{ width: `${Math.abs(pct)}%` }}
      />
    </div>
  )
}
