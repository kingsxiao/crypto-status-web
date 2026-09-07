import { memo } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { Analysis } from "@/lib/indicators"
import { formatPrice } from "@/lib/format"

/** 牛熊状态卡：基于 200 日均线的趋势结构判定 */
export const RegimeCard = memo(function RegimeCard({ analysis }: { analysis: Analysis }) {
  const { regime, btc } = analysis

  const isBull = regime.state === "bull" || regime.state === "recovering"

  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
            牛熊周期
          </CardTitle>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
            MARKET REGIME
          </span>
        </div>
        <CardDescription className="text-xs">BTC 趋势结构 · 200 日均线体系</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <div className="flex items-end justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`size-2.5 rounded-full ${isBull ? "bg-up" : "bg-down"}`} />
              <span className="text-4xl font-bold tracking-wide">{regime.label}</span>
            </div>
            <div className="mt-1.5 font-mono text-xs text-muted-foreground">
              已持续 <span className="font-semibold text-foreground">{regime.days}</span> 天
            </div>
          </div>
          {/* 牛熊示意图：右半绿（牛）左半红（熊） */}
          <div className="flex h-16 items-end gap-1.5" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => {
              const bullSide = i >= 4
              const h = 14 + Math.abs(i - 4) * 11
              return (
                <div
                  key={i}
                  className={`w-2.5 rounded-sm transition-all ${
                    bullSide ? "bg-up" : "bg-down"
                  }`}
                  style={{ height: isBull ? h : 62 - h + 14, opacity: isBull === bullSide ? 1 : 0.35 }}
                />
              )
            })}
          </div>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">{regime.description}</p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">价格 vs MA200</span>
              <span className={`font-mono tabular ${regime.priceVsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.priceVsMa200 >= 0 ? "+" : ""}
                {regime.priceVsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, Math.max(0, 50 + regime.priceVsMa200))}
              aria-label="价格相对 200 日均线偏离度"
              indicatorClassName={regime.priceVsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">MA50 vs MA200</span>
              <span className={`font-mono tabular ${regime.ma50VsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.ma50VsMa200 >= 0 ? "+" : ""}
                {regime.ma50VsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, Math.max(0, 50 + regime.ma50VsMa200 * 2.5))}
              aria-label="50 日均线相对 200 日均线偏离度"
              indicatorClassName={regime.ma50VsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">BTC 现价</div>
              <div className="font-mono text-sm font-semibold tabular">${formatPrice(btc.price)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">MA50</div>
              <div className="font-mono text-sm font-semibold tabular text-muted-foreground">
                {btc.ma50 ? `$${formatPrice(btc.ma50)}` : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">MA200</div>
              <div className="font-mono text-sm font-semibold tabular text-muted-foreground">
                {btc.ma200 ? `$${formatPrice(btc.ma200)}` : "—"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
