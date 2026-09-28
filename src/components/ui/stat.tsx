import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { cn } from "@/lib/utils"

/** 涨跌语气：up/down 只染数字（涨跌色不染容器背景） */
export type StatTone = "up" | "down" | "default"

export interface StatCellProps {
  icon?: LucideIcon
  /** 字段名（走 .type-label，调用处传 t(...)） */
  label: ReactNode
  /** 主读数（.type-num-lg；一切价格/百分比/得分必须 tabular 数字） */
  value: ReactNode
  /** 辅注行（.type-meta：时间 / 来源 / 口径） */
  sub?: ReactNode
  /** 主读数涨跌语气 */
  tone?: StatTone
  /** 辅注涨跌语气（默认 muted） */
  subTone?: StatTone | "muted"
  className?: string
}

function toneClass(tone: StatTone | "muted"): string {
  switch (tone) {
    case "up":
      return "text-up"
    case "down":
      return "text-down"
    case "muted":
      return "text-muted-foreground"
    default:
      return ""
  }
}

/**
 * 统计条分格单元（基础层交付）：icon + label + value + sub。
 * 收编 MarketOverview / Portfolio KPI / Settings 概览三处手写分格，
 * 单独使用时注意外层自行补分格线。
 */
export function StatCell({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
  subTone = "muted",
  className,
}: StatCellProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 px-5 py-5", className)}>
      <div className="flex min-w-0 items-center gap-2">
        {Icon && (
          <IconChip>
            <Icon strokeWidth={2} />
          </IconChip>
        )}
        <span className="type-label truncate text-muted-foreground">{label}</span>
      </div>
      <div className={cn("type-num-lg break-all", toneClass(tone))}>{value}</div>
      {sub != null && <div className={cn("type-meta", subTone !== "muted" && toneClass(subTone))}>{sub}</div>}
    </div>
  )
}

export type StatItem = Omit<StatCellProps, "className">

/**
 * 统计条（基础层交付）：2×2（移动端）→ 4 分格（md+）+ hairline 分隔，
 * 与 loading.tsx 的 StatStripSkeleton 一一对应（真实外壳 + 内部分格）。
 *
 * ```tsx
 * <StatStrip
 *   items={[
 *     { icon: Coins, label: t("pf.kpi.total"), value: "$1,234", sub: t("pf.kpi.totalSub", { n: 3 }) },
 *     { icon: TrendingUp, label: "24H", value: "+1.2%", tone: "up", subTone: "up" },
 *   ]}
 * />
 * ```
 */
export function StatStrip({ items, className }: { items: StatItem[]; className?: string }) {
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="grid grid-cols-2 px-0 md:grid-cols-4 md:divide-x md:divide-border/60 md:py-0">
        {items.map((it, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col",
              // 移动端 2×2 手动补分隔线（md 起由 divide-x 接管）
              i % 2 === 1 && "border-l border-border/60 md:border-l-0",
              i >= 2 && "border-t border-border/60 md:border-t-0"
            )}
          >
            <StatCell {...it} className="h-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
