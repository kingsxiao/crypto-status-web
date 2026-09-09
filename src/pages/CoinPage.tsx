import { Link, useNavigate, useParams } from "react-router-dom"
import { RotateCw, TriangleAlert } from "lucide-react"

import { CoinDetail } from "@/components/CoinDetail"
import { Button } from "@/components/ui/button"
import { ChartSkeleton, SkeletonCard, SkHeader } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { formatWatchTitle } from "@/lib/format"

export function CoinPage() {
  useT()
  const { id = "" } = useParams()
  const { snapshot, error, loading, refresh } = useMarket()
  const tickers = useLive()
  const navigate = useNavigate()
  const coin = snapshot?.coins.find((c) => c.id === id) ?? null
  // 有实时价时标签页标题切为盯盘格式（每秒随 useLive 刷新），否则回退静态标题
  const live = tickers[id]
  const watch = coin ? formatWatchTitle(coin.symbol, live?.price, live?.changePct) : ""
  usePageMeta({
    title: watch || (coin ? `${coin.name} (${coin.symbol.toUpperCase()}) · CRYPTO STATUS` : t("meta.coin")),
  })

  if (loading && !snapshot) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
        {/* 返回行 */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-5 w-20 rounded-full bg-secondary/60" />
        </div>
        {/* 币种头部:头像 + 名称 + 大数字 + 4 项统计 */}
        <SkeletonCard contentClassName="flex-row flex-wrap items-center justify-between gap-6 py-5">
          <div className="flex items-center gap-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-4 w-12 rounded-full bg-secondary/60" />
              </div>
              <div className="flex items-baseline gap-3">
                <Skeleton className="h-8 w-32 rounded-lg" />
                <Skeleton className="h-4 w-16 rounded-md bg-secondary/60" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2 w-12 rounded-full bg-secondary/50" />
                <Skeleton className="h-3.5 w-16 rounded-md" />
              </div>
            ))}
          </div>
        </SkeletonCard>
        {/* 工具条 */}
        <Skeleton className="h-[72px] w-full rounded-xl" />
        {/* K 线图 + 多空观点 */}
        <SkeletonCard contentClassName="gap-4 pt-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded-md" />
            <Skeleton className="h-2.5 w-40 rounded-full bg-secondary/50" />
          </div>
          <ChartSkeleton className="h-80" bars={40} />
        </SkeletonCard>
        <SkeletonCard contentClassName="py-8">
          <SkHeader title="w-28" />
          <div className="grid gap-2 pt-2 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <Skeleton className="h-2.5 w-32 rounded-full bg-secondary/60" />
                <Skeleton className="h-3 w-12 rounded-md" />
              </div>
            ))}
          </div>
        </SkeletonCard>
      </main>
    )
  }

  // 快照主备源全挂：报加载失败而非「未找到该币种」，否则误导用户
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

  if (!coin) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 flex-col items-center justify-center gap-4 px-6 py-24">
        <div className="flex size-14 items-center justify-center rounded-full border">
          <TriangleAlert className="size-6" />
        </div>
        <div className="text-center">
          <p className="font-semibold">{t("coin.notFound")}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">id: {id}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/markets">{t("coin.backToList")}</Link>
        </Button>
      </main>
    )
  }

  return (
    <CoinDetail
      coin={coin}
      live={tickers[coin.id]}
      onBack={() => (window.history.length > 1 ? navigate(-1) : navigate("/markets"))}
    />
  )
}
