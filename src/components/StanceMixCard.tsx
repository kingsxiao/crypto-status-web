import { memo } from "react"
import { ChartPie } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { t, tm, useT, type MessageKey } from "@/i18n"
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
  useT()
  const total = verdict.indicators.length
  const groups: { key: "bull" | "neutral" | "bear"; label: MessageKey }[] = [
    { key: "bull", label: "sm.bull" },
    { key: "neutral", label: "sm.neutral" },
    { key: "bear", label: "sm.bear" },
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
        <CardKicker
          icon={ChartPie}
          title={t("sm.title")}
          en="STANCE MIX"
          desc={t("sm.desc", { n: total })}
        />
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
                  title={t("sm.chipTitle", { label: t(g.label), n })}
                />
              )
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            {groups.map((g) => (
              <span key={g.key} className="flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", dotCls[g.key])} />
                <span className="font-mono font-semibold">{verdict.mix[g.key]}</span>
                <span className="text-muted-foreground">{t(g.label)}</span>
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
                  {t(g.label)} · {items.length}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {items.map((i) => (
                    <span
                      key={i.key}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-secondary/40 px-2 py-1 text-[11px] font-medium"
                      title={`${tm(i.display)} — ${tm(i.verdict)}`}
                    >
                      <span className={cn("size-1.5 rounded-full", dotCls[g.key])} />
                      {tm(i.name)}
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
