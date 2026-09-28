import { memo } from "react"
import { Globe2, Layers, TrendingUp, Volume2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { StatStrip, type StatItem } from "@/components/ui/stat"
import { t, useT } from "@/i18n"
import type { GlobalData } from "@/lib/api"
import { formatPct, formatUsdCompact } from "@/lib/format"

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

  const chgUp = global.market_cap_change_24h_pct >= 0

  const items: StatItem[] = [
    {
      icon: Globe2,
      label: t("mo.mcap"),
      value: <AnimatedNumber value={global.total_market_cap_usd} format={formatUsdCompact} />,
      // 24H 子行涨跌色随快照刷新（快照重取后按新涨跌方向重新着色）
      sub: `24H ${formatPct(global.market_cap_change_24h_pct)}`,
      subTone: chgUp ? "up" : "down",
    },
    {
      icon: Volume2,
      label: t("mo.vol"),
      value: <AnimatedNumber value={global.total_volume_usd} format={formatUsdCompact} />,
      sub: t("mo.active", { n: global.active_cryptocurrencies.toLocaleString() }),
    },
    {
      icon: Layers,
      label: t("mo.dom"),
      value: (
        <AnimatedNumber value={global.btc_dominance} format={(v) => `${v.toFixed(1)}%`} />
      ),
      sub: `ETH ${global.eth_dominance.toFixed(1)}%`,
    },
    {
      icon: TrendingUp,
      label: t("mo.chg"),
      value: <AnimatedNumber value={global.market_cap_change_24h_pct} format={formatPct} />,
      // 涨跌只染数字：主读数与子行按方向着色
      tone: chgUp ? "up" : "down",
      sub: chgUp ? t("mo.inflow") : t("mo.outflow"),
    },
  ]

  return <StatStrip items={items} />
})
