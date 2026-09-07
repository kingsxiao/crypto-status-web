import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownRight, ArrowLeft, ArrowUpRight, CandlestickChart, LineChart } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartSkeleton } from "@/components/loading"
import { Segmented } from "@/components/ui/segmented"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CandleChart } from "@/components/CandleChart"
import { OpinionBoard } from "@/components/OpinionBoard"
import { t, useT } from "@/i18n"
import type { Coin } from "@/lib/api"
import { analyzeCoin } from "@/lib/coinAnalysis"
import { formatPrice, formatUsdCompact } from "@/lib/format"
import { fetchCandles, mergeLiveTick, type Candle } from "@/lib/kline"
import { TRADE_SYMBOLS, type LiveTicker } from "@/lib/realtime"
import { cn } from "@/lib/utils"

interface Props {
  coin: Coin
  live?: LiveTicker
  onBack: () => void
}

function Toggle({
  active,
  onClick,
  children,
  hint,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  hint: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors",
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

export function CoinDetail({ coin, live, onBack }: Props) {
  useT()
  const [intervalKey, setIntervalKey] = useState("1d")
  const [range, setRange] = useState<100 | 250 | 500>(250)
  const [overlays, setOverlays] = useState({ ma: true, boll: false })
  const [panes, setPanes] = useState({ rsi: true, macd: false, kdj: false })

  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [renderMode, setRenderMode] = useState<"candles" | "line">("candles")
  const [source, setSource] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 独立日线序列：多空观点分析固定基于日线，不随图表周期切换
  const [dailyCandles, setDailyCandles] = useState<Candle[] | null>(null)

  const symbols = TRADE_SYMBOLS[coin.id]

  const load = useCallback(async () => {
    if (!symbols) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchCandles(coin.id, symbols, intervalKey)
      setCandles(res.candles)
      setRenderMode(res.renderMode)
      setSource(res.source === "coingecko-line" ? t("coin.source.snapshot") : t("coin.source.live"))
    } catch (e) {
      setError(e instanceof Error ? e.message : t("coin.loadFailFallback"))
    } finally {
      setLoading(false)
    }
  }, [coin.id, symbols, intervalKey])

  useEffect(() => {
    load()
  }, [load])

  // 周期切换时 60s 静默轮询，保证K线不至于过分陈旧
  useEffect(() => {
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // 独立加载日线（仅币种切换时重拉；静默失败不影响图表）
  const loadDaily = useCallback(async () => {
    if (!symbols) return
    try {
      const res = await fetchCandles(coin.id, symbols, "1d")
      setDailyCandles(res.candles)
    } catch {
      /* 观点区显示数据不足提示 */
    }
  }, [coin.id, symbols])

  useEffect(() => {
    setDailyCandles(null)
    loadDaily()
  }, [loadDaily])

  const livePrice = live?.price ?? coin.current_price
  const liveChange = live?.changePct ?? coin.price_change_percentage_24h_in_currency ?? 0

  // 实时价每秒推送，但K线合并与八指标重算按 5s 采样：
  // 头部价格保持秒级刷新，图表不必每秒重建全套指标序列
  const liveRef = useRef<LiveTicker | undefined>(undefined)
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const [liveSampled, setLiveSampled] = useState<LiveTicker | undefined>(undefined)
  useEffect(() => {
    const t = setInterval(() => {
      setLiveSampled((prev) => (liveRef.current === prev ? prev : liveRef.current))
    }, 5_000)
    return () => clearInterval(t)
  }, [])

  // 实时价合并到最后一根K线
  const merged = useMemo(
    () => (candles ? mergeLiveTick(candles, liveSampled ? { price: liveSampled.price } : undefined) : null),
    [candles, liveSampled]
  )
  const visible = useMemo(
    () => (merged ? (range >= merged.length ? merged : merged.slice(-range)) : null),
    [merged, range]
  )

  // 多空观点：日线 + 实时价末位合并 → 八指标综合判断
  const opinion = useMemo(() => {
    if (!dailyCandles?.length) return null
    const mergedDaily = mergeLiveTick(dailyCandles, liveSampled ? { price: liveSampled.price } : undefined)
    return analyzeCoin(
      mergedDaily.map((c) => c.close),
      mergedDaily.map((c) => c.volume)
    )
  }, [dailyCandles, liveSampled])

  return (
    <TooltipProvider delayDuration={200}>
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 gap-1.5">
          <ArrowLeft className="size-4" />
          {t("coin.back")}
        </Button>
        {source && (
          <Badge variant="outline" className="gap-1.5 font-mono text-[10px] text-muted-foreground">
            <span className="live-dot size-1.5 rounded-full bg-primary" />
            {t("coin.badge", { source })}
          </Badge>
        )}
      </div>

      {/* 币种头部 */}
      <Card className="fade-up">
        <CardContent className="flex flex-wrap items-center justify-between gap-6 py-5">
          <div className="flex items-center gap-4">
            <img
              src={coin.image}
              alt=""
              width={48}
              height={48}
              decoding="async"
              className="size-12 rounded-full border object-cover grayscale contrast-125"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{coin.name}</span>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">{coin.symbol}</Badge>
                <span className="font-mono text-[10px] text-muted-foreground">#{coin.market_cap_rank}</span>
              </div>
              <div className="mt-1 flex items-baseline gap-3">
                <span className="font-mono text-3xl font-bold tabular leading-none">${formatPrice(livePrice)}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-mono text-sm tabular",
                    liveChange >= 0 ? "text-up" : "text-down"
                  )}
                >
                  {liveChange >= 0 ? (
                    <ArrowUpRight className="size-4" strokeWidth={2.5} />
                  ) : (
                    <ArrowDownRight className="size-4" strokeWidth={2.5} />
                  )}
                  {Math.abs(liveChange).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 sm:divide-x sm:divide-border/60">
            {[
              { label: t("coin.stat.high24"), value: live?.high ?? coin.high_24h },
              { label: t("coin.stat.low24"), value: live?.low ?? coin.low_24h },
              { label: t("coin.stat.vol24"), value: live?.quoteVolume ?? coin.total_volume, compact: true },
              { label: t("coin.stat.mcap"), value: coin.market_cap, compact: true },
            ].map((s) => (
              <div key={s.label} className="flex flex-col gap-1 sm:px-5 sm:first:pl-0 sm:last:pr-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
                <span className="font-mono text-sm font-semibold tabular">
                  {s.compact ? formatUsdCompact(s.value) : s.value ? `$${formatPrice(s.value)}` : "—"}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 工具栏 */}
      <Card className="fade-up py-4">
        <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5">
          <Segmented
            label={t("coin.intervalLabel")}
            value={intervalKey}
            onChange={setIntervalKey}
            items={[
              { value: "1h", label: <span className="font-mono">{t("coin.interval.1h")}</span> },
              { value: "4h", label: <span className="font-mono">{t("coin.interval.4h")}</span> },
              { value: "1d", label: <span className="font-mono">{t("coin.interval.1d")}</span> },
              { value: "1w", label: <span className="font-mono">{t("coin.interval.1w")}</span> },
            ]}
          />

          <Separator orientation="vertical" className="!h-6" />

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("coin.rangeLabel")}</span>
            {([100, 250, 500] as const).map((r) => (
              <Toggle key={r} active={range === r} onClick={() => setRange(r)} hint={t("coin.rangeHint", { n: r })}>
                {r}
              </Toggle>
            ))}
          </div>

          <Separator orientation="vertical" className="!h-6" />

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("coin.overlayLabel")}</span>
            <Toggle active={overlays.ma} onClick={() => setOverlays((o) => ({ ...o, ma: !o.ma }))} hint={t("coin.overlay.maHint")}>
              MA
            </Toggle>
            <Toggle active={overlays.boll} onClick={() => setOverlays((o) => ({ ...o, boll: !o.boll }))} hint={t("coin.overlay.bollHint")}>
              BOLL
            </Toggle>
          </div>

          <Separator orientation="vertical" className="!h-6" />

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("coin.paneLabel")}</span>
            <Toggle active={panes.rsi} onClick={() => setPanes((p) => ({ ...p, rsi: !p.rsi }))} hint={t("coin.pane.rsiHint")}>
              RSI
            </Toggle>
            <Toggle active={panes.macd} onClick={() => setPanes((p) => ({ ...p, macd: !p.macd }))} hint={t("coin.pane.macdHint")}>
              MACD
            </Toggle>
            <Toggle active={panes.kdj} onClick={() => setPanes((p) => ({ ...p, kdj: !p.kdj }))} hint={t("coin.pane.kdjHint")}>
              KDJ
            </Toggle>
          </div>

          <div className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            {renderMode === "line" ? <LineChart className="size-3.5" /> : <CandlestickChart className="size-3.5" />}
            {renderMode === "line" ? t("coin.render.line") : t("coin.render.candle")}
          </div>
        </CardContent>
      </Card>

      {/* 图表 */}
      <Card className="fade-up">
        <CardContent className="pt-6">
          {error ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3">
              <p className="text-sm font-semibold">{t("coin.loadFail")}</p>
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={load}>{t("common.retry")}</Button>
            </div>
          ) : !visible || loading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-2.5 w-44 rounded-full bg-secondary/50" />
              </div>
              <ChartSkeleton className="h-80" bars={44} />
            </div>
          ) : (
            <CandleChart
              candles={visible}
              renderMode={renderMode}
              overlays={overlays}
              panes={panes}
              intervalKey={intervalKey}
            />
          )}
        </CardContent>
      </Card>

      {/* 多空观点：八指标综合判断，逐项列出 */}
      {opinion ? (
        <OpinionBoard
          analysis={opinion}
          title={t("coin.opinionTitle", { name: coin.name })}
          description={t("coin.opinionDesc")}
          badge={t("coin.opinionBadge", { n: opinion.indicators.length })}
        />
      ) : (
        <Card className="fade-up">
          <CardContent className="flex h-32 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-semibold">{t("coin.opinionInsufficient")}</p>
            <p className="text-xs text-muted-foreground">{t("coin.opinionInsufficientDesc")}</p>
          </CardContent>
        </Card>
      )}
    </main>
    </TooltipProvider>
  )
}
