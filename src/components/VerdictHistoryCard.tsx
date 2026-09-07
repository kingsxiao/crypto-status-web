import { memo } from "react"
import { Check, Minus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  gradeRecord,
  gradeStats,
  type Grade,
  type VerdictRecord,
} from "@/lib/crossAsset"
import { stanceStyle } from "@/components/stance-style"
import { cn } from "@/lib/utils"

const gradeMeta: Record<Exclude<Grade, "pending">, { label: string; cls: string; Icon: typeof Check }> = {
  correct: {
    label: "方向正确",
    cls: "border-up text-up",
    Icon: Check,
  },
  wrong: {
    label: "方向错误",
    cls: "border-down text-down",
    Icon: X,
  },
  partial: {
    label: "部分验证",
    cls: "text-muted-foreground",
    Icon: Minus,
  },
}

/**
 * 判断历史：每日立场自动落库（localStorage），次日以总市值实际涨跌复盘打分。
 */
export const VerdictHistoryCard = memo(function VerdictHistoryCard({
  history,
}: {
  history: VerdictRecord[]
}) {
  const stats = gradeStats(history)
  const rows = [...history].reverse().slice(0, 14)

  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            判断历史 · 复盘
          </CardTitle>
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider text-muted-foreground">
            VERDICT HISTORY
          </Badge>
        </div>
        <CardDescription className="text-xs">
          每日立场自动记录；次日以总市值 ±0.5% 实际走向验证方向
          {stats.hitRate != null && (
            <>
              {" "}· 方向命中{" "}
              <span className="font-mono font-semibold text-foreground">
                {(stats.hitRate * 100).toFixed(0)}%
              </span>{" "}
              <span className="font-mono text-[10px]">
                ({stats.correct}✓ / {stats.wrong}✗ / {stats.partial}◐)
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            今日判断已记录，明天自动生成首条复盘
          </p>
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => {
              // rows 为倒序：rows[i+1] 是 r 的「次日」
              const next = i > 0 ? rows[i - 1] : null
              const grade = gradeRecord(r, next)
              const isLatest = i === 0
              const meta = grade === "pending" ? null : gradeMeta[grade]
              const style = stanceStyle[r.stance]

              return (
                <li
                  key={r.date}
                  className="flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-secondary/40"
                >
                  <span className="w-[72px] shrink-0 font-mono text-xs tabular text-muted-foreground">
                    {r.date.slice(5)}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-[10px] font-semibold", style.cls)}
                  >
                    {style.text}
                  </Badge>
                  <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:block">
                    {r.headline}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 font-mono text-xs tabular font-semibold",
                      r.mcapChg24h > 0 ? "text-up" : r.mcapChg24h < 0 ? "text-down" : "text-muted-foreground",
                    )}
                    title="当日总市值 24h 变化"
                  >
                    {r.mcapChg24h > 0 ? "+" : ""}
                    {r.mcapChg24h.toFixed(1)}%
                  </span>
                  {meta ? (
                    <Badge variant="outline" className={cn("shrink-0 gap-1 text-[10px]", meta.cls)}>
                      <meta.Icon className="size-3" />
                      {meta.label}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      {isLatest ? "待验证" : "—"}
                    </Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
})
