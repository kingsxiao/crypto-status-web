import { memo } from "react"
import { Globe2, Layers, TrendingUp, Volume2 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { GlobalData } from "@/lib/api"
import { formatPct, formatUsdCompact } from "@/lib/format"

/** 全球市场概览条（CoinGecko 限流时降级为提示条） */
export const MarketOverview = memo(function MarketOverview({ global }: { global: GlobalData }) {
  const available = global.total_market_cap_usd > 0

  if (!available) {
    return (
      <Card className="py-0">
        <CardContent className="flex items-center justify-center gap-2 px-5 py-5 text-xs text-muted-foreground">
          <Globe2 className="size-4 shrink-0" strokeWidth={2} />
          全球市场概况暂不可用（数据源限流），实时行情与信号不受影响
        </CardContent>
      </Card>
    )
  }

  const items = [
    {
      icon: Globe2,
      label: "加密总市值",
      value: formatUsdCompact(global.total_market_cap_usd),
      sub: `24H ${formatPct(global.market_cap_change_24h_pct)}`,
      subUp: global.market_cap_change_24h_pct >= 0,
    },
    {
      icon: Volume2,
      label: "24H 总成交额",
      value: formatUsdCompact(global.total_volume_usd),
      sub: `${global.active_cryptocurrencies.toLocaleString()} 个活跃标的`,
    },
    {
      icon: Layers,
      label: "BTC 占比",
      value: `${global.btc_dominance.toFixed(1)}%`,
      sub: `ETH ${global.eth_dominance.toFixed(1)}%`,
    },
    {
      icon: TrendingUp,
      label: "市值 24H 变化",
      value: formatPct(global.market_cap_change_24h_pct),
      sub: global.market_cap_change_24h_pct >= 0 ? "资金净流入" : "资金净流出",
      subUp: global.market_cap_change_24h_pct >= 0,
    },
  ]

  return (
    <Card className="py-0">
      <CardContent className="grid grid-cols-2 divide-x md:grid-cols-4 md:py-0">
        {items.map((it, i) => (
          <div
            key={it.label}
            className={`flex flex-col gap-1.5 px-5 py-5 ${i >= 2 ? "border-t md:border-t-0" : ""} ${
              i === 2 ? "border-t-0" : ""
            }`}
          >
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <it.icon className="size-3.5" strokeWidth={2} />
              {it.label}
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
