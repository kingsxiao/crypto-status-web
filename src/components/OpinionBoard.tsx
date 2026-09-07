/**
 * 通用多空观点看板 — 综合分汇总 + 逐指标观点行。
 * 供币种详情页（coinAnalysis 八指标）与情绪页（多维聚合）共用。
 */

import { DivergingBar } from "@/components/Gauge"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { verdictOfScore, type CoinAnalysis } from "@/lib/coinAnalysis"
import type { IndicatorResult } from "@/lib/indicators"
import { cn } from "@/lib/utils"

const kindLabel: Record<IndicatorResult["kind"], string> = {
  trend: "趋势",
  momentum: "动能",
  sentiment: "情绪 · 逆向",
  position: "周期位置",
}

const verdictBadge = (score: number) => {
  const v = verdictOfScore(score)
  const cls =
    v.tone === "bull"
      ? v.text === "看多"
        ? "border-transparent bg-up text-up-foreground"
        : "border-up text-up"
      : v.tone === "bear"
        ? v.text === "看空"
          ? "border-transparent bg-down text-down-foreground"
          : "border-down text-down"
        : "text-muted-foreground"
  return { text: v.text, cls }
}

/** 综合分横条：中线 0，左空右多，-100 ~ +100 */
export function CompositeBar({ composite, className }: { composite: number; className?: string }) {
  const clamped = Math.max(-100, Math.min(100, composite))
  const pct = (Math.abs(clamped) / 100) * 50
  return (
    <div className={cn("relative h-2.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
      <div
        className={cn(
          "absolute inset-y-0 rounded-full transition-[width] duration-700",
          clamped >= 0 ? "left-1/2 bg-up" : "right-1/2 bg-down"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** 单指标观点行（宽容器表格风 / 窄容器堆叠；按容器宽度而非视口切换，避免嵌入 1/3 宽卡片时溢出） */
export function OpinionRow({ ind, index, wSum }: { ind: IndicatorResult; index: number; wSum: number }) {
  const v = verdictBadge(ind.score)
  return (
    <div
      className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-lg border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-secondary/40 @2xl:grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] @2xl:gap-4"
    >
      <span className="order-1 hidden font-mono text-xs text-muted-foreground @2xl:block @2xl:text-center">
        {String(index + 1).padStart(2, "0")}
      </span>

      <div className="order-1 col-span-2 flex min-w-0 flex-col gap-0.5 @2xl:order-2 @2xl:col-span-1">
        <span className="truncate text-sm font-semibold">{ind.name}</span>
        <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{kindLabel[ind.kind]}</span>
      </div>

      <span className="order-3 font-mono text-sm font-semibold tabular @2xl:order-3 @2xl:text-right">{ind.display}</span>

      <div className="order-4 col-span-2 flex flex-col gap-1 @2xl:order-4 @2xl:col-span-1">
        <DivergingBar score={ind.score} />
        <span className="hidden text-[10px] leading-none text-muted-foreground @2xl:block">{ind.verdict}</span>
      </div>

      <div className="order-5 flex items-center justify-end gap-2 @2xl:contents">
        <span className="font-mono text-[10px] text-muted-foreground @2xl:text-right @2xl:text-xs">
          {((ind.weight / wSum) * 100).toFixed(0)}%
        </span>
        <Badge variant="outline" className={cn("@2xl:justify-self-end", v.cls)}>
          {v.text}
        </Badge>
      </div>

      <span className="order-6 col-span-2 text-[11px] leading-relaxed text-muted-foreground @2xl:hidden">{ind.verdict}</span>
    </div>
  )
}

/** 汇总头：综合分 + 横条 + 结论 + 多空计数 */
export function OpinionSummary({
  composite,
  label,
  counts,
  note,
  compact,
}: {
  composite: number
  label: string
  counts?: { bull: number; bear: number; neutral: number }
  note?: string | null
  compact?: boolean
}) {
  return (
    <div className={cn("space-y-3", compact ? "px-4 pb-1" : "rounded-lg bg-secondary/50 p-4 sm:p-5")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-3">
          <span className="font-mono text-4xl leading-none font-bold tabular sm:text-5xl">
            {composite > 0 ? "+" : ""}
            {composite}
          </span>
          <div className="flex flex-col gap-1 pb-0.5">
            <span className="text-base font-semibold">{label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">/ ±100 综合分</span>
          </div>
        </div>
        {counts && (
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-up">看多 {counts.bull}</span>
            <span className="text-muted-foreground">中性 {counts.neutral}</span>
            <span className="text-down">看空 {counts.bear}</span>
          </div>
        )}
      </div>
      <CompositeBar composite={composite} />
      <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
        <span>-100 看空</span>
        <span>0 中性</span>
        <span>+100 看多</span>
      </div>
      {note && <p className="text-[10px] text-muted-foreground">{note}</p>}
    </div>
  )
}

/** 完整观点看板卡片 */
export function OpinionBoard({
  analysis,
  title,
  description,
  badge,
}: {
  analysis: CoinAnalysis
  title?: string
  description?: string
  badge?: string
}) {
  const wSum = analysis.indicators.reduce((a, i) => a + i.weight, 0)
  return (
    <Card className="fade-up">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title ?? "多空观点"}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {description ?? "综合分 = Σ(指标分 × 权重) ÷ 总权重，归一至 ±100"}
            </CardDescription>
          </div>
          {badge && (
            <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
              {badge}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="@container space-y-2">
        <OpinionSummary
          composite={analysis.composite}
          label={analysis.verdict.label}
          counts={analysis.counts}
          note={analysis.note}
        />
        <div className="hidden grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] items-center gap-4 px-4 pb-1 text-[10px] font-medium tracking-widest text-muted-foreground uppercase @2xl:grid">
          <span className="text-center">序</span>
          <span>指标</span>
          <span className="text-right">当前读数</span>
          <span>方向（左空右多）</span>
          <span className="text-right">权重</span>
          <span className="text-right">判定</span>
        </div>
        {analysis.indicators.map((ind, i) => (
          <OpinionRow key={ind.key} ind={ind} index={i} wSum={wSum} />
        ))}
      </CardContent>
    </Card>
  )
}
