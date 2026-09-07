import { memo } from "react"
import { TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { t, useT } from "@/i18n"
import { REGIME_KEY, type Analysis } from "@/lib/indicators"
import { formatPrice } from "@/lib/format"

/** 牛熊状态卡：基于 200 日均线的趋势结构判定 */
export const RegimeCard = memo(function RegimeCard({ analysis }: { analysis: Analysis }) {
  useT()
  const { regime, btc } = analysis

  const isBull = regime.state === "bull" || regime.state === "recovering"
  const regimeMeta = REGIME_KEY[regime.state]

  return (
    <Card className="h-full">
      <CardHeader className="pb-0">
        <CardKicker
          icon={TrendingUp}
          title={t("rg.title")}
          en="MARKET REGIME"
          desc={t("rg.desc")}
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-5">
        <div className="flex items-end justify-between gap-4 pb-1">
          <div>
            <div className="flex items-center gap-2.5">
              <span className={`size-2.5 rounded-full ${isBull ? "bg-up" : "bg-down"}`} />
              <span className="text-4xl font-bold tracking-wide">{t(regimeMeta.label)}</span>
            </div>
            <div className="mt-1.5 font-mono text-xs text-muted-foreground">
              {t("rg.daysPre")} <span className="font-semibold text-foreground">{regime.days}</span> {t("rg.daysPost")}
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

        <p className="text-xs leading-relaxed text-muted-foreground">{t(regimeMeta.desc)}</p>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("rg.priceVsMa")}</span>
              <span className={`font-mono tabular ${regime.priceVsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.priceVsMa200 >= 0 ? "+" : ""}
                {regime.priceVsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, Math.max(0, 50 + regime.priceVsMa200))}
              aria-label={t("rg.priceMaAria")}
              indicatorClassName={regime.priceVsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("rg.maVsMa")}</span>
              <span className={`font-mono tabular ${regime.ma50VsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.ma50VsMa200 >= 0 ? "+" : ""}
                {regime.ma50VsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={Math.min(100, Math.max(0, 50 + regime.ma50VsMa200 * 2.5))}
              aria-label={t("rg.maAria")}
              indicatorClassName={regime.ma50VsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("rg.btcPrice")}</div>
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
