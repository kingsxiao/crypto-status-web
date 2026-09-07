import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Eye, RotateCw, TriangleAlert } from "lucide-react"

import { CrossAssetTable } from "@/components/CrossAssetTable"
import { MarketAnchorsCard } from "@/components/MarketAnchorsCard"
import { StanceMixCard } from "@/components/StanceMixCard"
import { VerdictCard } from "@/components/VerdictCard"
import { VerdictHistoryCard } from "@/components/VerdictHistoryCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardKicker,
} from "@/components/ui/card"
import { LoadingDots, SkeletonCard, SkHeader, SkPageHeader, SkProgress, TableSkeleton } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { useMarket } from "@/context/MarketDataContext"
import { t, tm, useT, type LMsg } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import {
  computeVerdict,
  cryptoMcapOf,
  fetchCrossAsset,
  loadHistory,
  upsertToday,
  type CrossAssetData,
  type VerdictRecord,
} from "@/lib/crossAsset"

/** 今日关注：由极值读数规则生成的观察清单（复刻 OpenClue outlook 板块） */
function WatchCard({ items }: { items: LMsg[] }) {
  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <CardKicker
          icon={Eye}
          title={t("vp.watchTitle")}
          en="WATCHLIST"
          desc={t("vp.watchDesc")}
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2.5">
        <div className="flex-1 space-y-2.5">
          {items.map((w) => (
            <div key={w.key} className="flex gap-2.5 text-xs leading-relaxed">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full border border-primary" />
              <span className="text-muted-foreground">{tm(w)}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto border-t border-border/60 pt-2.5 text-[10px] leading-relaxed text-muted-foreground/70">
          {t("vp.reviewNote")}
        </p>
      </CardContent>
    </Card>
  )
}

function VerdictSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-20 pt-6 sm:px-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SkPageHeader title="w-36" desc="w-96" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      {/* 第一屏:立场 / 分布 / 关注 */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* 立场卡:大结论 + 得分条 + 摘要行 */}
        <SkeletonCard className="min-h-[560px] lg:col-span-5">
          <SkHeader title="w-20" />
          <div className="flex flex-1 flex-col justify-center gap-5">
            <Skeleton className="h-10 w-36 rounded-lg" />
            <div className="space-y-3">
              <SkProgress fill="68%" />
              <div className="flex justify-between">
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/50" />
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/50" />
              </div>
            </div>
            <div className="space-y-2.5 border-t border-border/50 pt-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-2.5 w-28 rounded-full bg-secondary/60" />
                  <Skeleton className="h-3 w-14 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </SkeletonCard>
        {/* 立场分布:堆叠条 + 图例行 */}
        <SkeletonCard className="min-h-[560px] lg:col-span-4">
          <SkHeader title="w-24" />
          <div className="flex flex-1 flex-col justify-center gap-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full">
              <Skeleton className="h-full w-[44%]" />
              <Skeleton className="h-full w-[32%] bg-secondary/60" />
              <Skeleton className="h-full flex-1 bg-secondary/45" />
            </div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-2.5 w-20 rounded-full bg-secondary/60" />
                <Skeleton className="h-2.5 w-10 rounded-full bg-secondary/45" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        {/* 今日关注:清单行 */}
        <SkeletonCard className="min-h-[560px] lg:col-span-3">
          <SkHeader title="w-16" />
          <div className="flex flex-1 flex-col gap-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex gap-2.5">
                <Skeleton className="mt-1 size-1.5 shrink-0 rounded-full bg-secondary/60" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-full rounded-full bg-secondary/60" />
                  <Skeleton className="h-2 w-3/5 rounded-full bg-secondary/45" />
                </div>
              </div>
            ))}
            <div className="mt-auto space-y-1.5 border-t border-border/50 pt-2.5">
              <Skeleton className="h-2 w-full rounded-full bg-secondary/45" />
              <Skeleton className="h-2 w-4/5 rounded-full bg-secondary/45" />
            </div>
          </div>
        </SkeletonCard>
      </div>

      {/* 指标明细表 */}
      <SkeletonCard contentClassName="px-6 py-4">
        <TableSkeleton rows={7} />
      </SkeletonCard>

      {/* 体量参照 + 判断历史 */}
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonCard className="min-h-[300px] lg:col-span-7">
          <SkHeader title="w-24" />
          <div className="grid flex-1 grid-cols-2 content-center gap-5 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/50" />
                <Skeleton className="h-4 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        <SkeletonCard className="min-h-[300px] lg:col-span-5">
          <SkHeader title="w-20" />
          <div className="space-y-4 pt-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-2.5 w-16 shrink-0 rounded-full bg-secondary/60" />
                <Skeleton className="h-3 w-12 shrink-0 rounded-md" />
                <Skeleton className="h-2.5 w-14 rounded-full bg-secondary/45" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </div>
    </div>
  )
}

