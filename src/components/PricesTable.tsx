import { memo, useMemo, useState } from "react"
import { ChevronRight, Star } from "lucide-react"

import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Segmented } from "@/components/ui/segmented"
import { AssetCell, LivePrice, Pct } from "@/components/price-cells"
import { Sparkline } from "@/components/Sparkline"
import { t, useT } from "@/i18n"
import { STABLECOIN_IDS, type Coin } from "@/lib/api"
import type { LiveTicker } from "@/lib/realtime"
import { formatPct, formatPrice, formatUsdCompact } from "@/lib/format"
import { TRADE_SYMBOLS } from "@/lib/realtime"
import { prefetchRoute } from "@/lib/routePrefetch"
import { useFavorites } from "@/hooks/useFavorites"
import { useRowNav } from "@/hooks/useRowNav"
import { cn } from "@/lib/utils"

/** 自选星标（与行情页同款交互；aria 标签复用 markets.* 既有文案） */
function WatchStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      aria-label={active ? t("markets.removeFav") : t("markets.addFav")}
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

type Scope = "all" | "tradeable" | "favorites"

export const PricesTable = memo(function PricesTable({
  coins,
  live,
  onSelect,
}: {
  coins: Coin[]
  live: Record<string, LiveTicker>
  onSelect: (coin: Coin) => void
}) {
  useT()
  const [scope, setScope] = useState<Scope>("all")
  const { has, toggle } = useFavorites()

  const list = useMemo(() => {
    if (scope === "tradeable") return coins.filter((c) => !STABLECOIN_IDS.has(c.id))
    if (scope === "favorites") return coins.filter((c) => has(c.id))
    return coins
  }, [coins, scope, has])

  // 键盘行导航（基础层 useRowNav）：只标记可点行（有交易所详情的币），
  // onActivate 的索引即「可点行」序，故先备好可点行列表
  const clickable = useMemo(() => list.filter((c) => !!TRADE_SYMBOLS[c.id]), [list])
  const nav = useRowNav({ count: clickable.length, onActivate: (i) => onSelect(clickable[i]) })

  return (
    <Card>
      <CardHeader>
        <CardHead title={t("pt.title")} desc={t("pt.desc")}>
          <Segmented
            label={t("common.scopeLabel")}
            value={scope}
            onChange={(v) => setScope(v)}
            items={[
              { value: "all", label: t("common.scope.all") },
              { value: "tradeable", label: t("common.scope.tradeable") },
              { value: "favorites", label: t("common.scope.favorites") },
            ]}
          />
        </CardHead>
      </CardHeader>

      <CardContent>
        {scope === "favorites" && list.length === 0 ? (
          /* 空态：图标 + 标题 + 说明（文案复用行情页自选空态既有 key） */
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
            <Star className="size-5 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-semibold">{t("markets.empty.fav")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">{t("markets.empty.favDesc")}</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-6 pl-1.5 pr-0 sm:pl-3 sm:pr-3">
                  <span className="sr-only">{t("common.col.favSr")}</span>
                </TableHead>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead>{t("common.col.asset")}</TableHead>
                <TableHead className="text-right">{t("common.col.price")}</TableHead>
                <TableHead className="text-right">1H</TableHead>
                <TableHead className="text-right">24H</TableHead>
                <TableHead className="text-right">7D</TableHead>
                <TableHead className="text-right">30D</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t("common.col.mcap")}</TableHead>
                <TableHead className="hidden text-right xl:table-cell">{t("common.col.ath")}</TableHead>
                <TableHead className="hidden w-[132px] md:table-cell">{t("common.col.trend7")}</TableHead>
                <TableHead className="w-6">
                  <span className="sr-only">{t("common.col.detailSr")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody onKeyDown={nav.onKeyDown}>
              {list.map((c) => {
                const tk = live[c.id]
                const price = tk?.price ?? c.current_price
                const chg24 = tk?.changePct ?? c.price_change_percentage_24h_in_currency
                const hasDetail = !!TRADE_SYMBOLS[c.id]
                const spark = c.sparkline_in_7d?.price ?? []
                const chg7 = c.price_change_percentage_7d_in_currency ?? 0
                return (
                  <TableRow
                    key={c.id}
                    onClick={() => hasDetail && onSelect(c)}
                    onPointerEnter={() => hasDetail && prefetchRoute(`/coin/${c.id}`)}
                    tabIndex={hasDetail ? 0 : undefined}
                    data-row-nav-row={hasDetail ? true : undefined}
                    className={cn(
                      hasDetail && "row-link",
                      hasDetail ? "cursor-pointer" : "cursor-default opacity-80",
                      hasDetail && "hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                    )}
                  >
                    <TableCell className="pl-1.5 pr-0 sm:pl-3 sm:pr-3">
                      <WatchStar active={has(c.id)} onToggle={() => toggle(c.id)} />
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {c.market_cap_rank}
                    </TableCell>
                    <TableCell>
                      <AssetCell coin={c} />
                    </TableCell>
                    <TableCell className="text-right">
                      {tk ? <LivePrice price={price} /> : <span className="type-num">${formatPrice(price)}</span>}
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
                    <TableCell className="text-right hidden sm:table-cell">
                      <Pct v={c.price_change_percentage_30d_in_currency} />
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      <span className="type-num text-xs text-muted-foreground">
                        {formatUsdCompact(c.market_cap)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right xl:table-cell">
                      <span
                        className={cn(
                          "type-num text-xs",
                          c.ath_change_percentage != null && c.ath_change_percentage >= -20
                            ? "text-up"
                            : "text-muted-foreground"
                        )}
                      >
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
                      {hasDetail ? <ChevronRight className="size-3.5" /> : <span className="block text-center font-mono text-[10px] text-muted-foreground">{t("common.stablecoin")}</span>}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
})
