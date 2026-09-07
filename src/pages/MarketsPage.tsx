import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, Star } from "lucide-react"

import { LivePrice, Pct } from "@/components/price-cells"
import { Sparkline } from "@/components/Sparkline"
import { PageHeader } from "@/components/layout/PageHeader"
import { TableSkeleton } from "@/components/loading"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/ui/segmented"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { useFavorites } from "@/hooks/useFavorites"
import { usePageMeta } from "@/hooks/usePageMeta"
import { STABLECOIN_IDS, type Coin } from "@/lib/api"
import { formatPct, formatPrice, formatUsdCompact } from "@/lib/format"
import { TRADE_SYMBOLS } from "@/lib/realtime"
import { prefetchRoute } from "@/lib/routePrefetch"
import { cn } from "@/lib/utils"

type SortKey =
  | "rank"
  | "price"
  | "chg1h"
  | "chg24h"
  | "chg7d"
  | "chg30d"
  | "marketCap"
  | "volume"
  | "ath"

type SortDir = "asc" | "desc"

function coinValue(c: Coin, key: SortKey, livePrice: number | null): number {
  switch (key) {
    case "rank":
      return c.market_cap_rank
    case "price":
      return livePrice ?? c.current_price
    case "chg1h":
      return c.price_change_percentage_1h_in_currency ?? 0
    case "chg24h":
      return c.price_change_percentage_24h_in_currency ?? 0
    case "chg7d":
      return c.price_change_percentage_7d_in_currency ?? 0
    case "chg30d":
      return c.price_change_percentage_30d_in_currency ?? 0
    case "marketCap":
      return c.market_cap
    case "volume":
      return c.total_volume
    case "ath":
      return c.ath_change_percentage ?? -Infinity
  }
}

function SortHead({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string
  sortKey: SortKey
  active: boolean
  dir: SortDir
  onSort: (k: SortKey) => void
  className?: string
}) {
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <TableHead className={className}>
      <button
        className={cn(
          "inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </button>
    </TableHead>
  )
}

function WatchStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={active ? "移除自选" : "加入自选"}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      className={cn(
        "transition-colors",
        active ? "text-foreground" : "text-muted-foreground/30 hover:text-foreground"
      )}
    >
      <Star className={cn("size-3.5", active && "fill-current")} />
    </button>
  )
}

