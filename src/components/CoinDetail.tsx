import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  CandlestickChart,
  Check,
  LineChart,
  Link2,
  Loader2,
  Star,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartSkeleton, SkHeader } from "@/components/loading"
import { Segmented } from "@/components/ui/segmented"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { CandleChart } from "@/components/CandleChart"
import { OpinionBoard } from "@/components/OpinionBoard"
import { useFavorites } from "@/hooks/useFavorites"
import { t, useT } from "@/i18n"
import type { Coin } from "@/lib/api"
import { analyzeCoin } from "@/lib/coinAnalysis"
import { formatPrice, formatUsdCompact } from "@/lib/format"
import { fetchCandles, mergeLiveTick, pollIntervalMs, type Candle } from "@/lib/kline"
import { TRADE_SYMBOLS, type LiveTicker } from "@/lib/realtime"
import { cn } from "@/lib/utils"

interface Props {
  coin: Coin
  live?: LiveTicker
  onBack: () => void
}

/* ---------- 图表偏好：localStorage 持久化，切币种/刷新不丢 ---------- */

interface ChartPrefs {
  intervalKey: string
  range: 100 | 250 | 500
  overlays: { ma: boolean; boll: boolean; fib: boolean }
  panes: { rsi: boolean; macd: boolean; kdj: boolean }
  /** null = 跟随数据源默认；用户手动选过蜡烛/折线后记住 */
  renderPref: "candles" | "line" | null
}

const PREFS_KEY = "crypto-status:chart-prefs"
const INTERVAL_KEYS = ["1s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const
const RANGES = [100, 250, 500] as const

/** 周期 key → 本地化标签（加载遮罩等动态 key 取词场景） */
const intervalLabel = (key: string): string =>
  (INTERVAL_KEYS as readonly string[]).includes(key)
    ? t(`coin.interval.${key as (typeof INTERVAL_KEYS)[number]}`)
    : key

function loadPrefs(): ChartPrefs {
  const fallback: ChartPrefs = {
    intervalKey: "1d",
    range: 250,
    overlays: { ma: true, boll: false, fib: false },
    panes: { rsi: true, macd: false, kdj: false },
    renderPref: null,
  }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ChartPrefs>
    return {
      intervalKey: (INTERVAL_KEYS as readonly string[]).includes(p.intervalKey ?? "")
        ? (p.intervalKey as string)
        : "1d",
      range: RANGES.includes((p.range ?? 250) as 100 | 250 | 500) ? (p.range as 100 | 250 | 500) : 250,
      overlays: { ...fallback.overlays, ...p.overlays },
      panes: { ...fallback.panes, ...p.panes },
      renderPref: p.renderPref === "candles" || p.renderPref === "line" ? p.renderPref : null,
    }
  } catch {
    return fallback
  }
}

