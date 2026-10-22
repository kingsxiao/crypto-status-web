import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 区块标签（基础层交付）：眉题字阶 + 右延 hairline，页内 section 分组用。
 * 提升自 DashboardPage 本地副本；loading.tsx 的 SkSectionLabel 为其骨架。
 */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="type-kicker shrink-0 text-muted-foreground">{children}</span>
      <div aria-hidden className="h-px min-w-4 flex-1 bg-border/60" />
    </div>
  )
}
