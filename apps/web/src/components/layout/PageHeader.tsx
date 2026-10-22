import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface PageHeaderProps {
  /** 眉题：等宽小字标签，如 "MARKETS" */
  en: string
  /** 页面主标题（中文） */
  title: ReactNode
  /** 副标题：数据说明 / 口径提示 */
  description?: ReactNode
  /** 右侧动作区：筛选、搜索等控件 */
  children?: ReactNode
  className?: string
}

/**
 * 统一页头：眉题(EN) → 主标题 → 副标题，右侧留给动作控件。
 * 全站 6 页共用同一层级节奏，替代各页各写一套的 h1。
 * 入场动效由 App 层 route-fade 承担（契约：入场动效不叠加，这里不挂 fade-up）。
 */
export function PageHeader({ en, title, description, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {/* 眉题走 .type-kicker 字阶，颜色维持 text-primary（刻意保留的全局强调点）；
            tracking utility 叠加恢复既有 0.32em 观感，e2e/h1 结构不动 */}
        <span className="type-kicker inline-flex items-center gap-2 text-primary">
          <span className="tracking-[0.32em]">{en}</span>
          <span aria-hidden className="h-px w-6 bg-primary/40" />
        </span>
        <h1 className="mt-2 text-xl font-bold leading-tight tracking-wide text-balance sm:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
