import { memo } from "react"
import { Anchor } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { t, useT } from "@/i18n"
import { MARKET_ANCHORS } from "@/lib/crossAsset"
import { formatUsdCompact } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * 体量参照：加密总市值（实时）与黄金 / 美股 / M2 等传统资产锚的对比。
 * 参考锚为慢变常量（asof 2026-09），仅用于数量级对比。
 */
export const MarketAnchorsCard = memo(function MarketAnchorsCard({
  cryptoMcap,
}: {
  cryptoMcap: number
}) {
  useT()
  const rows = MARKET_ANCHORS.map((a) => {
    // crypto 行走实时总市值；其余为静态锚。归一化出 boolean 供下方统一判断
    const live = a.key === "crypto"
    return { ...a, live, value: live ? cryptoMcap : a.value }
  })
  const hasLive = cryptoMcap > 0
  const max = Math.max(...rows.map((r) => r.value))
  const gold = rows.find((r) => r.key === "gold")
  const m2 = rows.find((r) => r.key === "m2")

  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <CardKicker
          icon={Anchor}
          title={t("ma.title")}
          en="MARKET ANCHORS"
          desc={t("ma.desc")}
        />
      </CardHeader>

      <CardContent className="space-y-3">
        {!hasLive && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
            {t("ma.unavailable")}
          </p>
        )}
        {rows.map((r) => (
          <div key={r.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={cn("font-medium", r.live && "font-semibold text-primary")}>
                {t(r.nameKey)}
                {r.live && <span className="ml-1.5 font-mono text-[10px] text-primary/70">LIVE</span>}
              </span>
              <span className="font-mono tabular text-muted-foreground">
                {formatUsdCompact(r.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  r.live ? "bg-primary" : "bg-primary/25",
                )}
                style={{ width: `${Math.max((r.value / max) * 100, 1.2)}%` }}
              />
            </div>
            {!r.live && hasLive && (
              <div className="text-right font-mono text-[10px] text-muted-foreground">
                {t("ma.ratio", { name: t(r.nameKey), pct: ((cryptoMcap / r.value) * 100).toFixed(1) })}
              </div>
            )}
          </div>
        ))}

        {hasLive && gold && m2 && (
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t("ma.summary", {
              gold: ((cryptoMcap / gold.value) * 100).toFixed(1),
              m2: ((cryptoMcap / m2.value) * 100).toFixed(1),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  )
})
