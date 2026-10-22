import { memo, type CSSProperties } from "react"
import { Activity } from "lucide-react"

import { AnimatedNumber } from "@/components/ui/animated-number"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SignalGauge } from "@/components/Gauge"
import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { VERDICT_LEVEL_KEY } from "@repo/core/coinAnalysis"
import type { Analysis } from "@repo/core/indicators"

export const SignalCard = memo(function SignalCard({ analysis }: { analysis: Analysis }) {
  useT()
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
        <CardKicker
          icon={Activity}
          title={t("sig.title")}
          en="COMPOSITE SIGNAL"
          desc={t("sig.desc")}
        />
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        {/* 挂载编排：指针由 0 摆到综合分（Gauge 内建 450ms 过渡），
            综合分同步 num-rise 入场，其后的实时重算走涨跌方向动效 */}
        <SignalGauge score={composite} className="text-primary -mt-1" />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2">
            <AnimatedNumber
              value={composite}
              animateOnMount
              format={(v) => `${v > 0 ? "+" : ""}${v}`}
              className="type-num-xl"
            />
          </div>
          <Badge
            variant="outline"
            className={`mt-1 px-3 py-1 text-base font-bold tracking-[0.2em] ${verdictStyle[signal.level]}`}
          >
            {t(VERDICT_LEVEL_KEY[signal.level])}
          </Badge>
        </div>

        <Separator className="w-full" />

        <div className="flex w-full items-center justify-between text-xs">
          {/* 三档计数 pop 入场：多/中性/空依序弹出（240ms 起步，60ms/步，
              等指针与读数先落位；.count-pop 见 pages/dashboard.css） */}
          {(
            [
              { n: bulls, cls: "bg-up", key: "sig.count.bull" as const },
              { n: neutrals, cls: "bg-primary/30", key: "sig.count.neutral" as const },
              { n: bears, cls: "bg-down", key: "sig.count.bear" as const },
            ]
          ).map((it, i) => (
            <span
              key={it.key}
              className="count-pop flex items-center gap-1.5"
              style={{ "--pop-delay": "240ms", "--i": i } as CSSProperties}
            >
              <span className={`size-2 rounded-full ${it.cls}`} />
              <span className="type-num">{it.n}</span>
              <span className="text-muted-foreground">{t(it.key)}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  )
})
