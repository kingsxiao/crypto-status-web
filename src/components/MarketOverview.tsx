import { memo } from "react"
import { Globe2, Layers, TrendingUp, Volume2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { t, useT } from "@/i18n"
import type { GlobalData } from "@/lib/api"
import { formatPct, formatUsdCompact } from "@/lib/format"
import { cn } from "@/lib/utils"

/** 全球市场概览条（CoinGecko 限流时降级为提示条） */
export const MarketOverview = memo(function MarketOverview({ global }: { global: GlobalData }) {
  useT()
  const available = global.total_market_cap_usd > 0

  if (!available) {
    return (
      <Card className="py-0">
        <CardContent className="flex items-center justify-center gap-2 px-5 py-5 text-xs text-muted-foreground">
          <Globe2 className="size-4 shrink-0" strokeWidth={2} />
          {t("mo.unavailable")}
        </CardContent>
      </Card>
    )
  }

  const items = [
    {
      icon: Globe2,
      label: t("mo.mcap"),
      value: formatUsdCompact(global.total_market_cap_usd),
      sub: `24H ${formatPct(global.market_cap_change_24h_pct)}`,
      subUp: global.market_cap_change_24h_pct >= 0,
    },
    {
      icon: Volume2,
      label: t("mo.vol"),
      value: formatUsdCompact(global.total_volume_usd),
      sub: t("mo.active", { n: global.active_cryptocurrencies.toLocaleString() }),
    },
    {
      icon: Layers,
      label: t("mo.dom"),
      value: `${global.btc_dominance.toFixed(1)}%`,
      sub: `ETH ${global.eth_dominance.toFixed(1)}%`,
    },
    {
      icon: TrendingUp,
      label: t("mo.chg"),
      value: formatPct(global.market_cap_change_24h_pct),
      sub: global.market_cap_change_24h_pct >= 0 ? t("mo.inflow") : t("mo.outflow"),
      subUp: global.market_cap_change_24h_pct >= 0,
    },
  ]

  return (
    <Card className="py-0">
      <CardContent className="grid grid-cols-2 px-0 md:grid-cols-4 md:divide-x md:divide-border/60 md:py-0">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={cn(
              "flex flex-col gap-2 px-4 py-5 md:px-5",
              // 移动端 2×2 手动补分隔线（md 起由 divide-x 接管）
              i % 2 === 1 && "border-l border-border/60 md:border-l-0",
              i >= 2 && "border-t border-border/60 md:border-t-0",
            )}
          >
            <div className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <IconChip><it.icon strokeWidth={2} /></IconChip>
              <span className="truncate" title={it.label}>{it.label}</span>
            </div>
            <div className="font-mono text-xl font-bold tabular">{it.value}</div>
            <div
              className={`font-mono text-[11px] ${
                it.subUp === undefined
                  ? "text-muted-foreground"
                  : it.subUp
                    ? "text-up"
                    : "text-down"
              }`}
            >
              {it.sub}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
})
