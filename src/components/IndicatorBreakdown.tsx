import { memo } from "react"

import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DivergingBar } from "@/components/Gauge"
import { t, tm, useT, type MessageKey } from "@/i18n"
import { SCORE_LEVEL_KEY, verdictOfScore } from "@/lib/coinAnalysis"
import type { Analysis, IndicatorResult } from "@/lib/indicators"
import { cn } from "@/lib/utils"

const kindLabel: Record<IndicatorResult["kind"], MessageKey> = {
  trend: "kind.trend",
  momentum: "kind.momentum",
  sentiment: "kind.sentiment",
  position: "kind.position",
}

/** 指标明细：展示合成信号的完整推导过程 */
export const IndicatorBreakdown = memo(function IndicatorBreakdown({ analysis }: { analysis: Analysis }) {
  useT()
  const wSum = analysis.indicators.reduce((a, i) => a + i.weight, 0)

  return (
    <Card>
      <CardHeader>
        <CardHead title={t("ib.title")} desc={t("ob.formula")}>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            {t("ib.badge", { n: analysis.indicators.length })}
          </Badge>
        </CardHead>
      </CardHeader>

      <CardContent className="space-y-1">
        <div className="hidden grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] items-center gap-4 px-4 pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground lg:grid">
          <span className="text-center">{t("common.col.index")}</span>
          <span>{t("common.col.indicator")}</span>
          <span>{t("common.col.readout")}</span>
          <span>{t("common.col.direction")}</span>
          <span className="text-right">{t("common.col.weight")}</span>
          <span className="text-right">{t("common.col.verdict")}</span>
        </div>

        {analysis.indicators.map((ind, i) => {
          const v = verdictOfScore(ind.score)
          const cls =
            v.tone === "bull"
              ? v.level === "long"
                ? "border-transparent bg-up text-up-foreground"
                : "border-up text-up"
              : v.tone === "bear"
                ? v.level === "short"
                  ? "border-transparent bg-down text-down-foreground"
                  : "border-down text-down"
                : "text-muted-foreground"
          return (
            <div
              key={ind.key}
              className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-lg border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-secondary/40 lg:grid-cols-[24px_minmax(150px,1.2fr)_minmax(110px,0.9fr)_minmax(140px,1.6fr)_72px_80px] lg:gap-4"
            >
              <span className="order-1 hidden font-mono text-xs text-muted-foreground lg:block lg:text-center">
                {String(i + 1).padStart(2, "0")}
              </span>

              <div className="order-1 col-span-2 flex min-w-0 flex-col gap-0.5 lg:order-2 lg:col-span-1">
                <span className="truncate text-sm font-semibold">{tm(ind.name)}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t(kindLabel[ind.kind])}
                </span>
              </div>

              <span className="order-3 font-mono text-sm font-semibold tabular lg:order-3 lg:text-right">
                {tm(ind.display)}
              </span>

              <div className="order-4 col-span-2 flex flex-col gap-1 lg:order-4 lg:col-span-1">
                <DivergingBar score={ind.score} />
                <span className="hidden text-[10px] leading-none text-muted-foreground lg:block">
                  {tm(ind.verdict)}
                </span>
              </div>

              {/* 移动端：读数行 + 判定 */}
              <div className="order-5 flex items-center justify-end gap-2 lg:contents">
                <span className="font-mono text-[10px] text-muted-foreground lg:order-5 lg:text-right lg:text-xs">
                  {((ind.weight / wSum) * 100).toFixed(0)}%
                </span>
                <Badge variant="outline" className={cn("lg:order-6 lg:justify-self-end", cls)}>
                  {t(SCORE_LEVEL_KEY[v.level])}
                </Badge>
              </div>

              <span className="order-6 col-span-2 text-[11px] leading-relaxed text-muted-foreground lg:hidden">
                {tm(ind.verdict)}
              </span>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
})
