import { useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { RotateCw, TriangleAlert } from "lucide-react"

import { BtcChartCard } from "@/components/BtcChartCard"
import { IndicatorBreakdown } from "@/components/IndicatorBreakdown"
import { MarketOverview } from "@/components/MarketOverview"
import { PageHeader } from "@/components/layout/PageHeader"
import { PricesTable } from "@/components/PricesTable"
import { RegimeCard } from "@/components/RegimeCard"
import { SentimentCard } from "@/components/SentimentCard"
import { SignalCard } from "@/components/SignalCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ChartSkeleton,
  SkeletonCard,
  SkHeader,
  SkMiniBars,
  SkProgress,
  SkSectionLabel,
  StatStripSkeleton,
  TableSkeleton,
} from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarket, useLive } from "@/context/MarketDataContext"
import { t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import type { Coin } from "@/lib/api"

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 pt-6">
      {/* 第一屏:信号 / 牛熊 / 情绪 */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* 综合多空信号:仪表盘剪影 */}
        <SkeletonCard className="min-h-[430px] lg:col-span-5">
          <SkHeader title="w-20" />
          <div className="flex flex-1 flex-col items-center justify-center gap-5 py-4">
            <div className="relative flex size-36 items-center justify-center rounded-full border-[3px] border-secondary/35" aria-hidden>
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
            <Skeleton className="h-7 w-24 rounded-md" />
            <div className="flex w-full items-center justify-between pt-1">
              <Skeleton className="h-2.5 w-16 rounded-full bg-secondary/60" />
              <Skeleton className="h-2.5 w-12 rounded-full bg-secondary/60" />
              <Skeleton className="h-2.5 w-16 rounded-full bg-secondary/60" />
            </div>
          </div>
        </SkeletonCard>
        {/* 牛熊周期:大标签 + 牛熊柱 + 进度条 */}
        <SkeletonCard className="min-h-[430px] lg:col-span-4">
          <SkHeader title="w-16" />
          <div className="flex flex-1 flex-col justify-between gap-5 py-2">
            <div className="flex items-end justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <Skeleton className="size-2.5 rounded-full bg-secondary/60" />
                  <Skeleton className="h-8 w-24 rounded-lg" />
                </div>
                <Skeleton className="h-2.5 w-20 rounded-full bg-secondary/60" />
              </div>
              <SkMiniBars count={9} />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-full rounded-full bg-secondary/60" />
              <Skeleton className="h-2.5 w-5/6 rounded-full bg-secondary/60" />
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Skeleton className="h-2 w-14 rounded-full bg-secondary/50" />
                <SkProgress fill="54%" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-2 w-14 rounded-full bg-secondary/50" />
                <SkProgress fill="76%" />
              </div>
            </div>
          </div>
        </SkeletonCard>
        {/* 市场情绪:大数字 + 情绪条 + 30日剪影 */}
        <SkeletonCard className="min-h-[430px] lg:col-span-3">
          <SkHeader title="w-16" />
          <div className="flex flex-1 flex-col justify-between gap-4 py-2">
            <div className="flex items-end gap-3">
              <Skeleton className="h-11 w-16 rounded-lg" />
              <div className="space-y-1.5 pb-1">
                <Skeleton className="h-3 w-14 rounded-md" />
                <Skeleton className="h-2 w-8 rounded-full bg-secondary/50" />
              </div>
            </div>
            <div>
              <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary/50">
                <Skeleton className="absolute inset-y-0 left-[62%] w-[3px] rounded-full" />
              </div>
              <div className="mt-2 flex justify-between">
                <Skeleton className="h-2 w-10 rounded-full bg-secondary/45" />
                <Skeleton className="h-2 w-10 rounded-full bg-secondary/45" />
                <Skeleton className="h-2 w-10 rounded-full bg-secondary/45" />
              </div>
            </div>
            <SkMiniBars count={12} className="h-20" />
          </div>
        </SkeletonCard>
      </div>

      {/* 全球市场概览 */}
      <StatStripSkeleton />

      {/* BTC 走势 */}
      <div className="space-y-3">
        <SkSectionLabel />
        <SkeletonCard contentClassName="gap-4 pt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-2.5 w-40 rounded-full bg-secondary/50" />
          </div>
          <ChartSkeleton className="h-72" bars={36} />
        </SkeletonCard>
      </div>

      {/* 实时价格 */}
      <div className="space-y-3">
        <SkSectionLabel />
        <SkeletonCard contentClassName="px-6 py-4">
          <TableSkeleton rows={8} showSparkline />
        </SkeletonCard>
      </div>
    </div>
  )
}

