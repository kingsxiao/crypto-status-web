import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SignalGauge } from "@/components/Gauge"
import { stanceStyle } from "@/components/stance-style"
import type { Verdict } from "@/lib/crossAsset"

/** 每日市场立场：五档判定 + 综合分仪表 + 置信度 + 规则化标题 */
export const VerdictCard = memo(function VerdictCard({ verdict }: { verdict: Verdict }) {
  const style = stanceStyle[verdict.stance]

  return (
    <Card className="relative h-full overflow-hidden border-border/80">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            每日市场立场
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            DAILY VERDICT
          </Badge>
        </div>
        <CardDescription className="text-xs">
          跨资产指标加权合成，五档风险偏好判定 · {verdict.date}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        <SignalGauge score={verdict.composite} size={220} className="text-primary -mt-2" />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-bold tabular tracking-tight">
              {verdict.composite > 0 ? "+" : ""}
              {verdict.composite}
            </span>
          </div>
          <Badge
            variant="outline"
            className={`mt-1 px-3 py-1 text-base font-bold tracking-[0.2em] ${style.cls}`}
          >
            {style.text}
          </Badge>
        </div>

        {/* 置信度：方向一致度 × 综合分强度 */}
        <div className="w-full space-y-1.5">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>置信度 CONFIDENCE</span>
            <span className="font-mono text-xs font-semibold text-foreground">
              {(verdict.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${verdict.confidence * 100}%` }}
            />
          </div>
        </div>

        <Separator className="w-full" />

        <div className="w-full space-y-2">
          <p className="text-left text-sm font-semibold leading-relaxed">{verdict.headline}</p>
          <ul className="space-y-1.5">
            {verdict.themes.map((t) => (
              <li key={t} className="flex gap-2 text-left text-xs leading-relaxed text-muted-foreground">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/70" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
})
