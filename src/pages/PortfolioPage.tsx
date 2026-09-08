import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Coins, Pencil, Plus, ShieldCheck, Trash2, Wallet } from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { TableSkeleton } from "@/components/loading"
import { LivePrice, Pct } from "@/components/price-cells"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { Input } from "@/components/ui/input"
import { SkeletonCard, SkPageHeader, StatStripSkeleton } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
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
import { t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import type { Coin } from "@/lib/api"
import { formatPrice, formatUsdCompact } from "@/lib/format"
import { computeStats, usePortfolio, type Holding, type PriceRef } from "@/lib/portfolio"
import { cn } from "@/lib/utils"

/* ------------------------------ 视图模型 ------------------------------ */

interface Row {
  holding: Holding
  coin: Coin | undefined
  price: number | null
  value: number | null
  chg24h: number | null
  pnl: number | null
  pnlPct: number | null
}

/** 数量格式化：大数千分位，小数最多 8 位有效（与换算器一致） */
function formatAmount(v: number): string {
  if (v === 0) return "0"
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 8 })
  return v.toPrecision(4).replace(/\.?0+$/, "")
}

/** 盈亏金额格式化：接近零时避免 formatPrice 的 6 位小数展开 */
function formatPnlAbs(v: number): string {
  return Math.abs(v) < 0.01 ? "0.00" : formatPrice(Math.abs(v))
}

/** 配置环形图配色：首段用主题色，其余为明度居中的固定色相（明暗主题通用） */
const ALLOC_COLORS = [
  "var(--primary)",
  "oklch(0.72 0.13 250)",
  "oklch(0.75 0.13 160)",
  "oklch(0.78 0.12 80)",
  "oklch(0.70 0.15 25)",
  "oklch(0.72 0.12 310)",
  "oklch(0.75 0.10 200)",
  "oklch(0.74 0.12 130)",
  "oklch(0.70 0.10 350)",
  "oklch(0.72 0.10 60)",
]

/* ------------------------------ 环形图 ------------------------------ */

function AllocDonut({ slices }: { slices: { key: string; pct: number; color: string }[] }) {
  const r = 15.9155 // 周长恰为 100，dasharray 直接用百分比
  // 预计算每段起点（累计百分比），避免渲染期变量重赋值
  const segments = slices.reduce<{ key: string; pct: number; color: string; start: number }[]>(
    (acc, s) => {
      const prev = acc[acc.length - 1]
      acc.push({ ...s, start: prev ? prev.start + prev.pct : 0 })
      return acc
    },
    []
  )
  return (
    <div className="relative mx-auto w-fit">
      <svg viewBox="0 0 42 42" className="size-44 sm:size-52" role="img" aria-label={t("pf.alloc.title")}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--secondary)" strokeWidth="5" />
        {segments.map((s) => {
          const len = Math.max(s.pct - (segments.length > 1 ? 0.7 : 0), 0.3)
          return (
            <circle
              key={s.key}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={s.pct >= 99.5 ? 5 : 5.8}
              strokeDasharray={`${len} ${100 - len}`}
              strokeDashoffset={-s.start}
              transform="rotate(-90 21 21)"
            />
          )
        })}
      </svg>
    </div>
  )
}

/* ------------------------------ 表单 ------------------------------ */

type FormState =
  | { mode: "closed" }
  | { mode: "add"; coinId: string; amount: string; cost: string }
  | { mode: "edit"; id: string; coinId: string; amount: string; cost: string }

function parseNum(s: string): number {
  return parseFloat(s.trim().replace(",", "."))
}

