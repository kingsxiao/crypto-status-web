import { useMemo, useRef, useState } from "react"
import { ArrowUpDown, Bitcoin, ChevronDown, DollarSign, MoveHorizontal } from "lucide-react"

import { AnimatedNumber } from "@/components/ui/animated-number"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"
import { IconChip } from "@/components/ui/icon-chip"
import { Input } from "@/components/ui/input"
import { SkeletonCard, SkPageHeader } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AssetCell, LivePrice } from "@/components/price-cells"
import { useLive, useMarket } from "@repo/react/MarketData"
import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { formatAmount, formatPrice, parseNum } from "@repo/core/format"

function CoinSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { id: string; symbol: string; name: string }[]
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("coin.selectLabel")}
        className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.symbol.toUpperCase()} · {c.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  )
}

const CRYPTO_QUICK = [0.01, 0.1, 0.5, 1, 5, 10, 100]
const USD_QUICK = [
  { v: 100, label: "$100" },
  { v: 1000, label: "$1k" },
  { v: 5000, label: "$5k" },
  { v: 10000, label: "$10k" },
  { v: 100000, label: "$100k" },
]

/* ------------------------------ 结果块拖拽调额 ------------------------------ */

/** 步进 ≈ 数量级的 1/10(0.5 → 0.01、100 → 1、$1000 → $100) */
function stepFor(v: number): number {
  return Math.pow(10, Math.floor(Math.log10(v)) - 1)
}

/** 按步进的有效小数位取整为干净字符串(0.1+0.01*3 → "0.13") */
function formatStep(v: number, step: number): string {
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return v.toFixed(dec)
}

/**
 * 结果块水平拖拽 → 按步进增减输入框金额(指针事件直接改 state,
 * 非 JS 逐帧位移动画;每次移动从按下时的起点重算,无闭包过期)。
 * 键盘路径不受影响:输入框本身始终可用。
 */
function useDragAdjust(amount: string, set: (v: string) => void) {
  const origin = useRef<{ x: number; start: number } | null>(null)
  return {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const cur = parseNum(amount)
      if (!Number.isFinite(cur) || cur <= 0) return
      origin.current = { x: e.clientX, start: cur }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const o = origin.current
      if (!o) return
      const step = stepFor(o.start)
      const next = Math.max(0, o.start + Math.round((e.clientX - o.x) / 8) * step)
      set(formatStep(next, step))
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      origin.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    },
  }
}

function DragHint() {
  return (
    <div className="type-meta mt-1.5 flex items-center gap-1 text-muted-foreground/60">
      <MoveHorizontal className="size-3 shrink-0" aria-hidden />
      {t("cv.dragHint")}
    </div>
  )
}

