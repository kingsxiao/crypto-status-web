import { useMemo, useState } from "react"
import { ArrowLeftRight } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/layout/PageHeader"
import { Input } from "@/components/ui/input"
import { SkeletonCard, SkPageHeader } from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { usePageMeta } from "@/hooks/usePageMeta"
import { formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/** 自适应位数的数量格式化：大数带千分位，小数最多 8 位有效 */
function formatAmount(v: number): string {
  if (!Number.isFinite(v)) return "—"
  if (v === 0) return "0"
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 8 })
  return v.toPrecision(4).replace(/\.?0+$/, "")
}

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
        aria-label="选择币种"
        className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.symbol.toUpperCase()} · {c.name}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">▾</span>
    </div>
  )
}

const QUICK = [0.1, 0.5, 1, 10, 100]

export function ConverterPage() {
  usePageMeta({ title: "换算器 · CRYPTO STATUS" })
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
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
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
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="Converter"
        title="换算器"
        description="基于实时价格 · WebSocket 实时推送（退化为快照价格）"
      />

      <div className="fade-up grid gap-4 md:grid-cols-2" style={{ animationDelay: "60ms" }}>
        {/* 加密货币 → USD */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className={cn("flex size-6 items-center justify-center rounded-md border")}>
                <ArrowLeftRight className="size-3.5" />
              </span>
              加密货币 → 美元
            </CardTitle>
            <CardDescription>输入数量，按实时价格折算 USD</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  数量
                </label>
                <Input
                  inputMode="decimal"
                  value={cryptoAmt}
                  onChange={(e) => setCryptoAmt(e.target.value)}
                  placeholder="0.00"
                  className="h-11 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  币种
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

            <div className="rounded-lg bg-secondary/60 p-4">
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                ≈ 美元 USD
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="flex size-6 items-center justify-center rounded-md border">
                <span className="font-mono text-[11px] font-bold">$</span>
              </span>
              美元 → 加密货币
            </CardTitle>
            <CardDescription>输入 USD 金额，折算能得到多少币</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-[1fr_1fr] gap-2">
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  金额 USD
                </label>
                <Input
                  inputMode="decimal"
                  value={usdAmt}
                  onChange={(e) => setUsdAmt(e.target.value)}
                  placeholder="1000"
                  className="h-11 font-mono text-lg font-semibold tabular"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                  目标币种
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

            <div className="rounded-lg bg-secondary/60 p-4">
              <div className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
                ≈ {targetCoin ? targetCoin.symbol.toUpperCase() : "币"}
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

      <p className="fade-up text-center text-[10px] text-muted-foreground" style={{ animationDelay: "120ms" }}>
        价格来自公开交易所实时行情，未包含任何交易手续费与滑点，结果仅供参考。
      </p>
    </main>
  )
}
