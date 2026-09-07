import { memo } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { FearGreedEntry } from "@/lib/api"
import { FNG_GRADIENT, fngShade, fngZh } from "@/lib/fng"

/** 恐惧贪婪指数卡（alternative.me 数据源）+ 30 日情绪走势 */
export const SentimentCard = memo(function SentimentCard({ fng }: { fng: FearGreedEntry[] }) {
  const latest = fng[0]
  const history = [...fng].reverse() // 时间升序，末尾为今天
  const weekAgo = fng[Math.min(7, fng.length - 1)]
  const monthMin = Math.min(...fng.map((e) => e.value))
  const monthMax = Math.max(...fng.map((e) => e.value))
  const weekDelta = latest && weekAgo ? latest.value - weekAgo.value : 0

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
            市场情绪
          </CardTitle>
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
            FEAR &amp; GREED
          </span>
        </div>
        <CardDescription className="text-xs">市场情绪指数</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        {latest ? (
          <>
            <div className="flex items-end gap-3">
              <span className="font-mono text-5xl font-bold tabular leading-none">
                {String(latest.value).padStart(2, "0")}
              </span>
              <div className="flex flex-col gap-1 pb-0.5">
                <span className="text-sm font-semibold">{fngZh(latest.classification)}</span>
                <span className="font-mono text-[10px] text-muted-foreground">/ 100</span>
              </div>
            </div>

            {/* 0-100 情绪条：红→橙→黄→绿渐变，白色游标指示当前值 */}
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="absolute inset-0 rounded-full"
                style={{ background: FNG_GRADIENT, opacity: 0.9 }}
              />
              <div
                className="absolute inset-y-0 w-[3px] rounded-full bg-popover shadow-[0_0_6px_oklch(0_0_0/0.8)]"
                style={{ left: `calc(${latest.value}% - 1.5px)` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>极度恐惧</span>
              <span>中性</span>
              <span>极度贪婪</span>
            </div>

            {/* 30 日情绪柱状 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>近 30 日走势</span>
                <span className="font-mono normal-case tracking-normal">
                  周变化 {weekDelta >= 0 ? "+" : ""}
                  {weekDelta}
                </span>
              </div>
              <div className="flex h-12 items-end gap-[2px]" aria-hidden>
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
              <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted-foreground">
                <span>月最低 {monthMin}</span>
                <span>月最高 {monthMax}</span>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
            情绪数据暂不可用
          </div>
        )}
      </CardContent>
    </Card>
  )
})
