import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface SegmentedProps<T extends string> {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
  /** 组名（无视觉呈现，供屏幕阅读器） */
  label: string
  className?: string
}

/**
 * 分段单选控件：视觉与 Tabs 一致，语义为按钮组（互斥筛选）。
 * 这些场景没有对应的 Tab 面板，用 Radix Tabs 会产生指向不存在
 * 内容的 aria-controls；aria-pressed 按钮组语义正确且无需键盘方向键协议。
 */
export function Segmented<T extends string>({ value, onChange, items, label, className }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="segmented"
      className={cn("bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]", className)}
    >
      {items.map((it) => {
        const active = it.value === value
        return (
          <button
            key={it.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.value)}
            className={cn(
              "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1",
              active
                ? "bg-background text-primary shadow-xs"
                : "hover:text-foreground"
            )}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}
