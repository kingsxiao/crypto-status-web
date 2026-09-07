import { useMemo } from "react"
import { Link } from "react-router-dom"

import { CompositeBar, OpinionRow, OpinionSummary } from "@/components/OpinionBoard"
import { PageHeader } from "@/components/layout/PageHeader"
import { ChartSkeleton, SkeletonCard, SkHeader, SkPageHeader } from "@/components/loading"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { usePageMeta } from "@/hooks/usePageMeta"
import { STABLECOIN_IDS } from "@/lib/api"
import { compositeOf, verdictOfComposite, verdictOfScore } from "@/lib/coinAnalysis"
import { FNG_GRADIENT, fngShade, fngZh } from "@/lib/fng"
import { clamp, scoreSentiment, type IndicatorResult } from "@/lib/indicators"
import { cn } from "@/lib/utils"

function fmtDate(tsSec: number): string {
  return new Date(tsSec * 1000).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })
}

export function SentimentPage() {
  usePageMeta({ title: "市场情绪 · CRYPTO STATUS" })
  const { snapshot, loading, analysis } = useMarket()
  const tickers = useLive()
  const fng = useMemo(() => snapshot?.fng ?? [], [snapshot])
  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  const history = useMemo(() => [...fng].reverse(), [fng]) // 升序，末尾为今天

  const stats = useMemo(() => {
    if (!fng.length) return null
    const at = (d: number) => fng[Math.min(d, fng.length - 1)]
    const values = fng.map((e) => e.value)
    return {
      now: at(0),
      yesterday: at(1),
      weekAgo: at(7),
      monthAgo: at(30),
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    }
  }, [fng])

  // 30 日各情绪区间天数分布
  const dist = useMemo(() => {
    const buckets = [
      { key: "Extreme Fear", label: "极度恐惧", range: [0, 24] as const },
      { key: "Fear", label: "恐惧", range: [25, 44] as const },
      { key: "Neutral", label: "中性", range: [45, 55] as const },
      { key: "Greed", label: "贪婪", range: [56, 75] as const },
      { key: "Extreme Greed", label: "极度贪婪", range: [76, 100] as const },
    ]
    return buckets.map((b) => ({
      ...b,
      days: fng.filter((e) => e.value >= b.range[0] && e.value <= b.range[1]).length,
    }))
  }, [fng])

  /* -------- 多空情绪总览：技术面 / 情绪面 / 市场广度 三维综合 -------- */
  const synthesis = useMemo(() => {
    // 1) 技术面：BTC 日线指标（复用总览页信号引擎，剔除情绪项避免重复计数）
    const tech = analysis?.indicators.filter((i) => i.kind !== "sentiment") ?? []
    const techComp = compositeOf(tech)

    // 2) 情绪面：恐惧贪婪逆向 + 情绪周变化顺势
    const sent: IndicatorResult[] = []
    if (stats) {
      sent.push({
        key: "fng-contrarian",
        name: "恐惧贪婪指数（逆向）",
        display: `${stats.now.value} · ${fngZh(stats.now.classification)}`,
        score: scoreSentiment(stats.now.value),
        weight: 60,
        verdict:
          stats.now.value <= 25 ? "极度恐惧，历史上往往是布局区间（逆向加分）"
          : stats.now.value <= 45 ? "情绪偏恐惧，逆向视角偏积极"
          : stats.now.value < 55 ? "情绪中性"
          : stats.now.value < 75 ? "情绪偏贪婪，警惕过热"
          : "极度贪婪，历史上往往是风险区间（逆向减分）",
        kind: "sentiment",
      })
      const wd = stats.now.value - stats.weekAgo.value
      sent.push({
        key: "fng-momentum",
        name: "情绪周变化（顺势）",
        display: `${wd >= 0 ? "+" : ""}${wd}`,
        score: clamp(wd / 20, -2, 2),
        weight: 40,
        verdict:
          wd >= 8 ? "情绪一周内快速升温，短线资金涌入"
          : wd >= 3 ? "情绪逐步改善，风险偏好回升"
          : wd > -3 ? "情绪基本持平"
          : wd > -8 ? "情绪逐步转冷，风险偏好回落"
          : "情绪一周内快速降温，恐慌蔓延",
        kind: "momentum",
      })
    }
    const sentComp = compositeOf(sent)

    // 3) 市场广度：主流币 24H 涨跌家数与平均涨幅
    const breadth: IndicatorResult[] = []
    const pcts = coins
      .filter((c) => !STABLECOIN_IDS.has(c.id))
      .map((c) => tickers[c.id]?.changePct ?? c.price_change_percentage_24h_in_currency ?? 0)
    if (pcts.length >= 3) {
      const up = pcts.filter((v) => v > 0).length
      const down = pcts.filter((v) => v < 0).length
      const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length
      breadth.push({
        key: "breadth-ratio",
        name: "涨跌家数比（剔稳定币）",
        display: `${up} 涨 / ${down} 跌`,
        score: clamp(((up - down) / pcts.length) * 2, -2, 2),
        weight: 50,
        verdict:
          up / pcts.length >= 0.7 ? "普涨格局，市场做多意愿强"
          : up / pcts.length >= 0.5 ? "涨多跌少，多方略占优"
          : down / pcts.length >= 0.7 ? "普跌格局，避险情绪浓"
          : "跌多涨少，空方略占优",
        kind: "momentum",
      })
      breadth.push({
        key: "breadth-avg",
        name: "平均 24H 涨幅",
        display: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`,
        score: clamp(avg / 5, -2, 2),
        weight: 50,
        verdict:
          avg >= 3 ? "主流币整体大涨，市场热度高"
          : avg >= 0.5 ? "主流币整体偏强"
          : avg > -0.5 ? "主流币整体窄幅震荡"
          : avg > -3 ? "主流币整体偏弱"
          : "主流币整体大跌，市场承压",
        kind: "momentum",
      })
    }
    const breadthComp = compositeOf(breadth)

    // 加权总合成：技术 50% / 情绪 25% / 广度 25%（缺失维度按剩余权重归一）
    const parts: { comp: number; w: number }[] = []
    if (techComp !== null) parts.push({ comp: techComp, w: 0.5 })
    if (sentComp !== null) parts.push({ comp: sentComp, w: 0.25 })
    if (breadthComp !== null) parts.push({ comp: breadthComp, w: 0.25 })
    const total = parts.length
      ? Math.round(parts.reduce((a, p) => a + p.comp * p.w, 0) / parts.reduce((a, p) => a + p.w, 0))
      : null

    // 全部指标的多空计数
    const all = [...tech, ...sent, ...breadth]
    const counts = { bull: 0, bear: 0, neutral: 0 }
    for (const i of all) {
      const t = verdictOfScore(i.score).tone
      counts[t === "bull" ? "bull" : t === "bear" ? "bear" : "neutral"]++
    }

    return { tech, techComp, sent, sentComp, breadth, breadthComp, total, counts }
  }, [analysis, stats, coins, tickers])

  if (loading && !snapshot) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
        <SkPageHeader title="w-40" desc="w-64" />

        {/* 当前指数 + 关键点位 */}
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonCard className="lg:col-span-5">
            <SkHeader title="w-16" />
            <div className="flex flex-1 flex-col justify-center gap-5">
              <div className="flex items-end gap-4">
                <Skeleton className="h-14 w-24 rounded-lg" />
                <div className="space-y-1.5 pb-1.5">
                  <Skeleton className="h-3.5 w-16 rounded-md" />
                  <Skeleton className="h-2 w-10 rounded-full bg-secondary/50" />
                </div>
              </div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/50">
                <Skeleton className="absolute inset-y-0 left-[58%] w-[3px] rounded-full" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/45" />
                <Skeleton className="h-2 w-10 rounded-full bg-secondary/45" />
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/45" />
              </div>
            </div>
          </SkeletonCard>
          <SkeletonCard className="lg:col-span-7">
            <SkHeader title="w-16" />
            <div className="grid flex-1 grid-cols-2 content-center gap-4 sm:grid-cols-3">
              {["w-10", "w-12", "w-10", "w-10", "w-12"].map((w, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border/60 p-3">
                  <Skeleton className={cn("h-2 rounded-full bg-secondary/50", w)} />
                  <Skeleton className="h-6 w-12 rounded-md" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>

        {/* 近 30 日走势:柱状剪影 */}
        <SkeletonCard>
          <SkHeader title="w-24" />
          <ChartSkeleton className="h-48" bars={30} />
        </SkeletonCard>
      </main>
    )
  }

  if (!stats) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-10 sm:px-6">
        <Card>
          <CardContent className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold">情绪数据暂不可用</p>
            <p className="text-xs text-muted-foreground">情绪数据暂时无法访问，请稍后刷新重试</p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const delta = (a: number, b: number) => {
    const d = a - b
    return (
      <span className={cn("font-mono text-xs", d > 0 ? "text-up" : d < 0 ? "text-down" : "text-muted-foreground")}>
        {d > 0 ? "▲" : d < 0 ? "▼" : "—"} {Math.abs(d)}
      </span>
    )
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="Sentiment"
        title="市场情绪"
        description="恐惧贪婪指数 · 每日更新 · 近 30 日历史"
      />

      {/* 当前指数 + 关键点位 */}
      <section className="fade-up grid gap-4 lg:grid-cols-12" style={{ animationDelay: "60ms" }}>
        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
              当前指数
            </CardTitle>
            <CardDescription className="font-mono text-[10px] tracking-wider">
              {fmtDate(stats.now.timestamp)} · FEAR &amp; GREED
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-4">
              <span className="font-mono text-7xl leading-none font-bold tabular">
                {String(stats.now.value).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1 pb-1">
                <span className="text-base font-semibold">{fngZh(stats.now.classification)}</span>
                <span className="font-mono text-[10px] text-muted-foreground">/ 100</span>
              </div>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: FNG_GRADIENT, opacity: 0.9 }}
              />
              <div
                className="absolute inset-y-0 w-[3px] rounded-full bg-popover"
                style={{ left: `calc(${stats.now.value}% - 1.5px)` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>0 极度恐惧</span>
              <span>50 中性</span>
              <span>100 极度贪婪</span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
              关键点位
            </CardTitle>
            <CardDescription>与当前值的差值</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {[
              { label: "昨日", entry: stats.yesterday },
              { label: "一周前", entry: stats.weekAgo },
              { label: "一月前", entry: stats.monthAgo },
            ].map(({ label, entry }) => (
              <div key={label} className="rounded-lg border border-border/60 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
                  {delta(stats.now.value, entry.value)}
                </div>
                <div className="mt-1.5 font-mono text-2xl font-bold tabular">{entry.value}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{fngZh(entry.classification)}</div>
              </div>
            ))}
            <div className="rounded-lg border border-border/60 p-3">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">30日均值</span>
              <div className="mt-1.5 font-mono text-2xl font-bold tabular">{stats.avg}</div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                区间 {stats.min} – {stats.max}
              </div>
            </div>
            <div className="col-span-2 rounded-lg border border-border/60 p-3 sm:col-span-2">
              <span className="text-[10px] tracking-wider text-muted-foreground uppercase">解读</span>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {stats.now.value >= 75
                  ? "市场处于极度贪婪状态，历史上常对应阶段性过热，注意风险控制。"
                  : stats.now.value >= 56
                    ? "市场情绪偏贪婪，资金活跃，趋势往往延续但需留意回调。"
                    : stats.now.value >= 45
                      ? "市场情绪中性，多空平衡，通常等待方向选择。"
                      : stats.now.value >= 25
                        ? "市场情绪偏恐惧，回调中的谨慎情绪占主导。"
                        : "市场处于极度恐惧状态，历史上常对应阶段性底部区域，亦可能进一步恶化。"}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 多空情绪总览：三维综合判断 */}
      {synthesis.total !== null && (
        <section className="fade-up space-y-3" style={{ animationDelay: "100ms" }}>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-muted-foreground uppercase">
              多空情绪总览 SENTIMENT SYNTHESIS
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Card>
            <CardContent className="py-5">
              <OpinionSummary
                composite={synthesis.total}
                label={`${verdictOfComposite(synthesis.total).label}（综合情绪）`}
                counts={synthesis.counts}
                note="总合成 = 技术面 ×50% + 情绪面 ×25% + 市场广度 ×25%（缺失维度按剩余权重归一）· 逆向指标已折算"
              />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              {
                title: "技术面",
                en: "TECHNICAL",
                desc: "BTC 日线趋势与动能指标",
                list: synthesis.tech,
                comp: synthesis.techComp,
              },
              {
                title: "情绪面",
                en: "SENTIMENT",
                desc: "恐惧贪婪指数（逆向 + 顺势动量）",
                list: synthesis.sent,
                comp: synthesis.sentComp,
              },
              {
                title: "市场广度",
                en: "BREADTH",
                desc: "主流币涨跌参与度",
                list: synthesis.breadth,
                comp: synthesis.breadthComp,
              },
            ].map((dim) => (
              <Card key={dim.title}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-semibold">{dim.title}</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">{dim.desc}</CardDescription>
                    </div>
                    <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground">{dim.en}</span>
                  </div>
                  {dim.comp !== null && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-baseline justify-between">
                        <span className={cn("font-mono text-sm font-bold tabular", dim.comp >= 15 ? "text-up" : dim.comp <= -15 ? "text-down" : "text-muted-foreground")}>
                          {dim.comp > 0 ? "+" : ""}
                          {dim.comp}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {verdictOfComposite(dim.comp).label}
                        </span>
                      </div>
                      <CompositeBar composite={dim.comp} />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="@container space-y-1 pb-3">
                  {dim.list.length ? (
                    dim.list.map((ind, i) => (
                      <OpinionRow key={ind.key} ind={ind} index={i} wSum={dim.list.reduce((a, x) => a + x.weight, 0)} />
                    ))
                  ) : (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">该维度数据暂不可用</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* 30 日历史 */}
      <Card className="fade-up" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardTitle className="text-base">近 30 日走势</CardTitle>
          <CardDescription>柱高 = 指数值 · 悬停查看日期与数值</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-56 items-end gap-1.5">
            {history.slice(-30).map((e, i, arr) => (
              <div
                key={e.timestamp}
                className="group relative flex-1"
                title={`${fmtDate(e.timestamp)} · ${e.value} ${fngZh(e.classification)}`}
              >
                <div
                  className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-80"
                  style={{ height: `${Math.max(6, (e.value / 100) * 200)}px`, background: fngShade(e.value) }}
                />
                {i === arr.length - 1 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 font-mono text-[10px] font-bold">
                    {e.value}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{history.length > 30 ? fmtDate(history[history.length - 30].timestamp) : fmtDate(history[0].timestamp)}</span>
            <span>今天</span>
          </div>
        </CardContent>
      </Card>

      {/* 分布 */}
      <Card className="fade-up" style={{ animationDelay: "180ms" }}>
        <CardHeader>
          <CardTitle className="text-base">30 日情绪分布</CardTitle>
          <CardDescription>各区间出现的天数</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {dist.map((b) => (
            <div key={b.key} className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">{b.label}</span>
              <div className="h-6 flex-1 overflow-hidden rounded bg-secondary">
                <div
                  className="flex h-full items-center justify-end rounded px-2 font-mono text-[10px] font-semibold transition-[width] duration-500"
                  style={{
                    width: `${Math.max(b.days ? 8 : 0, (b.days / Math.max(1, fng.length)) * 100)}%`,
                    background: fngShade((b.range[0] + b.range[1]) / 2),
                    color: (b.range[0] + b.range[1]) / 2 >= 50 ? "var(--foreground)" : "var(--background)",
                  }}
                >
                  {b.days > 0 && `${b.days} 天`}
                </div>
              </div>
              <span className="w-14 shrink-0 font-mono text-[10px] text-muted-foreground">
                {b.range[0]}–{b.range[1]}
              </span>
            </div>
          ))}
          <p className="pt-1 text-[10px] leading-relaxed text-muted-foreground">
            提示：情绪指数是逆向参考指标 —— 极端恐惧往往对应底部区域，极端贪婪对应顶部区域。结合{" "}
            <Link to="/" className="underline underline-offset-2 hover:text-foreground">
              总览页的信号与牛熊判定
            </Link>{" "}
            一起使用效果更佳。
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
