import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 键帽（基础层交付）：mono 10px、hairline 边、bg-secondary 底。
 * 用于快捷键提示（如行情页「/」聚焦搜索、币种页图表快捷键 M/B/F/R/K）。
 */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "type-label inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-secondary px-1.5 text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  )
}