export function DashboardPage() {
  useT()
  usePageMeta({ title: t("meta.dashboard"), description: t("page.dashboard.desc") })
  const { snapshot, error, loading, refresh, patchedChart, analysis } = useMarket()
  const tickers = useLive()
  const navigate = useNavigate()

  const chart = useMemo(() => patchedChart ?? snapshot?.btcChart ?? null, [patchedChart, snapshot])
  const onCoinSelect = useCallback((c: Coin) => navigate(`/coin/${c.id}`), [navigate])

  if (loading) return <DashboardSkeleton />

  if (error && !snapshot) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 flex-col items-center justify-center gap-4 px-6 py-24">
        <div className="flex size-14 items-center justify-center rounded-full border">
          <TriangleAlert className="size-6" />
        </div>
        <div className="text-center">
          <p className="font-semibold">{t("common.loadFail")}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{error}</p>
        </div>
        <Button onClick={refresh} variant="outline" size="sm" className="gap-1.5">
          <RotateCw className="size-3.5" /> {t("common.retry")}
        </Button>
      </main>
    )
  }

  if (!snapshot) return null

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 space-y-6 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="Dashboard"
        title={t("page.dashboard.title")}
        description={t("page.dashboard.desc")}
      />

      {/* 第一屏：信号 / 牛熊 / 情绪（lg~xl 三卡均分放得下英文长标题，xl 起恢复 5/4/3 主次） */}
      <section className="fade-up grid gap-4 lg:grid-cols-12">
        <div className="fade-up lg:col-span-4 xl:col-span-5">
          {analysis ? (
            <SignalCard analysis={analysis} />
          ) : (
            <Card className="h-full">
              <CardContent className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
                <p className="text-sm font-semibold">{t("dash.noInd")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {t("dash.noIndDesc")}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="fade-up lg:col-span-4" style={{ animationDelay: "60ms" }}>
          {analysis ? (
            <RegimeCard analysis={analysis} />
          ) : (
            <Card className="h-full">
              <CardContent className="py-16 text-center text-xs text-muted-foreground">{t("common.noData")}</CardContent>
            </Card>
          )}
        </div>
        <div className="fade-up lg:col-span-4 xl:col-span-3" style={{ animationDelay: "120ms" }}>
          <SentimentCard fng={snapshot.fng} />
        </div>
      </section>

      {/* 全球市场概览 */}
      <section className="fade-up" style={{ animationDelay: "160ms" }}>
        <MarketOverview global={snapshot.global} />
      </section>

      {/* BTC 走势 */}
      <section className="fade-up space-y-3" style={{ animationDelay: "200ms" }}>
        <SectionLabel>{t("dash.section.structure")}</SectionLabel>
        {chart && <BtcChartCard chart={chart} analysis={analysis} />}
      </section>

      {/* 实时价格 */}
      <section className="fade-up space-y-3" style={{ animationDelay: "240ms" }}>
        <SectionLabel>{t("dash.section.live")}</SectionLabel>
        <PricesTable
          coins={snapshot.coins}
          live={tickers}
          onSelect={onCoinSelect}
        />
      </section>

      {/* 指标明细 */}
      {analysis && (
        <section className="fade-up space-y-3" style={{ animationDelay: "280ms" }}>
          <SectionLabel>{t("dash.section.signal")}</SectionLabel>
          <IndicatorBreakdown analysis={analysis} />
        </section>
      )}
    </main>
  )
}