function Toggle({
  active,
  onClick,
  children,
  hint,
  disabled,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  hint: string
  disabled?: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          disabled={disabled}
          aria-pressed={active}
          className={cn(
            "inline-flex items-center justify-center rounded-md border px-2 py-1 font-mono text-[11px] font-medium transition-colors focus-visible:outline-ring focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:ring-[3px]",
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground",
            disabled && "cursor-not-allowed opacity-40"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** 头部小图标操作（自选 / 复制链接）共用样式 */
const iconBtnCls =
  "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-ring focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:ring-[3px]"

export function CoinDetail({ coin, live, onBack }: Props) {
  useT()
  const [prefs] = useState(loadPrefs)
  const [intervalKey, setIntervalKey] = useState(prefs.intervalKey)
  const [range, setRange] = useState<100 | 250 | 500>(prefs.range)
  const [overlays, setOverlays] = useState(prefs.overlays)
  const [panes, setPanes] = useState(prefs.panes)
  const [renderPref, setRenderPref] = useState(prefs.renderPref)

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ intervalKey, range, overlays, panes, renderPref }))
    } catch {
      /* 隐私模式等场景静默失败 */
    }
  }, [intervalKey, range, overlays, panes, renderPref])

  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [sourceMode, setSourceMode] = useState<"candles" | "line">("candles")
  const [source, setSource] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  // 同币切周期：保留旧图加遮罩，而不是闪整块骨架屏
  const [reloading, setReloading] = useState(false)

  // 独立日线序列：多空观点分析固定基于日线，不随图表周期切换
  const [dailyCandles, setDailyCandles] = useState<Candle[] | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)

  const symbols = TRADE_SYMBOLS[coin.id]

  // 请求代际：切周期/切币种后旧响应作废，防止慢响应覆盖新数据
  const genRef = useRef(0)
  // 是否已持有图表数据：静默轮询失败时据此决定是否清空图表（ref 避免 candles
  // 变化改变 load 身份、进而重置轮询定时器）
  const hasDataRef = useRef(false)
  // 上次加载的币种：区分「切币种」（必须清图防串数据）与「同币切周期」（可保留旧图）
  const coinKeyRef = useRef("")

  const load = useCallback(
    async (silent = false) => {
      if (!symbols) {
        // 直链进入无交易对的币种（如稳定币）：给出明确提示而非永久骨架屏
        setError(t("coin.noChart"))
        return
      }
      const gen = ++genRef.current
      const coinChanged = coinKeyRef.current !== coin.id
      coinKeyRef.current = coin.id
      if (!silent) {
        if (coinChanged || !hasDataRef.current) {
          hasDataRef.current = false
          setCandles(null)
          setReloading(false)
        } else {
          setReloading(true)
        }
      }
      try {
        const res = await fetchCandles(coin.id, symbols, intervalKey)
        if (gen !== genRef.current) return
        setCandles(res.candles)
        hasDataRef.current = true
        setSourceMode(res.renderMode)
        setSource(res.source === "coingecko-line" ? t("coin.source.snapshot") : t("coin.source.live"))
        setError(null)
        setReloading(false)
      } catch (e) {
        if (gen !== genRef.current) return
        setReloading(false)
        // 静默轮询失败且已有数据：保留图表等下一轮重试；
        // 手动切换周期失败：同样保留旧图，以错误遮罩提示 + 重试
        if (!silent || !hasDataRef.current) {
          setError(e instanceof Error ? e.message : t("coin.loadFailFallback"))
        }
      }
    },
    [coin.id, symbols, intervalKey]
  )

  useEffect(() => {
    load()
  }, [load])

  // 静默轮询保证K线不至于过分陈旧；秒/分钟级周期按 pollIntervalMs 收紧节奏。
  // 轮询走 silent 路径：不闪骨架屏、失败不清空已有图表
  useEffect(() => {
    const timer = setInterval(() => load(true), pollIntervalMs(intervalKey))
    return () => clearInterval(timer)
  }, [load, intervalKey])

  // 独立加载日线（仅币种切换时重拉；静默失败不影响图表）
  const dailyGenRef = useRef(0)
  const loadDaily = useCallback(async () => {
    if (!symbols) {
      setDailyLoading(false)
      return
    }
    const gen = ++dailyGenRef.current
    setDailyLoading(true)
    try {
      const res = await fetchCandles(coin.id, symbols, "1d")
      if (gen !== dailyGenRef.current) return // 切币种后的旧响应，丢弃
      setDailyCandles(res.candles)
    } catch {
      /* 观点区显示数据不足提示 */
    } finally {
      if (gen === dailyGenRef.current) setDailyLoading(false)
    }
  }, [coin.id, symbols])

  useEffect(() => {
    setDailyCandles(null)
    setDailyLoading(true)
    loadDaily()
  }, [loadDaily])

  const livePrice = live?.price ?? coin.current_price
  const liveChange = live?.changePct ?? coin.price_change_percentage_24h_in_currency ?? 0

  // 实时价跳动闪烁：方向色一闪即焚（复用全站 flash-up/down 关键帧）
  const prevPriceRef = useRef(livePrice)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  useEffect(() => {
    const prev = prevPriceRef.current
    if (livePrice === prev) return
    prevPriceRef.current = livePrice
    setFlash(livePrice > prev ? "up" : "down")
    const timer = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(timer)
  }, [livePrice])

  // 24H 高低区间位置：当前价落在区间内的比例（0~1）
  const high24 = live?.high ?? coin.high_24h
  const low24 = live?.low ?? coin.low_24h
  const pos24 =
    high24 && low24 && high24 > low24 ? Math.max(0, Math.min(1, (livePrice - low24) / (high24 - low24))) : null

  // 自选 + 复制链接
  const { has, toggle } = useFavorites()
  const fav = has(coin.id)
  const [copied, setCopied] = useState(false)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyLink = useCallback(async () => {
    // 主路径 async Clipboard API；无头/非聚焦/旧环境可能拒绝甚至挂起，超时后退回 execCommand
    let ok: boolean
    try {
      ok = await Promise.race([
        navigator.clipboard.writeText(window.location.href).then(() => true, () => false),
        new Promise<boolean>((res) => setTimeout(() => res(false), 1200)),
      ])
    } catch {
      ok = false
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea")
        ta.value = window.location.href
        ta.style.position = "fixed"
        ta.style.opacity = "0"
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand("copy")
        ta.remove()
      } catch {
        ok = false
      }
    }
    if (!ok) return
    setCopied(true)
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
  }, [])
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])

  // 实时价每秒推送，但K线合并与八指标重算按 5s 采样：
  // 头部价格保持秒级刷新，图表不必每秒重建全套指标序列
  const liveRef = useRef<LiveTicker | undefined>(undefined)
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const [liveSampled, setLiveSampled] = useState<LiveTicker | undefined>(undefined)
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSampled((prev) => (liveRef.current === prev ? prev : liveRef.current))
    }, 5_000)
    return () => clearInterval(timer)
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

  // 渲染模式：兜底折线源强制折线；蜡烛源下用户手动选择优先，否则跟随源
  const renderMode = sourceMode === "line" ? "line" : (renderPref ?? "candles")

  return (
    <TooltipProvider delayDuration={200}>
    <main className="mx-auto w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
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
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{coin.name}</span>
                <Badge variant="secondary" className="font-mono text-[10px] uppercase">{coin.symbol}</Badge>
                <span className="font-mono text-[10px] text-muted-foreground">#{coin.market_cap_rank}</span>
                <span className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => toggle(coin.id)}
                        aria-pressed={fav}
                        aria-label={fav ? t("coin.favRemove") : t("coin.favAdd")}
                        className={cn(iconBtnCls, "!size-7", fav && "text-primary hover:text-primary")}
                      >
                        <Star className={cn("size-4", fav && "fill-current")} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{fav ? t("coin.favRemove") : t("coin.favAdd")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button onClick={copyLink} aria-label={t("coin.copyLink")} className={cn(iconBtnCls, "!size-7")}>
                        {copied ? <Check className="size-4 text-up" /> : <Link2 className="size-4" />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{copied ? t("coin.copied") : t("coin.copyLink")}</TooltipContent>
                  </Tooltip>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span
                  key={flash ?? "static"}
                  className={cn(
                    "font-mono text-3xl font-bold tabular leading-none",
                    flash === "up" && "flash-up",
                    flash === "down" && "flash-down"
                  )}
                >
                  ${formatPrice(livePrice)}
                </span>
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
              {/* 24H 高低区间位置条 */}
              {pos24 != null && (
                <div
                  className="mt-3 flex w-full max-w-[300px] items-center gap-2"
                  role="img"
                  aria-label={`${t("coin.range24Label")} ${(pos24 * 100).toFixed(0)}%`}
                >
                  <span className="shrink-0 font-mono text-[10px] tabular text-down/90">{formatPrice(low24!)}</span>
                  <div className="relative h-1.5 flex-1 rounded-full bg-secondary">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
                      style={{ width: `${pos24 * 100}%`, background: "linear-gradient(90deg, var(--down), var(--up))" }}
                    />
                    <div
                      className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background transition-[left] duration-500"
                      style={{ left: `${pos24 * 100}%`, backgroundColor: liveChange >= 0 ? "var(--up)" : "var(--down)" }}
                    />
                  </div>
                  <span className="shrink-0 font-mono text-[10px] tabular text-up/90">{formatPrice(high24!)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grow grid-cols-2 gap-x-8 gap-y-3 sm:grow-0 sm:grid-cols-4 sm:divide-x sm:divide-border/60">
            {[
              { label: t("coin.stat.high24"), value: high24 },
              { label: t("coin.stat.low24"), value: low24 },
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
            items={INTERVAL_KEYS.map((k) => ({
              value: k,
              label: <span className="font-mono">{t(`coin.interval.${k}`)}</span>,
            }))}
          />

          <Separator orientation="vertical" className="!h-6" />

          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{t("coin.rangeLabel")}</span>
            {RANGES.map((r) => (
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
            <Toggle active={overlays.fib} onClick={() => setOverlays((o) => ({ ...o, fib: !o.fib }))} hint={t("coin.overlay.fibHint")}>
              FIB
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

          <div className="ml-auto flex items-center gap-1.5" role="group" aria-label={t("coin.renderLabel")}>
            <Toggle
              active={renderMode === "candles"}
              onClick={() => setRenderPref("candles")}
              hint={t("coin.render.candle")}
              disabled={sourceMode === "line"}
            >
              <CandlestickChart className="size-3.5" />
            </Toggle>
            <Toggle active={renderMode === "line"} onClick={() => setRenderPref("line")} hint={t("coin.render.line")}>
              <LineChart className="size-3.5" />
            </Toggle>
          </div>
        </CardContent>
      </Card>

      {/* 图表 */}
      <Card className="fade-up">
        <CardContent className="pt-6">
          {error && !visible ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3">
              <p className="text-sm font-semibold">{t("coin.loadFail")}</p>
              <p className="font-mono text-xs text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" onClick={() => load()}>{t("common.retry")}</Button>
            </div>
          ) : !visible ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-2.5 w-44 rounded-full bg-secondary/50" />
              </div>
              <ChartSkeleton className="h-80" bars={44} />
            </div>
          ) : (
            <div className="relative">
              <CandleChart
                candles={visible}
                renderMode={renderMode}
                overlays={overlays}
                panes={panes}
                intervalKey={intervalKey}
              />
              {/* 切周期加载 / 加载失败：旧图保留 + 遮罩提示，避免整块图表闪跳消失 */}
              {(reloading || error) && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/60 backdrop-blur-[1px]">
                  {reloading ? (
                    <>
                      <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      <p className="font-mono text-xs text-muted-foreground">
                        {t("coin.chartLoading", { interval: intervalLabel(intervalKey) })}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold">{t("coin.loadFail")}</p>
                      <p className="max-w-[80%] truncate font-mono text-xs text-muted-foreground">{error}</p>
                      <Button variant="outline" size="sm" onClick={() => load()}>{t("common.retry")}</Button>
                    </>
                  )}
                </div>
              )}
            </div>
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
      ) : dailyLoading ? (
        <Card className="fade-up">
          <CardContent className="space-y-5 py-6">
            <SkHeader title="w-40" />
            <div className="space-y-4 px-4">
              <Skeleton className="h-10 w-56 rounded-lg bg-secondary/50" />
              <Skeleton className="h-2.5 w-full rounded-full bg-secondary/50" />
              <div className="space-y-2.5 pt-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <Skeleton className="h-3 w-36 rounded-full bg-secondary/60" />
                    <Skeleton className="h-3.5 w-14 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
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
