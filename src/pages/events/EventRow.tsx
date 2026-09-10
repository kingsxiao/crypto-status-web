/** 时间线事件行：可展开详情（分类/影响度/来源/时区/ICS 导出/提醒开关） */

import { BellPlus, BellRing, CalendarPlus, ChevronDown, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { dateLocale, t } from "@/i18n"
import { buildIcs, eventStartMs, eventStatus, srcZone, type MarketEvent } from "@/lib/events"
import { cn } from "@/lib/utils"

import {
  CategoryChip,
  ImpactBadge,
  ImpactMeter,
  LiveProgressBar,
  RailDot,
  RowStatus,
} from "./widgets"

/** 浏览器内生成 .ics 并触发下载 */
function downloadIcs(e: MarketEvent, locale: string) {
  const ics = buildIcs(e, locale === "en" ? "en" : "zh")
  const url = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
  const a = document.createElement("a")
  a.href = url
  a.download = `${e.id}.ics`
  a.click()
}

export function EventRow({
  e,
  now,
  locale,
  open,
  onToggle,
  reminderOn,
  onToggleReminder,
}: {
  e: MarketEvent
  now: number
  locale: string
  open: boolean
  onToggle: () => void
  reminderOn: boolean
  onToggleReminder: () => void
}) {
  const st = eventStatus(e, now)
  const start = new Date(eventStartMs(e))
  const timeText = e.window
    ? locale === "en"
      ? e.window.en
      : e.window.zh
    : e.approx
      ? t("ev.time.tba")
      : start.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hour12: false })
  const title = locale === "en" ? e.en : e.zh
  const desc = locale === "en" ? e.descEn : e.descZh
  const zone = srcZone(e)
  const canRemind = st === "upcoming" && !e.window
  const panelId = `ev-detail-${e.id}`

  return (
    <li className={cn("relative", st === "finished" && "opacity-60", st === "live" && "opacity-100")}>
      <RailDot e={e} now={now} />
      <div
        className={cn(
          "grid grid-cols-[3.25rem_1fr_auto] items-start gap-x-3 py-2.5 pl-7",
          st === "live" && "rounded-r-md bg-primary/5"
        )}
      >
        <span className="pt-0.5 font-mono text-xs font-semibold tabular text-muted-foreground">{timeText}</span>
        <div className="min-w-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={onToggle}
            className="group/title flex min-w-0 max-w-full items-center gap-1.5 text-left"
          >
            <span
              className={cn(
                "truncate text-sm font-semibold transition-colors group-hover/title:text-primary",
                st === "live" && "text-primary"
              )}
            >
              {title}
            </span>
            {reminderOn && <BellRing className="size-3 shrink-0 text-primary" aria-label={t("ev.remind.set")} />}
            <ImpactMeter impact={e.impact} />
            <ChevronDown
              className={cn(
                "size-3 shrink-0 text-muted-foreground/50 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </button>
          {!open && desc && (
            <p className="mt-0.5 line-clamp-1 pr-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 pt-0.5">
          <RowStatus e={e} locale={locale} />
          {st === "live" && e.end && <LiveProgressBar e={e} className="h-1 w-16" />}
        </div>
      </div>

      {open && (
        <div id={panelId} className="fade-up mb-1.5 ml-7 mr-1 rounded-lg border border-border/60 bg-secondary/30 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryChip category={e.category} />
            <ImpactBadge impact={e.impact} />
            {e.approx && (
              <span className="rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                ≈ {t("ev.approxTip")}
              </span>
            )}
          </div>
          {desc && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span className="tabular">
              {e.approx
                ? start.toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" })
                : start.toLocaleString(dateLocale(), {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    weekday: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
            </span>
            {!e.approx && zone && (
              <span className="tabular">
                {locale === "en" ? zone.en : zone.zh}{" "}
                {start.toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", {
                  timeZone: zone.iana,
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </span>
            )}
            {e.source && (
              <a
                href={e.source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 transition-colors hover:text-primary"
              >
                {e.source.label}
                <ExternalLink className="size-2.5" />
              </a>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => downloadIcs(e, locale)}>
              <CalendarPlus className="size-3.5" />
              {t("ev.ics")}
            </Button>
            {canRemind && (
              <Button
                variant={reminderOn ? "default" : "outline"}
                size="sm"
                className={cn("h-8 gap-1.5", !reminderOn && "hover:border-primary/40 hover:text-primary")}
                aria-pressed={reminderOn}
                onClick={onToggleReminder}
              >
                {reminderOn ? <BellRing className="size-3.5" /> : <BellPlus className="size-3.5" />}
                {t(reminderOn ? "ev.remind.cancel" : "ev.remind.add")}
              </Button>
            )}
            {canRemind && (
              <span className="font-mono text-[10px] text-muted-foreground/70">{t("ev.remind.hint")}</span>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
