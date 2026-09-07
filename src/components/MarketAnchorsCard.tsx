import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  const rows = MARKET_ANCHORS.map((a) => {
    // crypto 行走实时总市值；其余为静态锚。归一化出 boolean 供下方统一判断
    const live = a.key === "crypto"
    return { ...a, live, value: live ? cryptoMcap : a.value }
  })
  const hasLive = cryptoMcap > 0
  const max = Math.max(...rows.map((r) => r.value))
  const gold = rows.find((r) => r.key === "gold")

  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            体量参照
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            MARKET ANCHORS
          </Badge>
        </div>
        <CardDescription className="text-xs">
          加密总市值（实时）相对传统资产锚的体量 · 参考锚为 2026-09 常量
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {!hasLive && (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-center text-[11px] text-muted-foreground">
            加密总市值暂不可得（行情源限流），恢复后自动显示
          </p>
        )}
        {rows.map((r) => (
          <div key={r.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={cn("font-medium", r.live && "font-semibold text-primary")}>
                {r.name}
                {r.live && <span className="ml-1.5 font-mono text-[9px] text-primary/70">LIVE</span>}
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
                加密 = {r.name}的 {((cryptoMcap / r.value) * 100).toFixed(1)}%
              </div>
            )}
          </div>
        ))}

        {hasLive && gold && (
          <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground">
            加密总市值约为黄金的 {((cryptoMcap / gold.value) * 100).toFixed(1)}%、美国 M2 的{" "}
            {((cryptoMcap / (MARKET_ANCHORS.find((a) => a.key === "m2")?.value ?? 1)) * 100).toFixed(1)}%
            。资金在加密与传统资产间的相对体量，决定了「外溢/回流」叙事的空间。
          </p>
        )}
      </CardContent>
    </Card>
  )
})
