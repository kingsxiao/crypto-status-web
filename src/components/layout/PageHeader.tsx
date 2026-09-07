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
 */
export function PageHeader({ en, title, description, children, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "fade-up flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <span className="inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.32em] text-primary">
          {en}
          <span aria-hidden className="h-px w-6 bg-primary/40" />
        </span>
        <h1 className="mt-1.5 text-xl font-bold tracking-wide text-balance">{title}</h1>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}