export function ConverterPage() {
  useT()
  usePageMeta({ title: t("meta.converter"), description: t("page.converter.desc") })
  const { snapshot, loading } = useMarket()
  const tickers = useLive()

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])
  const [cryptoId, setCryptoId] = useState("bitcoin")
  const [cryptoAmt, setCryptoAmt] = useState("1")
  const [usdTargetId, setUsdTargetId] = useState("ethereum")
  const [usdAmt, setUsdAmt] = useState("1000")
  // swap 累计旋转角:每次 +180°,transform transition 一次性转过去(不走 keyframes)
  const [swapTurns, setSwapTurns] = useState(0)

  const options = useMemo(
    () => coins.map((c) => ({ id: c.id, symbol: c.symbol, name: c.name })),
    [coins]
  )

  const priceOf = (id: string) => {
    const coin = coins.find((c) => c.id === id)
    if (!coin) return null
    return tickers[id]?.price ?? coin.current_price
  }

  const cryptoPrice = priceOf(cryptoId)
  const usdTargetPrice = priceOf(usdTargetId)
  const cryptoNum = parseFloat(cryptoAmt.replace(",", "."))
  const usdNum = parseFloat(usdAmt.replace(",", "."))

  const usdResult =
    cryptoPrice != null && Number.isFinite(cryptoNum) ? cryptoNum * cryptoPrice : null
  const coinResult =
    usdTargetPrice != null && Number.isFinite(usdNum) && usdTargetPrice > 0 ? usdNum / usdTargetPrice : null

  const activeCoin = coins.find((c) => c.id === cryptoId)
  const targetCoin = coins.find((c) => c.id === usdTargetId)

  /** 互换两侧币种(方向随之对调):左卡币种 ↔ 右卡目标币种,金额不动 */
  const swap = () => {
    setCryptoId(usdTargetId)
    setUsdTargetId(cryptoId)
    setSwapTurns((n) => n + 1)
  }

  const dragCrypto = useDragAdjust(cryptoAmt, setCryptoAmt)
  const dragUsd = useDragAdjust(usdAmt, setUsdAmt)

  if (loading && !snapshot) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
        <SkPageHeader title="w-40" desc="w-72" />
        <div className="grid gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <SkeletonCard key={i}>
              {/* 卡片头 */}
              <div className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-md bg-secondary/60" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-2 w-40 rounded-full bg-secondary/45" />
                </div>
              </div>
              {/* 输入行 + 快捷金额 */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Skeleton className="h-10 rounded-md" />
                <Skeleton className="h-10 rounded-md bg-secondary/60" />
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-9 w-12 rounded border border-border/50 bg-secondary/45" />
                ))}
              </div>
              {/* 结果块 */}
              <div className="mt-auto space-y-2.5 rounded-lg bg-secondary/45 p-4">
                <Skeleton className="h-2 w-20 rounded-full bg-secondary/60" />
                <Skeleton className="h-8 w-36 rounded-lg" />
                <Skeleton className="h-2 w-28 rounded-full bg-secondary/50" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="Converter"
        title={t("page.converter.title")}
        description={t("page.converter.desc")}
      />

      {/* 双卡 + 中列 swap:md+ 三列栅格,窄屏堆叠时 swap 行落两卡之间 */}
      <div className="grid items-stretch gap-4 md:grid-cols-[1fr_auto_1fr]">
        {/* 加密货币 → USD */}
        <Card className="h-full">
          <CardHeader>
            <CardHead
              title={
                <span className="flex items-center gap-2.5">
                  <IconChip className="border-primary/30 bg-primary/10 text-primary">
                    <Bitcoin />
                  </IconChip>
                  {t("cv.crypto2usd")}
                </span>
              }
              desc={t("cv.crypto2usdDesc")}
            />
          </CardHeader>
          <CardContent className="stagger flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label
                  htmlFor="cv-crypto-amount"
                  className="type-label mb-1 block text-muted-foreground"
                >
                  {t("cv.amount")}
                </label>
                <Input
                  id="cv-crypto-amount"
                  inputMode="decimal"
                  value={cryptoAmt}
                  onChange={(e) => setCryptoAmt(e.target.value)}
                  placeholder="0.00"
                  className="h-10 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="type-label mb-1 block text-muted-foreground">
                  {t("cv.asset")}
                </label>
                <CoinSelect value={cryptoId} onChange={setCryptoId} options={options} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {CRYPTO_QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setCryptoAmt(String(q))}
                  className="inline-flex h-9 items-center justify-center rounded border border-border px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>

            <div
              className="mt-auto cursor-ew-resize touch-pan-y rounded-lg bg-secondary/60 p-4 select-none"
              onPointerDown={dragCrypto.onPointerDown}
              onPointerMove={dragCrypto.onPointerMove}
              onPointerUp={dragCrypto.onPointerUp}
              onPointerCancel={dragCrypto.onPointerUp}
            >
              <div className="type-label text-muted-foreground">{t("cv.approxUsd")}</div>
              <div className="type-num-xl mt-1.5 break-all">
                {usdResult != null ? (
                  <AnimatedNumber value={usdResult} format={(v) => `$${formatPrice(v)}`} />
                ) : (
                  "—"
                )}
              </div>
              {activeCoin && cryptoPrice != null && (
                <div className="type-meta mt-1.5">
                  1 {activeCoin.symbol.toUpperCase()} = ${formatPrice(cryptoPrice)}
                </div>
              )}
              <DragHint />
            </div>
          </CardContent>
        </Card>

        {/* 中列:互换两侧币种 */}
        <div className="flex items-center justify-center md:px-1">
          <button
            type="button"
            aria-label={t("cv.swap")}
            title={t("cv.swap")}
            onClick={swap}
            className="focus-visible:ring-ring/40 flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-xs transition-[color,border-color] duration-150 hover:border-foreground/50 hover:text-foreground focus-visible:ring-2 focus-visible:outline-none"
          >
            <ArrowUpDown
              className="size-4"
              style={{
                transform: `rotate(${swapTurns * 180}deg)`,
                transition: "transform 0.4s var(--ease-soft)",
              }}
            />
          </button>
        </div>

        {/* USD → 加密货币 */}
        <Card className="h-full">
          <CardHeader>
            <CardHead
              title={
                <span className="flex items-center gap-2.5">
                  <IconChip className="border-primary/30 bg-primary/10 text-primary">
                    <DollarSign />
                  </IconChip>
                  {t("cv.usd2crypto")}
                </span>
              }
              desc={t("cv.usd2cryptoDesc")}
            />
          </CardHeader>
          <CardContent className="stagger flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label
                  htmlFor="cv-usd-amount"
                  className="type-label mb-1 block text-muted-foreground"
                >
                  {t("cv.usdAmount")}
                </label>
                <Input
                  id="cv-usd-amount"
                  inputMode="decimal"
                  value={usdAmt}
                  onChange={(e) => setUsdAmt(e.target.value)}
                  placeholder="1000"
                  className="h-10 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="type-label mb-1 block text-muted-foreground">
                  {t("cv.targetAsset")}
                </label>
                <CoinSelect value={usdTargetId} onChange={setUsdTargetId} options={options} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {USD_QUICK.map((q) => (
                <button
                  key={q.v}
                  type="button"
                  onClick={() => setUsdAmt(String(q.v))}
                  className="inline-flex h-9 items-center justify-center rounded border border-border px-3 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {q.label}
                </button>
              ))}
            </div>

            <div
              className="mt-auto cursor-ew-resize touch-pan-y rounded-lg bg-secondary/60 p-4 select-none"
              onPointerDown={dragUsd.onPointerDown}
              onPointerMove={dragUsd.onPointerMove}
              onPointerUp={dragUsd.onPointerUp}
              onPointerCancel={dragUsd.onPointerUp}
            >
              <div className="type-label text-muted-foreground">
                ≈ {targetCoin ? targetCoin.symbol.toUpperCase() : t("cv.coinFallback")}
              </div>
              <div className="type-num-xl mt-1.5 break-all">
                {coinResult != null ? (
                  <AnimatedNumber value={coinResult} format={(v) => formatAmount(v)} />
                ) : (
                  "—"
                )}
              </div>
              {targetCoin && usdTargetPrice != null && (
                <div className="type-meta mt-1.5">
                  $1,000 = {formatAmount(1000 / usdTargetPrice)} {targetCoin.symbol.toUpperCase()}
                </div>
              )}
              <DragHint />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快速换算参考:填充页面下部留白,提供常用面额速查 */}
      <Card>
        <CardHeader>
          <CardHead title={t("cv.quickTitle")} desc={t("cv.quickDesc")}>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span className="live-dot size-1.5 rounded-full bg-primary" />
              LIVE
            </span>
          </CardHead>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("common.col.asset")}</TableHead>
                <TableHead className="text-right">{t("cv.col.livePrice")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("cv.col.unitUsd")}</TableHead>
                <TableHead className="text-right">{t("cv.col.per1000")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">24H</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coins.slice(0, 10).map((c) => {
                const p = tickers[c.id]?.price ?? c.current_price
                const chg = tickers[c.id]?.changePct ?? c.price_change_percentage_24h_in_currency
                return (
                  <TableRow key={c.id} className="hover:bg-transparent">
                    <TableCell>
                      <AssetCell coin={c} />
                    </TableCell>
                    <TableCell className="text-right">
                      {tickers[c.id] ? <LivePrice price={p} /> : (
                        <span className="font-mono font-semibold tabular">${formatPrice(p)}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground sm:table-cell">
                      ${formatPrice(p)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold tabular">
                      {p > 0 ? formatAmount(1000 / p) : "—"}
                    </TableCell>
                    <TableCell className={`hidden text-right text-xs md:table-cell ${chg == null ? "" : chg >= 0 ? "text-up" : "text-down"}`}>
                      <span className="font-mono tabular">
                        {chg == null ? "—" : `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`}
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="text-center text-[10px] text-muted-foreground">
        {t("cv.disclaimer")}
      </p>
    </main>
  )
}
