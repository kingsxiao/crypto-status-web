import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * 图标芯片：给线性图标一个统一的容器（尺寸/圆角/底色/描边一次定义）。
 * 内部 svg 强制 14px，保证全站图标大小一致。
 */
export function IconChip({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-secondary/50 text-muted-foreground [&_svg]:size-3.5",
        className
      )}
    >
      {children}
    </span>
  )
}
