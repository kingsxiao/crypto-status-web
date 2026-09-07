import { memo, useState } from "react"
import { ChevronRight } from "lucide-react"

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
import { cn } from "@/lib/utils"

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
  const [scope, setScope] = useState<"all" | "tradeable">("all")
  const list = scope === "tradeable" ? coins.filter((c) => !STABLECOIN_IDS.has(c.id)) : coins

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
            ]}
          />
        </CardHead>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
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
          <TableBody>
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
                  onKeyDown={(e) => {
                    if (hasDetail && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault()
                      onSelect(c)
                    }
                  }}
                  className={cn(
                    hasDetail && "row-link",
                    hasDetail ? "cursor-pointer" : "cursor-default opacity-80",
                    hasDetail && "hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
                  )}
                >
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {c.market_cap_rank}
                  </TableCell>
                  <TableCell>
                    <AssetCell coin={c} />
                  </TableCell>
                  <TableCell className="text-right">
                    {tk ? <LivePrice price={price} /> : <span className="font-mono font-semibold tabular">${formatPrice(price)}</span>}
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
                  <TableCell className="hidden text-right font-mono text-xs tabular text-muted-foreground lg:table-cell">
                    {formatUsdCompact(c.market_cap)}
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
                    {hasDetail ? <ChevronRight className="size-3.5" /> : <span className="block text-center font-mono text-[10px] text-muted-foreground">{t("common.stablecoin")}</span>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
})
