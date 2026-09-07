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
import type { Analysis } from "@/lib/indicators"

export const SignalCard = memo(function SignalCard({ analysis }: { analysis: Analysis }) {
  const { composite, signal, indicators } = analysis
  const bulls = indicators.filter((i) => i.score > 0.25).length
  const bears = indicators.filter((i) => i.score < -0.25).length
  const neutrals = indicators.length - bulls - bears

  const verdictStyle: Record<Analysis["signal"]["level"], string> = {
    "strong-long":
      "border-transparent bg-up text-up-foreground",
    long: "border-up text-up",
    neutral: "text-muted-foreground",
    short: "border-down text-down",
    "strong-short":
      "border-transparent bg-down text-down-foreground",
  }

  return (
    <Card className="relative h-full overflow-hidden border-border/80">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
            综合多空信号
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            COMPOSITE SIGNAL
          </Badge>
        </div>
        <CardDescription className="text-xs">
          由 7 项指标加权合成，区间 −100 ～ +100
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        <SignalGauge score={composite} className="text-primary -mt-1" />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-4xl font-bold tabular tracking-tight">
              {composite > 0 ? "+" : ""}
              {composite}
            </span>
          </div>
          <Badge
            variant="outline"
            className={`mt-1 px-3 py-1 text-base font-bold tracking-[0.2em] ${verdictStyle[signal.level]}`}
          >
            {signal.label}
          </Badge>
        </div>

        <Separator className="w-full" />

        <div className="flex w-full items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-up" />
            <span className="font-mono font-semibold">{bulls}</span>
            <span className="text-muted-foreground">项看多</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-primary/30" />
            <span className="font-mono font-semibold">{neutrals}</span>
            <span className="text-muted-foreground">项中性</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-down" />
            <span className="font-mono font-semibold">{bears}</span>
            <span className="text-muted-foreground">项看空</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
})
