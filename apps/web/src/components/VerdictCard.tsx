import { memo, useEffect, useState } from "react"
import { Scale } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { SignalGauge } from "@/components/Gauge"
import { stanceStyle } from "@/components/stance-style"
import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { headlineText, themeText, type Verdict } from "@repo/core/crossAsset"

/** 每日市场立场：五档判定 + 综合分仪表 + 置信度 + 规则化标题 */
export const VerdictCard = memo(function VerdictCard({ verdict }: { verdict: Verdict }) {
  useT()
  const style = stanceStyle[verdict.stance]
  // 置信度条挂载生长：首帧 0 宽 → 目标宽（.w-anim 700ms；reduced-motion 由全局 kill 即时终态）
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(true)
  }, [])

  return (
    <Card className="relative h-full overflow-hidden border-border/80">
      <CardHeader className="pb-0">
        <CardKicker
          icon={Scale}
          title={t("vc.title")}
          en="DAILY VERDICT"
          desc={t("vc.desc", { date: verdict.date })}
        />
      </CardHeader>

      <CardContent className="flex flex-col items-center gap-4">
        <SignalGauge score={verdict.composite} size={220} className="text-primary -mt-2" />

        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-baseline gap-2">
            <AnimatedNumber
              className="type-num-xl"
              value={verdict.composite}
              format={(v) => `${v > 0 ? "+" : ""}${v}`}
            />
          </div>
          <Badge
            variant="outline"
            className={`mt-1 px-3 py-1 text-base font-bold tracking-[0.2em] ${style.cls}`}
          >
            {style.text()}
          </Badge>
        </div>

        {/* 置信度：方向一致度 × 综合分强度 */}
        <div className="w-full space-y-1.5">
          <div className="type-label flex items-center justify-between text-muted-foreground">
            <span>{t("vc.confidence")}</span>
            <span className="type-num text-xs text-foreground">
              {(verdict.confidence * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="w-anim h-full rounded-full bg-primary"
              style={{ width: grown ? `${verdict.confidence * 100}%` : "0%" }}
            />
          </div>
        </div>

        <Separator className="w-full" />

        <div className="w-full space-y-2">
          <p className="type-body text-left font-semibold leading-relaxed">{headlineText(verdict.headline)}</p>
          <ul className="space-y-1.5">
            {verdict.themes.map((th, i) => (
              <li key={i} className="flex gap-2 text-left text-xs leading-relaxed text-muted-foreground">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-primary/70" />
                {themeText(th)}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
})
