import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { DivergingBar } from "@/components/Gauge"
import { joinList, t, tm, useT } from "@/i18n"
import { DOMAIN_KEY, type CrossIndicator, type Verdict } from "@/lib/crossAsset"
import { SCORE_LEVEL_KEY, verdictOfScore } from "@/lib/coinAnalysis"

/** 跨资产指标表：读数 / 方向 / 权重 / 判定 / 阈值依据，完整披露推导过程 */
export const CrossAssetTable = memo(function CrossAssetTable({
  verdict,
  missing,
}: {
  verdict: Verdict
  missing: string[]
}) {
  useT()
  const wSum = verdict.indicators.reduce((a, i) => a + i.weight, 0)
  const domains = [...new Set(verdict.indicators.map((i) => i.domain))]

  const row = (ind: CrossIndicator, i: number) => {
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
        className="grid grid-cols-2 items-center gap-x-4 gap-y-2 rounded-lg border border-transparent px-4 py-3.5 transition-colors hover:border-border hover:bg-secondary/40 lg:grid-cols-[28px_minmax(190px,1.1fr)_minmax(120px,0.9fr)_minmax(140px,1fr)_minmax(200px,1.6fr)_minmax(96px,0.6fr)] lg:gap-4"
      >
        <span className="order-1 hidden font-mono text-xs text-muted-foreground lg:block lg:text-center">
          {String(i + 1).padStart(2, "0")}
        </span>

        <div className="order-1 col-span-2 flex min-w-0 flex-col gap-0.5 lg:order-2 lg:col-span-1">
          <span className="truncate text-sm font-semibold" title={tm(ind.name)}>{tm(ind.name)}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t(DOMAIN_KEY[ind.domain])}
          </span>
        </div>

        <span className="order-3 font-mono text-sm font-semibold tabular lg:order-3 lg:text-right">
          {tm(ind.display)}
        </span>

        <div className="order-4 col-span-2 flex flex-col gap-1 lg:order-4 lg:col-span-1">
          <DivergingBar score={ind.score * 2} />
          <span className="hidden text-[10px] leading-none text-muted-foreground lg:block">
            {tm(ind.verdict)}
          </span>
        </div>

        <span className="order-5 hidden text-[10px] leading-relaxed text-muted-foreground lg:block" title={tm(ind.rationale)}>
          {tm(ind.rationale)}
        </span>

        {/* 权重 + 判定：移动端与读数同行，桌面端独占末列（保持 6 项对齐 6 轨，避免 contents 破坏列序） */}
        <div className="order-3 flex items-center justify-end gap-2 lg:order-6">
          <span className="font-mono text-[10px] text-muted-foreground lg:text-right lg:text-xs">
            {((ind.weight / wSum) * 100).toFixed(0)}%
          </span>
          <Badge variant="outline" className={cls}>
            {t(SCORE_LEVEL_KEY[v.level])}
          </Badge>
        </div>

        <span className="order-6 col-span-2 text-[11px] leading-relaxed text-muted-foreground lg:hidden">
          {tm(ind.verdict)} · {tm(ind.rationale)}
        </span>
      </div>
    )
  }

  let idx = 0

  return (
    <Card>
      <CardHeader>
        <CardHead title={t("cat.title")} desc={t("cat.desc")}>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            {t("cat.badge", { n: verdict.indicators.length, domains: joinList(domains.map((d) => t(DOMAIN_KEY[d]))) })}
          </Badge>
        </CardHead>
      </CardHeader>

      <CardContent className="space-y-1">
        <div className="hidden grid-cols-[28px_minmax(190px,1.1fr)_minmax(120px,0.9fr)_minmax(140px,1fr)_minmax(200px,1.6fr)_minmax(96px,0.6fr)] items-center gap-4 px-4 pb-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground lg:grid">
          <span className="text-center">{t("common.col.index")}</span>
          <span>{t("common.col.indicator")}</span>
          <span className="text-right">{t("common.col.readout")}</span>
          <span>{t("common.col.direction")}</span>
          <span>{t("cat.col.rationale")}</span>
          <span className="text-right">{t("common.col.verdict")}</span>
        </div>

        {domains.map((domain) => (
          <div key={domain} className="space-y-1">
            <div className="flex items-center gap-3 px-4 pt-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {t(DOMAIN_KEY[domain])}
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
            {t("cat.missing", { list: joinList(missing) })}
          </p>
        )}
      </CardContent>
    </Card>
  )
})
