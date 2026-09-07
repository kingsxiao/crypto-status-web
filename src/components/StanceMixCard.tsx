import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CrossIndicator, Verdict } from "@/lib/crossAsset"
import { cn } from "@/lib/utils"

function factionOf(score: number): "bull" | "neutral" | "bear" {
  if (score > 0.2) return "bull"
  if (score < -0.2) return "bear"
  return "neutral"
}

const dotCls: Record<"bull" | "neutral" | "bear", string> = {
  bull: "bg-up",
  neutral: "bg-primary/30",
  bear: "bg-down",
}

/** 立场分布（stance-mix）：全部指标按看多/中性/看空三档归类的占比条 */
export const StanceMixCard = memo(function StanceMixCard({ verdict }: { verdict: Verdict }) {
  const total = verdict.indicators.length
  const groups: { key: "bull" | "neutral" | "bear"; label: string }[] = [
    { key: "bull", label: "看多" },
    { key: "neutral", label: "中性" },
    { key: "bear", label: "看空" },
  ]
  const barCls: Record<"bull" | "neutral" | "bear", string> = {
    bull: "bg-up",
    neutral: "bg-primary/25",
    bear: "bg-down",
  }

  const byFaction = (f: "bull" | "neutral" | "bear"): CrossIndicator[] =>
    verdict.indicators.filter((i) => factionOf(i.score) === f)

  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            立场分布
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            STANCE MIX
          </Badge>
        </div>
        <CardDescription className="text-xs">
          {total} 项跨资产指标按信号方向归类，反映当前多空偏向的结构
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 占比堆叠条 */}
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60">
            {groups.map((g) => {
              const n = verdict.mix[g.key]
              if (!n) return null
              return (
                <div
                  key={g.key}
                  className={cn("h-full transition-all", barCls[g.key])}
                  style={{ width: `${(n / total) * 100}%` }}
                  title={`${g.label} ${n} 项`}
                />
              )
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            {groups.map((g) => (
              <span key={g.key} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", dotCls[g.key])} />
                <span className="font-mono font-semibold">{verdict.mix[g.key]}</span>
                <span className="text-muted-foreground">项{g.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* 分组明细 */}
        <div className="space-y-3">
          {groups.map((g) => {
            const items = byFaction(g.key)
            if (!items.length) return null
            return (
              <div key={g.key} className="space-y-1.5">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                  {g.label} · {items.length}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((i) => (
                    <span
                      key={i.key}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1 text-[11px] font-medium"
                      title={`${i.display} — ${i.verdict}`}
                    >
                      <span className={cn("size-1.5 rounded-full", dotCls[g.key])} />
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
})
