/**
 * 全站统一的 loading 骨架原语。
 *
 * 设计约定(简约、贴 合真实布局):
 *   - 外壳一律用真实 Card(边框 + 卡片底色),骨架只在卡片内部,避免"悬浮方块"感
 *   - 灰阶层次:标题条 secondary/80 · 正文条 /60 · 装饰条 /40,扫光统一走 .shimmer
 *   - 图表区用"柱状剪影 + 底部基线"占位,柱子错峰扫光形成波浪,比整块闪更安静
 */
import type { CSSProperties } from "react"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

/** 骨架卡片外壳:与真实 Card 同款边框/圆角,children 搭内部结构 */
export function SkeletonCard({
  className,
  children,
  contentClassName,
}: {
  className?: string
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <Card className={cn("h-full", className)}>
      <CardContent className={cn("flex h-full flex-col gap-4 p-6", contentClassName)}>{children}</CardContent>
    </Card>
  )
}

/** 卡片头骨架:小标题条 + 右侧角标条(对应真实卡片的标题 + EN 徽标) */
export function SkHeader({ title = "w-24" }: { title?: string }) {
  return (
    <div className="flex items-center justify-between">
      <Skeleton className={cn("h-3 rounded-full", title)} />
      <Skeleton className="h-2.5 w-14 rounded-full bg-secondary/60" />
    </div>
  )
}

/** 页头骨架:h1 + 副标题 */
export function SkPageHeader({ title = "w-44", desc = "w-72" }: { title?: string; desc?: string }) {
  return (
    <div className="space-y-2.5">
      <Skeleton className={cn("h-6 rounded-lg", title)} />
      <Skeleton className={cn("h-2.5 rounded-full bg-secondary/60", desc)} />
    </div>
  )
}

/** 大数字占位 */
export function SkStat({ className }: { className?: string }) {
  return <Skeleton className={cn("h-9 w-28 rounded-lg", className)} />
}

/**
 * 图表区骨架:底对齐柱状剪影 + 1px 基线模拟坐标轴。
 * 柱高用确定性伪随机,shimmer 按列错峰 → 波浪扫光。
 */
export function ChartSkeleton({
  className,
  bars = 28,
  heights,
}: {
  className?: string
  bars?: number
  /** 0-100 的柱高序列,缺省用确定性伪随机 */
  heights?: number[]
}) {
  const list =
    heights ?? Array.from({ length: bars }, (_, i) => 22 + ((i * 47) % 13) * 4.4)
  return (
    <div className={cn("relative flex w-full items-end gap-[2.5%] pb-4", className)} aria-hidden>
      <span className="absolute inset-x-0 bottom-4 h-px bg-border/70" />
      {list.map((h, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-[3px] bg-secondary/60"
          style={{ height: `${h}%`, "--shimmer-delay": `${i * 45}ms` } as CSSProperties}
        />
      ))}
    </div>
  )
}

/** 迷你柱状组:RegimeCard 牛熊示意 / 情绪卡 30 日剪影等小区域 */
export function SkMiniBars({ count = 9, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex h-16 items-end gap-1.5", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="w-2.5 rounded-sm bg-secondary/60"
          style={{ height: `${30 + ((i * 53) % 70)}%`, "--shimmer-delay": `${i * 60}ms` } as CSSProperties}
        />
      ))}
    </div>
  )
}

/** 进度条骨架:轨道 + 已填充段(对应 Progress 组件) */
export function SkProgress({ fill = "62%", className }: { fill?: string; className?: string }) {
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary/50", className)} aria-hidden>
      <div className="shimmer h-full rounded-full bg-secondary/70" style={{ width: fill }} />
    </div>
  )
}

/**
 * 表格骨架(MarketsPage / CrossAssetTable):
 * 表头小条 + 数据行(头像圆 + 双行文本 + 右侧数字条 + 迷你走势)。
 */
export function TableSkeleton({ rows = 10, showSparkline = false }: { rows?: number; showSparkline?: boolean }) {
  return (
    <div aria-hidden>
      <div className="flex items-center gap-3 border-b pb-2.5">
        <span className="w-1.5 shrink-0" />
        <Skeleton className="h-2 w-5 shrink-0 rounded-full bg-secondary/50" />
        <Skeleton className="h-2 w-12 shrink-0 rounded-full bg-secondary/50" />
        <div className="ml-auto flex items-center gap-6">
          <Skeleton className="h-2 w-10 rounded-full bg-secondary/50" />
          <Skeleton className="h-2 w-8 rounded-full bg-secondary/50" />
          <Skeleton className="h-2 w-10 rounded-full bg-secondary/50" />
          <Skeleton className="hidden h-2 w-12 rounded-full bg-secondary/50 sm:block" />
          <Skeleton className="hidden h-2 w-12 rounded-full bg-secondary/50 md:block" />
        </div>
      </div>
      <div className="divide-y divide-border/50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-14 items-center gap-3">
            <Skeleton className="size-1.5 shrink-0 rounded-full bg-secondary/50" />
            <Skeleton className="h-2 w-5 shrink-0 rounded-full bg-secondary/50" />
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-24 rounded-md" />
              <Skeleton className="h-2 w-10 rounded-full bg-secondary/50" />
            </div>
            <div className="ml-auto flex items-center gap-6">
              <Skeleton className="hidden h-3 w-16 rounded-md sm:block" />
              <Skeleton className="hidden h-2.5 w-10 rounded-full bg-secondary/60 sm:block" />
              <Skeleton className="h-3 w-16 rounded-md" />
              {showSparkline && (
                <SkMiniBars count={7} className="hidden h-8 w-[120px] shrink-0 justify-end gap-1 md:flex" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 统计条骨架:MarketOverview 的 2x2 / 1x4 分格条 */
export function StatStripSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("py-0", className)}>
      <CardContent className="grid grid-cols-2 divide-x md:grid-cols-4 md:py-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col gap-2 px-5 py-5",
              i >= 2 && "border-t md:border-t-0",
              i === 2 && "border-t-0"
            )}
          >
            <Skeleton className="h-2 w-14 rounded-full bg-secondary/50" />
            <Skeleton className="h-5 w-20 rounded-md" />
            <Skeleton className="h-2 w-16 rounded-full bg-secondary/50" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** 区块标签骨架:对应 SectionLabel(等宽小字号 + 右延横线) */
export function SkSectionLabel() {
  return (
    <div className="flex items-center gap-3" aria-hidden>
      <Skeleton className="h-2.5 w-32 rounded-full bg-secondary/50" />
      <div className="h-px flex-1 bg-border/60" />
    </div>
  )
}

/** 轻量加载指示:三点波浪,用于局部/过渡态(全页用骨架屏) */
export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5", className)} role="status" aria-label="加载中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-pulse rounded-full bg-muted-foreground/70"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  )
}
