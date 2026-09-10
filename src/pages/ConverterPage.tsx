import { useMemo, useState } from "react"
import { Bitcoin, ChevronDown, DollarSign } from "lucide-react"

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
import { useLive, useMarket } from "@/context/MarketDataContext"
import { t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { formatAmount, formatPrice } from "@/lib/format"

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
        className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
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

const QUICK = [0.1, 0.5, 1, 10, 100]

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
                <Skeleton className="h-11 rounded-md" />
                <Skeleton className="h-11 rounded-md bg-secondary/60" />
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-7 w-11 rounded border border-border/50 bg-secondary/45" />
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

      <div className="fade-up grid items-stretch gap-4 md:grid-cols-2" style={{ animationDelay: "60ms" }}>
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
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label
                  htmlFor="cv-crypto-amount"
                  className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
                >
                  {t("cv.amount")}
                </label>
                <Input
                  id="cv-crypto-amount"
                  inputMode="decimal"
                  value={cryptoAmt}
                  onChange={(e) => setCryptoAmt(e.target.value)}
                  placeholder="0.00"
                  className="h-11 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("cv.asset")}
                </label>
                <CoinSelect value={cryptoId} onChange={setCryptoId} options={options} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setCryptoAmt(String(q))}
                  className="rounded border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="mt-auto rounded-lg bg-secondary/60 p-4">
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                {t("cv.approxUsd")}
              </div>
              <div className="mt-1 font-mono text-3xl font-bold tabular break-all">
                {usdResult != null ? `$${formatPrice(usdResult)}` : "—"}
              </div>
              {activeCoin && cryptoPrice != null && (
                <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                  1 {activeCoin.symbol.toUpperCase()} = ${formatPrice(cryptoPrice)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

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
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label
                  htmlFor="cv-usd-amount"
                  className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
                >
                  {t("cv.usdAmount")}
                </label>
                <Input
                  id="cv-usd-amount"
                  inputMode="decimal"
                  value={usdAmt}
                  onChange={(e) => setUsdAmt(e.target.value)}
                  placeholder="1000"
                  className="h-11 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  {t("cv.targetAsset")}
                </label>
                <CoinSelect value={usdTargetId} onChange={setUsdTargetId} options={options} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[100, 1000, 10000].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setUsdAmt(String(q))}
                  className="rounded border border-border px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  ${q.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="mt-auto rounded-lg bg-secondary/60 p-4">
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                ≈ {targetCoin ? targetCoin.symbol.toUpperCase() : t("cv.coinFallback")}
              </div>
              <div className="mt-1 font-mono text-3xl font-bold tabular break-all">
                {coinResult != null ? formatAmount(coinResult) : "—"}
              </div>
              {targetCoin && usdTargetPrice != null && (
                <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                  $1,000 = {formatAmount(1000 / usdTargetPrice)} {targetCoin.symbol.toUpperCase()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快速换算参考：填充页面下部留白，提供常用面额速查 */}
      <Card className="fade-up" style={{ animationDelay: "120ms" }}>
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

      <p className="fade-up text-center text-[10px] text-muted-foreground" style={{ animationDelay: "120ms" }}>
        {t("cv.disclaimer")}
      </p>
    </main>
  )
}
