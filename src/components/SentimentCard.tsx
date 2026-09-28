import { memo, useEffect, useState } from "react"
import { Gauge } from "lucide-react"

import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { t, useT } from "@/i18n"
import type { FearGreedEntry } from "@/lib/api"
import { FNG_GRADIENT, fngLabel, fngShade } from "@/lib/fng"

/** 恐惧贪婪指数卡（alternative.me 数据源）+ 30 日情绪走势 */
export const SentimentCard = memo(function SentimentCard({ fng }: { fng: FearGreedEntry[] }) {
  useT()
  const latest = fng[0]
  const history = [...fng].reverse() // 时间升序，末尾为今天
  const weekAgo = fng[Math.min(7, fng.length - 1)]
  const monthMin = Math.min(...fng.map((e) => e.value))
  const monthMax = Math.max(...fng.map((e) => e.value))
  const weekDelta = latest && weekAgo ? latest.value - weekAgo.value : 0

  // 挂载编排：情绪条游标从中性位（50）滑到当前值（450ms 状态切换档）
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const cursorAt = mounted && latest ? latest.value : 50

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-0">
        <CardKicker
          icon={Gauge}
          title={t("page.sentiment.title")}
          en="FEAR & GREED"
          desc={t("sc.desc")}
        />
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        {latest ? (
          <>
            <div className="flex items-end gap-3">
              <span className="type-num-xl text-5xl leading-none">
                {String(latest.value).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1 pb-0.5">
                <span className="text-sm font-semibold">{fngLabel(latest.classification)}</span>
                <span className="type-meta">/ 100</span>
              </div>
            </div>

            {/* 0-100 情绪条：红→橙→黄→绿渐变，白色游标指示当前值；
                游标位置走 left 过渡（挂载从中性位滑入，日更后平滑跟随） */}
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: FNG_GRADIENT, opacity: 0.9 }}
              />
              <div
                className="absolute inset-y-0 w-[3px] rounded-full bg-popover shadow-[0_0_6px_oklch(0_0_0/0.8)] transition-[left] duration-[450ms] ease-[cubic-bezier(0.21,1,0.33,1)]"
                style={{ left: `calc(${cursorAt}% - 1.5px)` }}
              />
            </div>
            <div className="flex justify-between type-meta">
              <span>{t("sc.scaleLeft")}</span>
              <span>{t("sc.scaleMid")}</span>
              <span>{t("sc.scaleRight")}</span>
            </div>

            {/* 30 日情绪柱状：容器挂 .stagger，柱条按 60ms/步波浪入场
                （第 8 步封顶，其后柱条齐步 —— 与全站阶差机制一致） */}
            <div>
              <div className="mb-1.5 flex items-center justify-between type-label text-muted-foreground">
                <span>{t("common.trend30")}</span>
                <span className="type-meta">
                  {t("sc.weekChg", { v: `${weekDelta >= 0 ? "+" : ""}${weekDelta}` })}
                </span>
              </div>
              <div className="stagger flex h-12 items-end gap-[2px]" aria-hidden>
                {history.slice(-30).map((e, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-[2px]"
                    style={{
                      height: `${18 + (e.value / 100) * 82}%`,
                      background: fngShade(e.value),
                    }}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex justify-between type-meta">
                <span>{t("sc.monthMin", { v: monthMin })}</span>
                <span>{t("sc.monthMax", { v: monthMax })}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            {t("sc.unavailable")}
          </div>
        )}
      </CardContent>
    </Card>
  )
})
