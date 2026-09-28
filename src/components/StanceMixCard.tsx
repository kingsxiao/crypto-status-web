import { memo, useEffect, useState } from "react"
import { ChartPie } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { t, tm, useT, type MessageKey } from "@/i18n"
import type { CrossIndicator, Verdict } from "@/lib/crossAsset"
import { cn } from "@/lib/utils"

type Faction = "bull" | "neutral" | "bear"

function factionOf(score: number): Faction {
  if (score > 0.2) return "bull"
  if (score < -0.2) return "bear"
  return "neutral"
}

const dotCls: Record<Faction, string> = {
  bull: "bg-up",
  neutral: "bg-primary/30",
  bear: "bg-down",
}

/** 立场分布（stance-mix）：全部指标按看多/中性/看空三档归类的占比条 */
export const StanceMixCard = memo(function StanceMixCard({ verdict }: { verdict: Verdict }) {
  useT()
  const total = verdict.indicators.length
  const groups: { key: Faction; label: MessageKey }[] = [
    { key: "bull", label: "sm.bull" },
    { key: "neutral", label: "sm.neutral" },
    { key: "bear", label: "sm.bear" },
  ]
  const barCls: Record<Faction, string> = {
    bull: "bg-up",
    neutral: "bg-primary/25",
    bear: "bg-down",
  }

  // 堆叠条分段依次生长：首帧 0 宽，挂载后按 0/120/240ms 依次推进到目标宽度
  const [grown, setGrown] = useState(false)
  useEffect(() => {
    setGrown(true)
  }, [])
  // 分段 ↔ 图例双向联动：任一侧 hover 高亮同阵营，其余阵营降透明
  const [hover, setHover] = useState<Faction | null>(null)

  const byFaction = (f: Faction): CrossIndicator[] =>
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
        {/* 占比堆叠条：外层管宽度生长（.w-anim + 依次 delay），内层管联动透明 */}
        <div>
          <div className="flex h-3 w-full overflow-hidden rounded-full border border-border/60">
            {groups.map((g, gi) => {
              const n = verdict.mix[g.key]
              if (!n) return null
              const active = hover === g.key
              return (
                <div
                  key={g.key}
                  className="w-anim h-full"
                  style={{ width: `${grown ? (n / total) * 100 : 0}%`, transitionDelay: `${gi * 120}ms` }}
                  title={t("sm.chipTitle", { label: t(g.label), n })}
                  onMouseEnter={() => setHover(g.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div
                    className={cn(
                      "h-full w-full transition-opacity duration-150",
                      barCls[g.key],
                      hover !== null && !active && "opacity-45",
                    )}
                  />
                </div>
              )
            })}
          </div>
          <div className="mt-2.5 flex items-center justify-between text-xs">
            {groups.map((g) => {
              const active = hover === g.key
              return (
                <span
                  key={g.key}
                  className={cn(
                    "flex items-center gap-1.5 transition-opacity duration-150",
                    hover !== null && !active && "opacity-50",
                  )}
                  onMouseEnter={() => setHover(g.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  <span className={cn("size-2 rounded-full", dotCls[g.key])} />
                  <span className="type-num">{verdict.mix[g.key]}</span>
                  <span className={cn("text-muted-foreground", active && "text-foreground")}>{t(g.label)}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* 分组明细：联动时非当前阵营整组降透明 */}
        <div className="space-y-3">
          {groups.map((g) => {
            const items = byFaction(g.key)
            if (!items.length) return null
            return (
              <div
                key={g.key}
                className={cn(
                  "space-y-1.5 transition-opacity duration-150",
                  hover !== null && hover !== g.key && "opacity-45",
                )}
              >
                <span
                  className={cn(
                    "type-kicker text-muted-foreground",
                    hover === g.key && "text-foreground",
                  )}
                >
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