export function MarketsPage() {
  usePageMeta({ title: "行情 · CRYPTO STATUS" })
  const { snapshot, loading } = useMarket()
  const tickers = useLive()
  const navigate = useNavigate()
  const { has, toggle } = useFavorites()

  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<"all" | "tradeable" | "favorites">("all")
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = coins
    if (scope === "tradeable") list = list.filter((c) => !STABLECOIN_IDS.has(c.id))
    if (scope === "favorites") list = list.filter((c) => has(c.id))
    if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q))
    const sorted = [...list].sort((a, b) => {
      const d = coinValue(a, sortKey, tickers[a.id]?.price ?? null) - coinValue(b, sortKey, tickers[b.id]?.price ?? null)
      return sortDir === "asc" ? d : -d
    })
    return sorted
  }, [coins, query, scope, sortKey, sortDir, tickers, has])

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      // 涨跌幅/市值默认从高到低，排名从低到高
      setSortDir(k === "rank" ? "asc" : "desc")
    }
  }

  // 市场广度：24h 涨跌家数（剔稳定币）
  const breadth = useMemo(() => {
    const pcts = coins
      .filter((c) => !STABLECOIN_IDS.has(c.id))
      .map((c) => tickers[c.id]?.changePct ?? c.price_change_percentage_24h_in_currency ?? 0)
    if (!pcts.length) return null
    const up = pcts.filter((v) => v > 0).length
    const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length
    return { up, down: pcts.length - up, total: pcts.length, avg }
  }, [coins, tickers])

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      {/* 页头：搜索 + 范围筛选 */}
      <PageHeader
        en="Markets"
        title="行情"
        description={
          breadth ? (
            <>
              24H 上涨 <span className="font-mono text-up">{breadth.up}</span> · 下跌{" "}
              <span className="font-mono text-down">{breadth.down}</span> · 平均{" "}
              <span className={cn("font-mono", breadth.avg >= 0 ? "text-up" : "text-down")}>
                {breadth.avg >= 0 ? "+" : ""}
                {breadth.avg.toFixed(2)}%
              </span>
            </>
          ) : (
            "全市场主流资产实时报价"
          )
        }
      >
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索币种 / 代码"
            className="h-8 w-44 pl-8 font-mono text-xs"
          />
        </div>
        <Segmented
          label="行情范围"
          value={scope}
          onChange={(v) => setScope(v)}
          items={[
            { value: "all", label: "全部" },
            { value: "tradeable", label: "剔除稳定币" },
            { value: "favorites", label: "自选" },
          ]}
        />
      </PageHeader>

      {/* 行情表 */}
      {loading && !snapshot ? (
      <Card className="fade-up">
        <CardContent className="px-6 py-4">
          <TableSkeleton rows={10} showSparkline />
        </CardContent>
      </Card>
      ) : (
      <Card className="fade-up">
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-semibold">
                {coins.length === 0
                  ? "行情数据暂不可用"
                  : scope === "favorites"
                    ? "自选列表为空"
                    : "没有匹配的币种"}
              </p>
              <p className="max-w-xs text-xs text-muted-foreground">
                {coins.length === 0
                  ? "数据源暂时无法访问，正在自动重试，也可点击右上角刷新"
                  : scope === "favorites"
                    ? "点击表格中的星标将币种加入自选，数据保存在本地浏览器"
                    : "试试其他关键词，或清空搜索条件"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8">
                    <span className="sr-only">自选</span>
                  </TableHead>
                  <SortHead label="#" sortKey="rank" active={sortKey === "rank"} dir={sortDir} onSort={onSort} className="w-14 text-center" />
                  <TableHead>资产</TableHead>
                  <SortHead label="价格 USD" sortKey="price" active={sortKey === "price"} dir={sortDir} onSort={onSort} className="text-right" />
                  <SortHead label="1H" sortKey="chg1h" active={sortKey === "chg1h"} dir={sortDir} onSort={onSort} className="text-right" />
                  <SortHead label="24H" sortKey="chg24h" active={sortKey === "chg24h"} dir={sortDir} onSort={onSort} className="text-right" />
                  <SortHead label="7D" sortKey="chg7d" active={sortKey === "chg7d"} dir={sortDir} onSort={onSort} className="text-right" />
                  <SortHead label="30D" sortKey="chg30d" active={sortKey === "chg30d"} dir={sortDir} onSort={onSort} className="hidden text-right sm:table-cell" />
                  <SortHead label="市值" sortKey="marketCap" active={sortKey === "marketCap"} dir={sortDir} onSort={onSort} className="hidden text-right md:table-cell" />
                  <SortHead label="24H额" sortKey="volume" active={sortKey === "volume"} dir={sortDir} onSort={onSort} className="hidden text-right lg:table-cell" />
                  <SortHead label="距ATH" sortKey="ath" active={sortKey === "ath"} dir={sortDir} onSort={onSort} className="hidden text-right xl:table-cell" />
                  <TableHead className="hidden w-[132px] md:table-cell">7日走势</TableHead>
                  <TableHead className="w-6">
                    <span className="sr-only">详情</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const t = tickers[c.id]
                  const price = t?.price ?? c.current_price
                  const chg24 = t?.changePct ?? c.price_change_percentage_24h_in_currency
                  const hasDetail = !!TRADE_SYMBOLS[c.id]
                  const spark = c.sparkline_in_7d?.price ?? []
                  const chg7 = c.price_change_percentage_7d_in_currency ?? 0
                  return (
                    <TableRow
                      key={c.id}
                      onClick={() => hasDetail && navigate(`/coin/${c.id}`)}
                      onPointerEnter={() => hasDetail && prefetchRoute(`/coin/${c.id}`)}
                      tabIndex={hasDetail ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (hasDetail && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault()
                          navigate(`/coin/${c.id}`)
                        }
                      }}
                      className={cn(
                        hasDetail && "row-link",
                        hasDetail ? "cursor-pointer" : "cursor-default opacity-80",
                        hasDetail && "hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                      )}
                    >
                      <TableCell>
                        <WatchStar active={has(c.id)} onToggle={() => toggle(c.id)} />
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {c.market_cap_rank}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <img
                            src={c.image}
                            alt=""
                            className="size-7 rounded-full border bg-background object-cover grayscale contrast-125"
                            loading="lazy"
                            decoding="async"
                            width={28}
                            height={28}
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold leading-tight">{c.name}</span>
                            <span className="font-mono text-[10px] leading-tight text-muted-foreground uppercase">
                              {c.symbol}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {t ? <LivePrice price={price} /> : <span className="font-mono font-semibold tabular">${formatPrice(price)}</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        <Pct v={c.price_change_percentage_1h_in_currency} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Pct v={chg24} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Pct v={c.price_change_percentage_7d_in_currency} />
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">
                        <Pct v={c.price_change_percentage_30d_in_currency} />
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground md:table-cell">
                        {formatUsdCompact(c.market_cap)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground lg:table-cell">
                        {formatUsdCompact(c.total_volume)}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs tabular xl:table-cell">
                        <span className={c.ath_change_percentage != null && c.ath_change_percentage >= -20 ? "text-up" : "text-muted-foreground"}>
                          {formatPct(c.ath_change_percentage, 1)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div
                          className={`ml-auto w-fit ${chg7 >= 0 ? "text-up" : "text-down"}`}
                        >
                          <Sparkline data={spark} width={120} height={34} />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground/70">
                        {hasDetail ? <ChevronRight className="size-3.5" /> : <span className="block text-center font-mono text-[9px] text-muted-foreground">稳定币</span>}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </main>
  )
}
