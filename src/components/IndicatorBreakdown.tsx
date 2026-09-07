import { memo } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DivergingBar } from "@/components/Gauge"
import type { Analysis, IndicatorResult } from "@/lib/indicators"
import { cn } from "@/lib/utils"

const kindLabel: Record<IndicatorResult["kind"], string> = {
  trend: "趋势",
  momentum: "动能",
  sentiment: "情绪 · 逆向",
  position: "周期位置",
}

function verdictOf(score: number) {
  if (score >= 1.2) return { text: "看多", cls: "border-transparent bg-up text-up-foreground" }
  if (score >= 0.25) return { text: "偏多", cls: "border-up text-up" }
  if (score > -0.25) return { text: "中性", cls: "text-muted-foreground" }
  if (score > -1.2) return { text: "偏空", cls: "border-down text-down" }
  return { text: "看空", cls: "border-transparent bg-down text-down-foreground" }
}

/** 指标明细：展示合成信号的完整推导过程 */
export const IndicatorBreakdown = memo(function IndicatorBreakdown({ analysis }: { analysis: Analysis }) {
  const wSum = analysis.indicators.reduce((a, i) => a + i.weight, 0)

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">指标明细</CardTitle>
            <CardDescription className="mt-1 text-xs">
              综合分 = Σ(指标分 × 权重) ÷ 总权重，归一至 ±100
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            {analysis.indicators.length} 项指标 · BTC 主导
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1">
        <div className="hidden grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] items-center gap-4 px-4 pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground lg:grid">
          <span className="text-center">序</span>
          <span>指标</span>
          <span>当前读数</span>
          <span>方向（左空右多）</span>
          <span className="text-right">权重</span>
          <span className="text-right">判定</span>
        </div>

        {analysis.indicators.map((ind, i) => {
          const v = verdictOf(ind.score)
          return (
            <div
              key={ind.key}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-lg border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-secondary/40 lg:grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] lg:gap-4"
            >
              <span className="order-1 hidden font-mono text-xs text-muted-foreground lg:block lg:text-center">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="order-1 col-span-2 flex min-w-0 flex-col gap-0.5 lg:order-2 lg:col-span-1">
                <span className="truncate text-sm font-semibold">{ind.name}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {kindLabel[ind.kind]}
                </span>
              </div>

              <span className="order-3 font-mono text-sm font-semibold tabular lg:order-3 lg:text-right">
                {ind.display}
              </span>

              <div className="order-4 col-span-2 flex flex-col gap-1 lg:order-4 lg:col-span-1">
                <DivergingBar score={ind.score} />
                <span className="hidden text-[10px] leading-none text-muted-foreground lg:block">
                  {ind.verdict}
                </span>
              </div>

              {/* 移动端：读数行 + 判定 */}
              <div className="order-5 flex items-center justify-end gap-2 lg:contents">
                <span className="font-mono text-[10px] text-muted-foreground lg:order-5 lg:text-right lg:text-xs">
                  {((ind.weight / wSum) * 100).toFixed(0)}%
                </span>
                <Badge variant="outline" className={cn("lg:order-6 lg:justify-self-end", v.cls)}>
                  {v.text}
                </Badge>
              </div>

              <span className="order-6 col-span-2 text-[11px] leading-relaxed text-muted-foreground lg:hidden">
                {ind.verdict}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
})
