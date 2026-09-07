import { memo } from "react"
import { Check, History, Minus, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { stanceStyle } from "@/components/stance-style"
import { t, useT, type MessageKey } from "@/i18n"
import {
  gradeRecord,
  gradeStats,
  headlineText,
  type Grade,
  type VerdictRecord,
} from "@/lib/crossAsset"
import { cn } from "@/lib/utils"

const gradeMeta: Record<Exclude<Grade, "pending">, { label: MessageKey; cls: string; Icon: typeof Check }> = {
  correct: {
    label: "grade.correct",
    cls: "border-up text-up",
    Icon: Check,
  },
  wrong: {
    label: "grade.wrong",
    cls: "border-down text-down",
    Icon: X,
  },
  partial: {
    label: "grade.partial",
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
  useT()
  const stats = gradeStats(history)
  const rows = [...history].reverse().slice(0, 14)

  return (
    <Card className="h-full border-border/80">
      <CardHeader className="pb-3">
        <CardKicker
          icon={History}
          title={t("vh.title")}
          en="VERDICT HISTORY"
          desc={
            <>
              {t("vh.desc")}
              {stats.hitRate != null && (
                <>
                  {" "}· {t("vh.hit")}{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {(stats.hitRate * 100).toFixed(0)}%
                  </span>{" "}
                  <span className="font-mono text-[10px]">
                    ({stats.correct}✓ / {stats.wrong}✗ / {stats.partial}◐)
                  </span>
                </>
              )}
            </>
          }
        />
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("vh.empty")}
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
                    {style.text()}
                  </Badge>
                  {/* w-0：截断型 flex item 的 min-content 贡献归零，避免窄容器被长标题撑破；
                      xl 起卡宽足够才展示 headline，更窄时保留日期/立场/涨跌/评分核心信息 */}
                  <span
                    className="hidden min-w-0 w-0 flex-1 truncate text-[11px] text-muted-foreground xl:block"
                    title={headlineText(r.headline)}
                  >
                    {headlineText(r.headline)}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 font-mono text-xs tabular font-semibold",
                      r.mcapChg24h > 0 ? "text-up" : r.mcapChg24h < 0 ? "text-down" : "text-muted-foreground",
                    )}
                    title={t("vh.mcapTitle")}
                  >
                    {r.mcapChg24h > 0 ? "+" : ""}
                    {r.mcapChg24h.toFixed(1)}%
                  </span>
                  {meta ? (
                    <Badge variant="outline" className={cn("shrink-0 gap-1 text-[10px]", meta.cls)}>
                      <meta.Icon className="size-3" />
                      {t(meta.label)}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
                      {isLatest ? t("vh.pending") : "—"}
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
