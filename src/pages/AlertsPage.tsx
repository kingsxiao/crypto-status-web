import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import {
  BellOff,
  BellPlus,
  BellRing,
  ChevronDown,
  History,
  RotateCcw,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
} from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { pushToast } from "@/components/ui/toast"
import { LivePrice } from "@/components/price-cells"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { SkeletonCard, SkPageHeader } from "@/components/loading"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { dateLocale, t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { useTwoStepConfirm } from "@/hooks/useTwoStepConfirm"
import {
  distancePct,
  MAX_ALERTS,
  notifyPermission,
  notifySupported,
  requestNotifyPermission,
  useAlerts,
  type AlertKind,
} from "@/lib/alerts"
import { formatPrice, parseNum } from "@/lib/format"
import { TRADE_SYMBOLS } from "@/lib/realtime"
import { cn } from "@/lib/utils"

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(dateLocale(), {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function KindBadge({ kind }: { kind: AlertKind }) {
  const above = kind === "above"
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 font-mono text-[10px]", above ? "text-up" : "text-down")}
    >
      {above ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {t(above ? "al.kind.above" : "al.kind.below")}
    </Badge>
  )
}

/** 目标价预设模板:±5% / ±10% / ±20% + 整数关口 */
const PRESETS = [
  { mult: 1.05, label: "+5%" },
  { mult: 1.1, label: "+10%" },
  { mult: 1.2, label: "+20%" },
  { mult: 0.95, label: "−5%" },
  { mult: 0.9, label: "−10%" },
  { mult: 0.8, label: "−20%" },
]

/** 数量级 1/10 的整数关口:67,432 → 1,000 步进(above 68,000 / below 67,000) */
function roundTarget(p: number, kind: AlertKind): number {
  const step = Math.pow(10, Math.floor(Math.log10(p)) - 1)
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const raw = kind === "above" ? Math.ceil(p / step) * step : Math.floor(p / step) * step
  const v = kind === "above" ? (raw <= p ? raw + step : raw) : (raw >= p ? raw - step : raw)
  return Number(v.toFixed(dec))
}

/** 距离 → 接近度:距目标 20% 以上为 0,触达目标为 1(进度条宽度) */
function closeness(dist: number): number {
  return Math.max(0, Math.min(1, 1 - Math.abs(dist) / 20))
}

export function AlertsPage() {
  useT()
  usePageMeta({ title: t("meta.alerts"), description: t("page.alerts.desc") })
  const { snapshot, loading } = useMarket()
  const tickers = useLive()
  const { alerts, add, remove, rearm, clearTriggered, sound, setSound } = useAlerts()
  const [params] = useSearchParams()

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])
  const qCoin = params.get("coin")

  const [coinId, setCoinId] = useState(qCoin ?? "bitcoin")
  const [kind, setKind] = useState<AlertKind>("above")
  const [price, setPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [permTick, setPermTick] = useState(0)
  // 两个二次确认各自独立实例(与 PortfolioPage 同一套防御)
  const deleteConfirm = useTwoStepConfirm<string>()
  const clearConfirm = useTwoStepConfirm<true>()

  const active = useMemo(() => alerts.filter((a) => a.status === "active"), [alerts])
  const triggered = useMemo(
    () => alerts.filter((a) => a.status === "triggered").sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0)),
    [alerts]
  )
  const full = alerts.length >= MAX_ALERTS

  // 新转入历史的行闪现:以 id:triggeredAt 为键跟踪已见行(首屏存量不闪,
  // 重新武装后再触发会产生新键、再次闪现);键集只在渲染后追加,渲染期只读
  const [seenKeys] = useState(
    () => new Set(triggered.map((a) => `${a.id}:${a.triggeredAt ?? 0}`))
  )
  const flashKeys = useMemo(
    () =>
      new Set(
        triggered
          .filter((a) => !seenKeys.has(`${a.id}:${a.triggeredAt ?? 0}`))
          .map((a) => `${a.id}:${a.triggeredAt ?? 0}`)
      ),
    [triggered, seenKeys]
  )
  useEffect(() => {
    for (const a of triggered) seenKeys.add(`${a.id}:${a.triggeredAt ?? 0}`)
  }, [triggered, seenKeys])

  const priceOf = (id: string) => tickers[id]?.price ?? coins.find((c) => c.id === id)?.current_price ?? null
  // 可创建预警的币只列实时源(TRADE_SYMBOLS)覆盖的 —— 可选集与推送集一致,
  // 新建规则才一定有价可判;深链 ?coin= 带入集合外的历史脏值(如 tether)
  // 时渲染期回退首个可选币,受控 select 不得显示空白
  const selectable = useMemo(() => coins.filter((c) => TRADE_SYMBOLS[c.id] != null), [coins])
  const validCoinId =
    selectable.length === 0 || selectable.some((c) => c.id === coinId)
      ? coinId
      : selectable[0].id
  const curPrice = priceOf(validCoinId)
  const selectedCoin = coins.find((c) => c.id === validCoinId)

  const perm = useMemo(() => {
    void permTick
    return notifyPermission()
  }, [permTick])

  const submit = () => {
    const v = parseNum(price)
    if (!Number.isFinite(v) || v <= 0) {
      setError(t("al.create.invalid"))
      return
    }
    const sym = (selectedCoin?.symbol ?? validCoinId).toUpperCase()
    const rule = add({ coinId: validCoinId, symbol: sym, kind, price: v })
    if (!rule) {
      setError(t("al.create.full", { n: MAX_ALERTS }))
      return
    }
    setError(null)
    setPrice("")
    pushToast({
      title: t("al.created.title"),
      desc: t("al.created.desc", {
        symbol: sym,
        kind: t(kind === "above" ? "al.kind.above" : "al.kind.below"),
        target: formatPrice(v),
      }),
      ttlMs: 4500,
    })
    // 借用户手势请求通知权限;拒绝也不阻断创建(页内 toast 仍然有效)
    if (notifySupported() && Notification.permission === "default") {
      requestNotifyPermission().then(() => setPermTick((x) => x + 1))
    }
  }

  const quick = (mult: number) => {
    if (curPrice == null || curPrice <= 0) return
    setKind(mult > 1 ? "above" : "below")
    setPrice((curPrice * mult).toFixed(curPrice >= 1000 ? 0 : 2))
    setError(null)
  }

  const quickRound = () => {
    if (curPrice == null || curPrice <= 0) return
    setPrice(String(roundTarget(curPrice, kind)))
    setError(null)
  }

  /* ------------------------------ 加载骨架 ------------------------------ */

  if (loading && !snapshot) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
        <SkPageHeader title="w-40" desc="w-72" />
        <SkeletonCard className="min-h-[180px]">
          <div className="h-4 w-24 rounded-md" />
          <div className="grid gap-2 pt-2 sm:grid-cols-3">
            <div className="h-11 rounded-md bg-secondary/50" />
            <div className="h-11 rounded-md bg-secondary/50" />
            <div className="h-11 rounded-md bg-secondary/50" />
          </div>
        </SkeletonCard>
      </main>
    )
  }

  const permChip = () => {
    if (perm === "unsupported") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 font-mono text-[10px] text-muted-foreground">
          <BellRing className="size-3" /> {t("al.notif.unsupported")}
        </span>
      )
    }
    if (perm === "granted") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 font-mono text-[10px] text-primary">
          <span className="live-dot size-1.5 rounded-full bg-primary" /> {t("al.notif.on")}
        </span>
      )
    }
    if (perm === "denied") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-secondary/40 px-3 py-1 font-mono text-[10px] text-muted-foreground">
          <BellRing className="size-3" /> {t("al.notif.denied")}
        </span>
      )
    }
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-7 gap-1.5 rounded-full px-3 font-mono text-[10px]"
        onClick={() => requestNotifyPermission().then(() => setPermTick((x) => x + 1))}
      >
        <BellRing className="size-3" /> {t("al.notif.off")}
      </Button>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="Price Alerts" title={t("page.alerts.title")} description={t("page.alerts.desc")}>
        <div className="flex flex-wrap items-center gap-2">
          {permChip()}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={sound}
                aria-label={t("al.sound")}
                onClick={() => setSound(!sound)}
                className={cn("size-7 gap-0 rounded-full p-0", sound && "border-primary/40 text-primary")}
              >
                {sound ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("al.sound")} · {sound ? "ON" : "OFF"}
            </TooltipContent>
          </Tooltip>
        </div>
      </PageHeader>

      {/* 新建预警 */}
      <Card>
        <CardHeader>
          <CardHead
            title={
              <span className="flex items-center gap-2.5">
                <IconChip className="border-primary/30 bg-primary/10 text-primary">
                  <BellPlus />
                </IconChip>
                {t("al.create.title")}
              </span>
            }
            desc={t("al.create.desc")}
          />
        </CardHeader>
        <CardContent className="stagger flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <div>
              <label htmlFor="al-coin" className="type-label mb-1 block text-muted-foreground">
                {t("al.create.coin")}
              </label>
              <div className="relative">
                <select
                  id="al-coin"
                  value={validCoinId}
                  onChange={(e) => {
                    setCoinId(e.target.value)
                    setPrice("")
                    setError(null)
                  }}
                  className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
                >
                  {selectable.length === 0 && <option value={validCoinId}>{validCoinId}</option>}
                  {selectable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.symbol.toUpperCase()} · {c.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>
            <div>
              <span className="type-label mb-1 block text-muted-foreground">
                {t("al.create.dir")}
              </span>
              <Segmented
                label={t("al.create.dir")}
                value={kind}
                onChange={(v) => setKind(v)}
                className="h-11"
                items={[
                  { value: "above", label: <span className="flex items-center gap-1"><TrendingUp className="size-3.5" />{t("al.kind.above")}</span> },
                  { value: "below", label: <span className="flex items-center gap-1"><TrendingDown className="size-3.5" />{t("al.kind.below")}</span> },
                ]}
              />
            </div>
            <div>
              <label htmlFor="al-price" className="type-label mb-1 block text-muted-foreground">
                {t("al.create.price")}
              </label>
              <Input
                id="al-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder={curPrice != null ? `≈ ${formatPrice(curPrice)}` : "USD"}
                className="h-11 font-mono text-lg font-semibold tabular"
              />
            </div>
            <div className="flex items-end">
              <Button className="h-11 gap-1.5" onClick={submit} disabled={full}>
                <BellPlus className="size-4" /> {t("al.create.submit")}
              </Button>
            </div>
          </div>

          {/* 目标价预设模板:±5%/±10%/±20% + 整数关口(按当前方向取最近关口) */}
          {curPrice != null && curPrice > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="type-label text-muted-foreground">{t("al.quick")}</span>
              {PRESETS.map((q) => {
                const v = curPrice * q.mult
                return (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => quick(q.mult)}
                    title={`$${formatPrice(v)}`}
                    className={cn(
                      "rounded border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground",
                      // 涨跌色后置:tailwind-merge 同组后到优先,基色放前面 tint 才不被吃掉
                      q.mult > 1 ? "text-up" : "text-down"
                    )}
                  >
                    {q.label}
                  </button>
                )
              })}
              <span aria-hidden className="mx-1 h-4 w-px bg-border/70" />
              <button
                type="button"
                onClick={quickRound}
                title={`$${formatPrice(roundTarget(curPrice, kind))}`}
                className="rounded border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
              >
                {t("al.preset.round")}
              </button>
              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                1 {selectedCoin?.symbol.toUpperCase() ?? ""} = ${formatPrice(curPrice)}
              </span>
            </div>
          )}

          {(error || full) && (
            <p className="font-mono text-[11px] text-down">{error ?? t("al.create.full", { n: MAX_ALERTS })}</p>
          )}
        </CardContent>
      </Card>

      {/* 进行中 */}
      <Card>
        <CardHeader>
          <CardHead
            title={t("al.active.title")}
            desc={t("al.active.desc", { n: active.length })}
          >
            {active.length > 0 && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                <span className="live-dot size-1.5 rounded-full bg-primary" />
                {t("al.status.monitoring")}
              </span>
            )}
          </CardHead>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            /* 空态与 portfolio 同构：圆形描边图标 + 标题 + 说明居中 */
            <div className="flex h-44 flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <BellOff className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold">{t("al.active.empty")}</p>
                <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
                  {t("al.active.emptyDesc")}
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("common.col.asset")}</TableHead>
                  <TableHead>{t("al.col.kind")}</TableHead>
                  <TableHead className="text-right">{t("al.col.target")}</TableHead>
                  <TableHead className="text-right">{t("al.col.current")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("al.col.dist")}</TableHead>
                  <TableHead className="w-[52px]">
                    <span className="sr-only">{t("al.col.actionsSr")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {active.map((a) => {
                  const cur = priceOf(a.coinId)
                  const dist = distancePct(a, cur ?? NaN)
                  return (
                    <TableRow key={a.id} className="hover:bg-secondary/40">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 items-center justify-center rounded-full border font-mono text-[10px] text-muted-foreground">
                            {a.symbol.slice(0, 1)}
                          </span>
                          <span className="font-mono text-sm font-semibold uppercase">{a.symbol}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={a.kind} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular">
                        ${formatPrice(a.price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {cur != null && tickers[a.coinId] ? (
                          <LivePrice price={cur} />
                        ) : (
                          <span className="font-mono text-sm tabular">{cur != null ? `$${formatPrice(cur)}` : "—"}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono text-xs tabular text-muted-foreground">
                            {dist != null ? `${dist >= 0 ? "+" : ""}${dist.toFixed(2)}%` : "—"}
                          </span>
                          {dist != null && (
                            /* 接近度微型进度:距目标越近填充越满(20% 外为空),随行情推进 */
                            <div aria-hidden className="h-1 w-16 overflow-hidden rounded-full bg-secondary">
                              <div
                                className="w-anim h-full rounded-full bg-primary"
                                style={{ width: `${closeness(dist) * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              aria-label={t("al.deleteSr", { symbol: a.symbol })}
                              onClick={() => {
                                if (deleteConfirm.confirm(a.id)) remove(a.id)
                              }}
                              className={cn(
                                "ml-auto flex rounded p-1.5 transition-colors",
                                deleteConfirm.armed === a.id
                                  ? "bg-down/15 text-down"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              )}
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {deleteConfirm.armed === a.id ? t("pf.deleteConfirm") : t("common.delete")}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 触发历史 */}
      <Card>
        <CardHeader>
          <CardHead title={t("al.history.title")} desc={t("al.history.desc", { n: triggered.length })}>
            {triggered.length > 0 && (
              <button
                onClick={() => {
                  if (clearConfirm.confirm(true)) clearTriggered()
                }}
                className={cn(
                  "font-mono text-[10px] tracking-wider uppercase transition-colors",
                  clearConfirm.armed ? "text-down" : "text-muted-foreground/60 hover:text-down"
                )}
              >
                {clearConfirm.armed ? t("al.history.clearConfirm") : t("al.history.clear")}
              </button>
            )}
          </CardHead>
        </CardHeader>
        <CardContent>
          {triggered.length === 0 ? (
            /* 空态与 portfolio / 进行中卡同构：圆形描边图标 + 标题居中 */
            <div className="flex h-36 flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <History className="size-5" />
              </div>
              <p className="text-sm font-semibold">{t("al.history.empty")}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("common.col.asset")}</TableHead>
                  <TableHead>{t("al.col.kind")}</TableHead>
                  <TableHead className="text-right">{t("al.col.target")}</TableHead>
                  <TableHead className="text-right">{t("al.col.hit")}</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">{t("al.col.time")}</TableHead>
                  <TableHead className="w-[84px]">
                    <span className="sr-only">{t("al.col.actionsSr")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {triggered.map((a) => {
                  const flashKey = `${a.id}:${a.triggeredAt ?? 0}`
                  return (
                    <TableRow
                      key={a.id}
                      /* 新转入的行打一次涨色渐隐涂层(既有 flash-up 机制),提示刚触发 */
                      className={cn("hover:bg-secondary/40", flashKeys.has(flashKey) && "flash-up")}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 items-center justify-center rounded-full border font-mono text-[10px] text-muted-foreground">
                            {a.symbol.slice(0, 1)}
                          </span>
                          <span className="font-mono text-sm font-semibold uppercase">{a.symbol}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <KindBadge kind={a.kind} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular">
                        ${formatPrice(a.price)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold tabular text-up">
                        ${a.triggeredPrice != null ? formatPrice(a.triggeredPrice) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground sm:table-cell">
                        {a.triggeredAt != null ? formatDateTime(a.triggeredAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={t("al.rearmSr", { symbol: a.symbol })}
                                onClick={() => rearm(a.id)}
                                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              >
                                <RotateCcw className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t("al.rearm")}</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                aria-label={t("al.deleteSr", { symbol: a.symbol })}
                                onClick={() => {
                                  if (deleteConfirm.confirm(a.id)) remove(a.id)
                                }}
                                className={cn(
                                  "rounded p-1.5 transition-colors",
                                  deleteConfirm.armed === a.id
                                    ? "bg-down/15 text-down"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                )}
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {deleteConfirm.armed === a.id ? t("pf.deleteConfirm") : t("common.delete")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-muted-foreground">
        <ShieldCheck className="size-3 shrink-0" />
        {t("al.note")}
      </p>
    </main>
  )
}
