/**
 * 事件日历小部件 — 分类徽标 / 影响度 / 倒计时 / 状态区 / 轨道节点。
 * 秒级跳动（倒计时、进度）由各组件内部 useNow 消化，不牵动整页重渲染。
 */

import { Bitcoin, Landmark } from "lucide-react"

import { useNow } from "@/hooks/useNow"
import { dateLocale, t } from "@/i18n"
import {
  countdownParts,
  eventProgress,
  eventStartMs,
  eventStatus,
  type EventCategory,
  type EventImpact,
  type MarketEvent,
} from "@/lib/events"
import { cn } from "@/lib/utils"

export function CategoryChip({ category }: { category: EventCategory }) {
  const Icon = category === "macro" ? Landmark : Bitcoin
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        category === "macro"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-secondary/50 text-muted-foreground"
      )}
    >
      <Icon className="size-3" />
      {t(category === "macro" ? "ev.cat.macro" : "ev.cat.crypto")}
    </span>
  )
}

export function ImpactBadge({ impact }: { impact: EventImpact }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        impact === "high" ? "border-primary/40 text-primary" : "border-border/60 text-muted-foreground"
      )}
    >
      <span
        aria-hidden
        className={cn("size-1 rounded-full", impact === "high" ? "bg-primary" : "bg-muted-foreground/50")}
      />
      {t(impact === "high" ? "ev.impact.high" : "ev.impact.medium")}
    </span>
  )
}

/** 行内迷你影响度：两根信号条（高=双亮，中=单亮），无文字省空间 */
export function ImpactMeter({ impact }: { impact: EventImpact }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      <span className={cn("h-2.5 w-[3px] rounded-sm", impact === "high" ? "bg-primary" : "bg-primary/70")} />
      <span className={cn("h-2.5 w-[3px] rounded-sm", impact === "high" ? "bg-primary" : "bg-muted-foreground/25")} />
    </span>
  )
}

/** 紧凑倒计时：3天 13:22:41（天数为 0 时省略天段）。秒级跳动由内部心跳驱动 */
function CompactCountdown({ ms, approx }: { ms: number; approx?: boolean }) {
  const { d, h, m, s } = countdownParts(ms)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return (
    <span className="font-mono text-xs tabular text-muted-foreground">
      {approx && "≈"}
      {d > 0 ? `${d}${t("ev.cd.d")} ` : ""}
      {hh}:{mm}:{ss}
    </span>
  )
}

/** 时间线行右端的状态区：倒计时 / 进行中 / 已结束 / 时间窗。
 * 自带秒级心跳：状态翻转与倒计时秒跳在组件内消化，不牵动整页重渲染 */
export function RowStatus({ e, locale }: { e: MarketEvent; locale: string }) {
  const now = useNow()
  const st = eventStatus(e, now)
  if (e.window) {
    if (st === "finished") {
      return <span className="font-mono text-xs text-muted-foreground/70">{t("ev.status.finished")}</span>
    }
    return (
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
        {locale === "en" ? e.window.en : e.window.zh} · {t("ev.status.tba")}
      </span>
    )
  }
  if (st === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-primary">
        <span className="live-dot size-1.5 rounded-full bg-primary" />
        {t("ev.status.live")}
      </span>
    )
  }
  if (st === "finished") {
    return <span className="font-mono text-xs text-muted-foreground/70">{t("ev.status.finished")}</span>
  }
  return <CompactCountdown ms={eventStartMs(e) - now} approx={e.approx} />
}

/** 进行中事件的进度条：秒级推进由内部心跳驱动 */
export function LiveProgressBar({ e, className }: { e: MarketEvent; className?: string }) {
  const now = useNow()
  const pct = Math.round((eventProgress(e, now) ?? 0) * 100)
  return (
    <div className={cn("overflow-hidden rounded-full bg-secondary", className)} aria-hidden>
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** 轨道节点：状态决定形态（已结束灰空心 / 进行中脉冲 / 未开始按影响度实心或空心 / 时间窗虚线） */
export function RailDot({ e, now }: { e: MarketEvent; now: number }) {
  const st = eventStatus(e, now)
  const base = "absolute left-[8px] top-[15px] z-[1] size-2 rounded-full"
  if (e.window) return <span aria-hidden className={cn(base, "border border-dashed border-primary/60 bg-background")} />
  if (st === "live")
    return <span aria-hidden className={cn(base, "live-dot bg-primary ring-4 ring-primary/20")} />
  if (st === "finished") return <span aria-hidden className={cn(base, "border border-border bg-background")} />
  return (
    <span
      aria-hidden
      className={cn(
        base,
        e.impact === "high" ? "bg-primary" : "border border-primary/50 bg-background"
      )}
    />
  )
}

/** 「现在」分隔线：全部视图里插在最近一条已结束与首条未结束事件之间 */
export function NowDivider() {
  const now = useNow()
  return (
    <li id="now-marker" className="relative flex items-center gap-2 py-3 pl-7" aria-hidden>
      <span className="live-dot absolute left-[8px] top-1/2 z-[1] size-2 -translate-y-1/2 rounded-full bg-primary ring-4 ring-primary/20" />
      <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-primary">{t("ev.now")}</span>
      <span className="font-mono text-[10px] tabular text-muted-foreground">
        {new Date(now).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
    </li>
  )
}