export function VerdictPage() {
  useT()
  usePageMeta({ title: t("meta.verdict") })
  const { snapshot, loading, refresh } = useMarket()

  const [cross, setCross] = useState<CrossAssetData | null>(null)
  const [crossError, setCrossError] = useState(false)
  // 惰性初始化：挂载时读一次 localStorage，无需 effect + setState
  const [history, setHistory] = useState<VerdictRecord[]>(loadHistory)
  // 请求代际：连点刷新时只采纳最后一次请求的结果，避免慢响应覆盖新数据
  const loadGenRef = useRef(0)

  const loadCross = useCallback(() => {
    const gen = ++loadGenRef.current
    setCrossError(false)
    fetchCrossAsset()
      .then((d) => {
        if (gen === loadGenRef.current) setCross(d)
      })
      .catch(() => {
        if (gen === loadGenRef.current) setCrossError(true)
      })
  }, [])

  useEffect(() => {
    loadCross()
  }, [loadCross])

  const verdict = useMemo(() => {
    if (!snapshot || !cross) return null
    return computeVerdict({
      global: snapshot.global,
      fng: snapshot.fng[0] ?? null,
      coins: snapshot.coins,
      cross,
    })
  }, [snapshot, cross])

  // 每次重算后落库今日判断（按日期幂等）
  useEffect(() => {
    if (verdict) setHistory(upsertToday(verdict))
  }, [verdict])

  const missing = useMemo(() => {
    if (!cross) return []
    const m: string[] = []
    if (!cross.stablecoin) m.push(t("vp.missing.stablecoin"))
    if (!cross.derivatives) m.push(t("vp.missing.derivatives"))
    if (!cross.breadth) m.push(t("vp.missing.breadth"))
    return m
  }, [cross])

  if (loading) return <VerdictSkeleton />

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-20 pt-6 sm:px-6">
      {/* 页头 */}
      <PageHeader
        en="Verdict"
        title={t("page.verdict.title")}
        description={t("page.verdict.desc")}
      >
        {crossError && (
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-down">
            <TriangleAlert className="size-3.5" /> {t("vp.crossError")}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refresh()
            loadCross()
          }}
          className="gap-1.5"
        >
          <RotateCw className="size-3.5" /> {t("common.refresh")}
        </Button>
      </PageHeader>

      {verdict && snapshot ? (
        <>
          {/* 第一屏：立场 / 分布 / 关注 */}
          <section className="fade-up grid gap-4 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <VerdictCard verdict={verdict} />
            </div>
            <div className="lg:col-span-4" style={{ animationDelay: "60ms" }}>
              <StanceMixCard verdict={verdict} />
            </div>
            <div className="lg:col-span-3" style={{ animationDelay: "120ms" }}>
              <WatchCard items={verdict.watch} />
            </div>
          </section>

          {/* 指标明细 */}
          <section className="fade-up" style={{ animationDelay: "160ms" }}>
            <CrossAssetTable verdict={verdict} missing={missing} />
          </section>

          {/* 体量参照 + 判断历史 */}
          <section className="fade-up grid gap-4 lg:grid-cols-12" style={{ animationDelay: "200ms" }}>
            <div className="lg:col-span-7">
              <MarketAnchorsCard cryptoMcap={cryptoMcapOf(snapshot.global, snapshot.coins)} />
            </div>
            <div className="lg:col-span-5">
              <VerdictHistoryCard history={history} />
            </div>
          </section>

          {/* 数据源与口径说明 */}
          <footer className="fade-up space-y-1 pb-4 text-[11px] leading-relaxed text-muted-foreground">
            <p>{t("vp.sources1")}</p>
            <p>{t("vp.sources2")}</p>
          </footer>
        </>
      ) : (
        /* 快照已就绪、跨资产数据仍在拉取的过渡态:轻量居中指示,避免全页骨架二次闪烁 */
        <Card className="fade-up">
          <CardContent className="flex h-72 flex-col items-center justify-center gap-3">
            <LoadingDots className="scale-125" />
            <p className="text-xs text-muted-foreground">{t("vp.loadingCross")}</p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
