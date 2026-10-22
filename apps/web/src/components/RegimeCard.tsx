import { memo, useEffect, useState, type CSSProperties } from "react"
import { TrendingUp } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { REGIME_KEY, type Analysis } from "@repo/core/indicators"
import { formatPrice } from "@repo/core/format"

/** 牛熊状态卡：基于 200 日均线的趋势结构判定 */
export const RegimeCard = memo(function RegimeCard({ analysis }: { analysis: Analysis }) {
  useT()
  const { regime, btc } = analysis

  const isBull = regime.state === "bull" || regime.state === "recovering"
  const regimeMeta = REGIME_KEY[regime.state]

  // 挂载一次性编排：牛熊柱 scaleY 生长、两条 Progress 从中性位（50）推进到目标。
  // mounted 翻转走 useEffect（与基础层 Gauge 同款时序）：首帧呈现初值，次帧起过渡
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const priceVal = Math.min(100, Math.max(0, 50 + regime.priceVsMa200))
  const maVal = Math.min(100, Math.max(0, 50 + regime.ma50VsMa200 * 2.5))

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
            <div className="type-meta mt-1.5">
              {t("rg.daysPre")} <span className="type-num text-foreground">{regime.days}</span> {t("rg.daysPost")}
            </div>
          </div>
          {/* 牛熊示意图：右半绿（牛）左半红（熊）；纯装饰，窄屏让位给状态大字。
              挂载时自底向上生长（.bar-grow，45ms/列波浪）；此后牛熊切换由
              height/opacity 过渡承担（450ms 状态切换档） */}
          <div className="hidden h-16 items-end gap-1.5 sm:flex" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => {
              const bullSide = i >= 4
              const h = 14 + Math.abs(i - 4) * 11
              return (
                <div
                  key={i}
                  className={`bar-grow w-2.5 rounded-sm transition-[height,opacity] duration-[450ms] ease-[cubic-bezier(0.21,1,0.33,1)] ${
                    bullSide ? "bg-up" : "bg-down"
                  }`}
                  style={{ height: isBull ? h : 62 - h + 14, opacity: isBull === bullSide ? 1 : 0.35, "--i": i } as CSSProperties}
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
              <span className={`type-num ${regime.priceVsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.priceVsMa200 >= 0 ? "+" : ""}
                {regime.priceVsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={mounted ? priceVal : 50}
              aria-label={t("rg.priceMaAria")}
              indicatorClassName={regime.priceVsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{t("rg.maVsMa")}</span>
              <span className={`type-num ${regime.ma50VsMa200 >= 0 ? "text-up" : "text-down"}`}>
                {regime.ma50VsMa200 >= 0 ? "+" : ""}
                {regime.ma50VsMa200.toFixed(1)}%
              </span>
            </div>
            <Progress
              value={mounted ? maVal : 50}
              aria-label={t("rg.maAria")}
              indicatorClassName={regime.ma50VsMa200 >= 0 ? "bg-up" : "bg-down"}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
            <div>
              <div className="type-label text-muted-foreground">{t("rg.btcPrice")}</div>
              <div className="type-num mt-1 text-[13px]">${formatPrice(btc.price)}</div>
            </div>
            <div>
              <div className="type-label text-muted-foreground">MA50</div>
              <div className="type-num mt-1 text-[13px] text-muted-foreground">
                {btc.ma50 ? `$${formatPrice(btc.ma50)}` : "—"}
              </div>
            </div>
            <div>
              <div className="type-label text-muted-foreground">MA200</div>
              <div className="type-num mt-1 text-[13px] text-muted-foreground">
                {btc.ma200 ? `$${formatPrice(btc.ma200)}` : "—"}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
})