function HoldingForm({
  coins,
  state,
  prices,
  existing,
  onChange,
  onClose,
  onSubmit,
}: {
  coins: Coin[]
  state: Extract<FormState, { mode: "add" | "edit" }>
  prices: Record<string, PriceRef>
  /** 编辑的币种是否已在持仓中（add 模式下用于覆盖提示） */
  existing: boolean
  onChange: (s: FormState) => void
  onClose: () => void
  onSubmit: () => void
}) {
  useT()
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  const amountNum = parseNum(state.amount)
  const price = prices[state.coinId]?.price ?? coins.find((c) => c.id === state.coinId)?.current_price ?? null
  const estimate = price != null && Number.isFinite(amountNum) && amountNum > 0 ? amountNum * price : null

  const submit = () => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(t("pf.form.amountInvalid"))
      return
    }
    const costNum = state.cost.trim() === "" ? null : parseNum(state.cost)
    if (costNum != null && (!Number.isFinite(costNum) || costNum < 0)) {
      setError(t("pf.form.costInvalid"))
      return
    }
    setError(null)
    onSubmit()
  }

  return (
    <div ref={cardRef}>
    <Card className="fade-up">
      <CardHeader>
        <CardHead
          title={
            <span className="flex items-center gap-2.5">
              <IconChip className="border-primary/30 bg-primary/10 text-primary">
                {state.mode === "add" ? <Plus /> : <Pencil />}
              </IconChip>
              {state.mode === "add" ? t("pf.form.add") : t("pf.form.edit")}
            </span>
          }
          desc={existing && state.mode === "add" ? t("pf.form.exists") : t("pf.form.desc")}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pf-coin" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.asset")}
            </label>
            <div className="relative">
              <select
                id="pf-coin"
                value={state.coinId}
                disabled={state.mode === "edit"}
                onChange={(e) => onChange({ ...state, coinId: e.target.value })}
                className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              >
                {coins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.symbol.toUpperCase()} · {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div>
            <label htmlFor="pf-amount" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.amount")}
            </label>
            <Input
              id="pf-amount"
              inputMode="decimal"
              value={state.amount}
              onChange={(e) => onChange({ ...state, amount: e.target.value })}
              placeholder="0.00"
              className="h-11 font-mono text-lg font-semibold tabular"
            />
          </div>
          <div>
            <label htmlFor="pf-cost" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.cost")}
            </label>
            <Input
              id="pf-cost"
              inputMode="decimal"
              value={state.cost}
              onChange={(e) => onChange({ ...state, cost: e.target.value })}
              placeholder="USD · 选填"
              className="h-11 font-mono text-lg font-semibold tabular"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>
              {t("pf.form.valueNow")}：{" "}
              <span className="font-semibold text-foreground tabular">
                {estimate != null ? `$${formatPrice(estimate)}` : "—"}
              </span>
            </span>
            {error && <span className="text-down">{error}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}

/* ------------------------------ 页面 ------------------------------ */

export function PortfolioPage() {
  useT()
  usePageMeta({ title: t("meta.portfolio") })
  const { snapshot, loading } = useMarket()
  const tickers = useLive()
  const { holdings, upsert, remove, clear } = usePortfolio()

  const [form, setForm] = useState<FormState>({ mode: "closed" })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (clearTimer.current) clearTimeout(clearTimer.current)
  }, [])

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  /** coinId → 价格引用（实时优先，回退快照） */
  const prices = useMemo(() => {
    const map: Record<string, PriceRef> = {}
    for (const c of coins) {
      const tk = tickers[c.id]
      map[c.id] = {
        price: tk?.price ?? c.current_price,
        chg24h: tk?.changePct ?? c.price_change_percentage_24h_in_currency ?? null,
      }
    }
    return map
  }, [coins, tickers])

  const stats = useMemo(() => computeStats(holdings, prices), [holdings, prices])

  /** 行视图：有价格在前、按市值降序；无价格行垫底 */
  const rows = useMemo<Row[]>(() => {
    const list = holdings.map((h): Row => {
      const coin = coins.find((c) => c.id === h.id)
      const ref = prices[h.id]
      const price = ref?.price ?? null
      const value = price != null ? h.amount * price : null
      const pnl = value != null && h.cost != null ? value - h.cost : null
      const pnlPct = pnl != null && h.cost ? (pnl / h.cost) * 100 : null
      return {
        holding: h,
        coin,
        price,
        value,
        chg24h: ref?.chg24h ?? null,
        pnl,
        pnlPct,
      }
    })
    return list.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  }, [holdings, coins, prices])

  const alloc = useMemo(() => {
    const total = rows.reduce((s, r) => s + (r.value ?? 0), 0)
    if (total <= 0) return []
    return rows
      .filter((r) => r.value != null && r.value > 0)
      .map((r, i) => ({
        key: r.holding.id,
        symbol: (r.coin?.symbol ?? r.holding.id).toUpperCase(),
        name: r.coin?.name ?? r.holding.id,
        value: r.value ?? 0,
        pct: ((r.value ?? 0) / total) * 100,
        color: ALLOC_COLORS[i % ALLOC_COLORS.length],
      }))
  }, [rows])

  const top = alloc[0]

  const openAdd = (coinId?: string) =>
    setForm({ mode: "add", coinId: coinId ?? coins[0]?.id ?? "bitcoin", amount: "", cost: "" })

  const submitForm = () => {
    if (form.mode === "closed") return
    const amount = parseNum(form.amount)
    const cost = form.cost.trim() === "" ? null : parseNum(form.cost)
    upsert({ id: form.coinId, amount, cost: cost ?? null, addedAt: Date.now() })
    setForm({ mode: "closed" })
  }

  const twoStepDelete = (id: string) => {
    if (confirmDelete === id) {
      remove(id)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(id)
      if (clearTimer.current) clearTimeout(clearTimer.current)
      clearTimer.current = setTimeout(() => setConfirmDelete(null), 2600)
    }
  }

  /* ------------------------------ 加载骨架 ------------------------------ */

  if (loading && !snapshot) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
        <SkPageHeader title="w-36" desc="w-64" />
        <StatStripSkeleton />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonCard className="min-h-[380px] lg:col-span-8">
            <div className="h-4 w-24 rounded-md" />
            <TableSkeleton rows={5} />
          </SkeletonCard>
          <SkeletonCard className="min-h-[380px] lg:col-span-4">
            <div className="h-4 w-20 rounded-md" />
            <div className="flex flex-1 items-center justify-center">
              <Skeleton className="size-44 rounded-full sm:size-52" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-2.5 w-full rounded-full bg-secondary/60" />
              ))}
            </div>
          </SkeletonCard>
        </div>
      </main>
    )
  }

  const pnlTone = (v: number | null) => (v == null ? "" : v >= 0 ? "text-up" : "text-down")

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 2xl:max-w-[1680px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="Portfolio" title={t("page.portfolio.title")} description={t("page.portfolio.desc")} />

      {/* 空状态引导 */}
      {holdings.length === 0 && form.mode === "closed" ? (
        <Card className="fade-up">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
              <Wallet className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{t("pf.empty.title")}</p>
              <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
                {t("pf.empty.desc")}
              </p>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => openAdd()}>
              <Plus className="size-3.5" /> {t("pf.empty.cta")}
            </Button>
            <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
              <ShieldCheck className="size-3" /> {t("pf.privacy")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 添加 / 编辑表单 */}
          {form.mode !== "closed" && (
            <HoldingForm
              coins={coins}
              state={form}
              prices={prices}
              existing={form.mode === "add" && holdings.some((h) => h.id === form.coinId)}
              onChange={setForm}
              onClose={() => setForm({ mode: "closed" })}
              onSubmit={submitForm}
            />
          )}

          {/* KPI 统计条 */}
          <Card className="fade-up py-0">
            <CardContent className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-border/60 md:py-0">
              <div className="flex flex-col gap-1.5 px-5 py-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Coins className="size-3.5" />
                  <span className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">
                    {t("pf.kpi.total")}
                  </span>
                </div>
                <span className="font-mono text-xl font-bold tabular break-all">
                  ${stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t("pf.kpi.totalSub", { n: holdings.length })}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 border-l border-border/60 px-5 py-5 md:border-l-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">
                    24H
                  </span>
                </div>
                <span className={cn("font-mono text-xl font-bold tabular", pnlTone(stats.pnl24h))}>
                  {stats.pnl24h != null
                    ? `${stats.pnl24h >= 0 ? "+" : "−"}$${Math.abs(stats.pnl24h).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
                <span className={cn("font-mono text-[10px] tabular", pnlTone(stats.pnl24hPct))}>
                  {stats.pnl24hPct != null
                    ? `${stats.pnl24hPct >= 0 ? "+" : ""}${stats.pnl24hPct.toFixed(2)}%`
                    : t("pf.kpi.pnl24hNone")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-border/60 px-5 py-5 md:border-t-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">
                    {t("pf.kpi.costPnl")}
                  </span>
                </div>
                <span className={cn("font-mono text-xl font-bold tabular", pnlTone(stats.costPnl))}>
                  {stats.costPnl != null
                    ? `${stats.costPnl >= 0 ? "+" : "−"}$${Math.abs(stats.costPnl).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                    : "—"}
                </span>
                <span className={cn("font-mono text-[10px] tabular", pnlTone(stats.costPnlPct))}>
                  {stats.costPnlPct != null
                    ? `${stats.costPnlPct >= 0 ? "+" : ""}${stats.costPnlPct.toFixed(2)}%`
                    : t("pf.kpi.costPnlNone")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-l border-border/60 px-5 py-5 md:border-t-0 md:border-l-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">
                    {t("pf.kpi.top")}
                  </span>
                </div>
                <span className="font-mono text-xl font-bold tabular">
                  {top ? top.symbol : "—"}
                </span>
                <span className="font-mono text-[10px] text-muted-foreground tabular">
                  {top ? `${top.pct.toFixed(1)}% · ${formatUsdCompact(top.value)}` : "—"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 持仓表 + 配置图 */}
          <div className="grid items-start gap-4 lg:grid-cols-12">
            <Card className="fade-up lg:col-span-8" style={{ animationDelay: "60ms" }}>
              <CardHeader>
                <CardHead title={t("pf.table.title")} desc={t("pf.table.desc", { n: rows.length })}>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openAdd()}>
                    <Plus className="size-3.5" /> {t("pf.form.add")}
                  </Button>
                </CardHead>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("common.col.asset")}</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">{t("common.col.price")}</TableHead>
                      <TableHead className="hidden text-right md:table-cell">{t("pf.col.amount")}</TableHead>
                      <TableHead className="text-right">{t("pf.col.value")}</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">24H</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">{t("pf.col.cost")}</TableHead>
                      <TableHead className="text-right">{t("pf.col.pnl")}</TableHead>
                      <TableHead className="w-[76px]">
                        <span className="sr-only">{t("pf.col.actionsSr")}</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => {
                      const symbol = (r.coin?.symbol ?? r.holding.id).toUpperCase()
                      return (
                        <TableRow key={r.holding.id} className="hover:bg-secondary/40">
                          <TableCell>
                            {r.coin ? (
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={r.coin.image}
                                  alt=""
                                  className="size-7 rounded-full border bg-background object-cover grayscale contrast-125"
                                  loading="lazy"
                                  width={28}
                                  height={28}
                                />
                                <div className="flex flex-col">
                                  <span className="text-sm font-semibold leading-tight">{r.coin.name}</span>
                                  <span className="font-mono text-[10px] uppercase leading-tight text-muted-foreground">
                                    {r.coin.symbol}
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2.5">
                                <span className="flex size-7 items-center justify-center rounded-full border font-mono text-[10px] text-muted-foreground">
                                  {symbol.slice(0, 1)}
                                </span>
                                <span className="font-mono text-sm">{symbol}</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-right sm:table-cell">
                            {r.price != null && tickers[r.holding.id] ? (
                              <LivePrice price={r.price} />
                            ) : (
                              <span className="font-mono text-sm tabular">
                                {r.price != null ? `$${formatPrice(r.price)}` : t("pf.noPrice")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-sm tabular md:table-cell">
                            {formatAmount(r.holding.amount)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold tabular">
                            {r.value != null ? `$${formatPrice(r.value)}` : "—"}
                          </TableCell>
                          <TableCell className="hidden text-right lg:table-cell">
                            <Pct v={r.chg24h} />
                          </TableCell>
                          <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground sm:table-cell">
                            {r.holding.cost != null ? `$${formatPrice(r.holding.cost)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {r.pnl != null ? (
                              <div className="flex flex-col leading-tight">
                                <span className={cn("font-mono text-sm font-semibold tabular", pnlTone(r.pnl))}>
                                  {r.pnl >= 0 ? "+" : "−"}${formatPnlAbs(r.pnl)}
                                </span>
                                {r.pnlPct != null && (
                                  <span className={cn("font-mono text-[10px] tabular", pnlTone(r.pnlPct))}>
                                    {r.pnlPct >= 0 ? "+" : ""}{r.pnlPct.toFixed(2)}%
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-mono text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    aria-label={t("pf.editSr", { symbol })}
                                    onClick={() =>
                                      setForm({
                                        mode: "edit",
                                        id: r.holding.id,
                                        coinId: r.holding.id,
                                        amount: String(r.holding.amount),
                                        cost: r.holding.cost != null ? String(r.holding.cost) : "",
                                      })
                                    }
                                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>{t("common.edit")}</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    aria-label={t("pf.deleteSr", { symbol })}
                                    onClick={() => twoStepDelete(r.holding.id)}
                                    className={cn(
                                      "rounded p-1.5 transition-colors",
                                      confirmDelete === r.holding.id
                                        ? "bg-down/15 text-down"
                                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    )}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {confirmDelete === r.holding.id ? t("pf.deleteConfirm") : t("common.delete")}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                  <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70">
                    <ShieldCheck className="size-3" /> {t("pf.privacy")}
                  </p>
                  <button
                    onClick={() => {
                      if (confirmClear) {
                        clear()
                        setConfirmClear(false)
                        setForm({ mode: "closed" })
                      } else {
                        setConfirmClear(true)
                        if (clearTimer.current) clearTimeout(clearTimer.current)
                        clearTimer.current = setTimeout(() => setConfirmClear(false), 2600)
                      }
                    }}
                    className={cn(
                      "font-mono text-[10px] tracking-wider uppercase transition-colors",
                      confirmClear ? "text-down" : "text-muted-foreground/60 hover:text-down"
                    )}
                  >
                    {confirmClear ? t("pf.clearConfirm") : t("pf.clear")}
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* 配置占比 */}
            <Card className="fade-up lg:col-span-4" style={{ animationDelay: "120ms" }}>
              <CardHeader>
                <CardHead title={t("pf.alloc.title")} desc={t("pf.alloc.desc")} />
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                {alloc.length === 0 ? (
                  <div className="flex h-52 items-center justify-center text-xs text-muted-foreground">
                    {t("pf.noPrice")}
                  </div>
                ) : (
                  <>
                    <div className="relative mx-auto w-fit">
                      <AllocDonut slices={alloc.map((a) => ({ key: a.key, pct: a.pct, color: a.color }))} />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="font-mono text-[9px] tracking-[0.18em] text-muted-foreground uppercase">
                          {t("pf.kpi.total")}
                        </span>
                        <span className="mt-1 font-mono text-lg font-bold tabular">
                          ${stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {alloc.map((a) => (
                        <li key={a.key} className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-[3px] border border-border/60"
                            style={{ background: a.color }}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-mono text-xs font-semibold uppercase">{a.symbol}</span>
                            <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">{a.name}</span>
                          </span>
                          <span className="font-mono text-xs tabular text-muted-foreground">
                            {formatUsdCompact(a.value)}
                          </span>
                          <span className="w-14 text-right font-mono text-xs font-semibold tabular">
                            {a.pct.toFixed(1)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  )
}
