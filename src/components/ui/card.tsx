import * as React from "react"
import type { LucideIcon } from "lucide-react"

import { IconChip } from "@/components/ui/icon-chip"
import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6",
        // 暗色环境下的双层投影：近处 1px 贴合 + 远处柔光把卡片从背景中"托"起来
        "shadow-[0_1px_2px_oklch(0_0_0/0.25),0_16px_36px_-24px_oklch(0_0_0/0.55)]",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-6", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

/**
 * 眉题卡头（KPI / 紧凑卡）：小号大写弱化标题 + 等宽英文角标 + 可选图标芯片。
 * 让大数字/仪表盘等内容当视觉主角，标题只做定位说明。
 */
function CardKicker({
  title,
  en,
  desc,
  icon: Icon,
  className,
}: {
  title: React.ReactNode
  /** 右上角英文角标，如 "COMPOSITE SIGNAL" */
  en?: string
  desc?: React.ReactNode
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon && <IconChip><Icon /></IconChip>}
          <CardTitle className="truncate text-[13px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </CardTitle>
        </div>
        {en && (
          <span className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-muted-foreground/60">
            {en}
          </span>
        )}
      </div>
      {desc && (
        <CardDescription className={cn("text-xs", Icon && "pl-[38px]")}>
          {desc}
        </CardDescription>
      )}
    </div>
  )
}

/**
 * 内容卡头（表格 / 图表 / 说明卡）：15px 主标题 + 描述，右侧留给动作控件或内容徽标。
 */
function CardHead({
  title,
  desc,
  className,
  children,
}: {
  title: React.ReactNode
  desc?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <CardTitle className="text-[15px] font-semibold tracking-tight">{title}</CardTitle>
        {desc && <CardDescription className="mt-1 text-xs">{desc}</CardDescription>}
      </div>
      {children != null && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  CardKicker,
  CardHead,
}
