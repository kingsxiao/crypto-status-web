import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DivergingBar } from "@/components/Gauge"
import type { CrossIndicator, Verdict } from "@/lib/crossAsset"
import { cn } from "@/lib/utils"

function verdictOf(score: number) {
  if (score >= 0.6) return { text: "看多", cls: "border-transparent bg-up text-up-foreground" }
  if (score >= 0.2) return { text: "偏多", cls: "border-up text-up" }
  if (score > -0.2) return { text: "中性", cls: "text-muted-foreground" }
  if (score > -0.6) return { text: "偏空", cls: "border-down text-down" }
  return { text: "看空", cls: "border-transparent bg-down text-down-foreground" }
}

/** 跨资产指标表：读数 / 方向 / 权重 / 判定 / 阈值依据，完整披露推导过程 */
export const CrossAssetTable = memo(function CrossAssetTable({
  verdict,
  missing,
}: {
  verdict: Verdict
  missing: string[]
}) {
  const wSum = verdict.indicators.reduce((a, i) => a + i.weight, 0)
  const domains = [...new Set(verdict.indicators.map((i) => i.domain))]

  const row = (ind: CrossIndicator, i: number) => {
    const v = verdictOf(ind.score)
    return (
      <div
        key={ind.key}
        className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-lg border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-secondary/40 lg:grid-cols-[24px_minmax(140px,1.1fr)_minmax(130px,1fr)_minmax(130px,1.5fr)_64px_72px] lg:gap-4"
      >
        <span className="order-1 hidden font-mono text-xs text-muted-foreground lg:block lg:text-center">
          {String(i + 1).padStart(2, "0")}
        </span>

        <div className="order-1 col-span-2 flex min-w-0 flex-col gap-0.5 lg:order-2 lg:col-span-1">
          <span className="truncate text-sm font-semibold">{ind.name}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {ind.domain}
          </span>
        </div>

        <span className="order-3 font-mono text-sm font-semibold tabular lg:order-3 lg:text-right">
          {ind.display}
        </span>

        <div className="order-4 col-span-2 flex flex-col gap-1 lg:order-4 lg:col-span-1">
          <DivergingBar score={ind.score * 2} />
          <span className="hidden text-[10px] leading-none text-muted-foreground lg:block">
            {ind.verdict}
          </span>
        </div>

        <span className="order-5 hidden text-[10px] leading-relaxed text-muted-foreground lg:block" title={ind.rationale}>
          {ind.rationale}
        </span>

        <div className="order-5 flex items-center justify-end gap-2 lg:contents">
          <span className="font-mono text-[10px] text-muted-foreground lg:text-right lg:text-xs">
            {((ind.weight / wSum) * 100).toFixed(0)}%
          </span>
          <Badge variant="outline" className={cn("lg:justify-self-end", v.cls)}>
            {v.text}
          </Badge>
        </div>

        <span className="order-6 col-span-2 text-[11px] leading-relaxed text-muted-foreground lg:hidden">
          {ind.verdict} · {ind.rationale}
        </span>
      </div>
    )
  }

  let idx = 0

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">跨资产指标明细</CardTitle>
            <CardDescription className="mt-1 text-xs">
              每项指标按公开阈值独立打分（逆向指标反向计分），加权合成市场立场
            </CardDescription>
          </div>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            {verdict.indicators.length} 项 · {domains.join(" / ")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-1">
        <div className="hidden grid-cols-[24px_minmax(140px,1.1fr)_minmax(130px,1fr)_minmax(130px,1.5fr)_64px_72px] items-center gap-4 px-4 pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground lg:grid">
          <span className="text-center">序</span>
          <span>指标</span>
          <span className="text-right">当前读数</span>
          <span>方向（左空右多）</span>
          <span>阈值依据</span>
          <span className="text-right">判定</span>
        </div>

        {domains.map((domain) => (
          <div key={domain} className="space-y-1">
            <div className="flex items-center gap-3 px-4 pt-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {domain}
              </span>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            {verdict.indicators
              .filter((i) => i.domain === domain)
              .map((ind) => row(ind, idx++))}
          </div>
        ))}

        {missing.length > 0 && (
          <p className="px-4 pt-3 text-[11px] leading-relaxed text-muted-foreground">
            未纳入：{missing.join("、")}
            （对应公开数据源当前不可达，恢复后自动加入计算）
          </p>
        )}
      </CardContent>
    </Card>
  )
})
