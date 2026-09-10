/** 英雄卡：下一个关键事件 / 正在进行的事件（倒计时数字盒 + BTC 实时观测 + 进度） */

import { CalendarClock, ExternalLink } from "lucide-react"

import { LivePrice, Pct } from "@/components/price-cells"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { useNow } from "@/hooks/useNow"
import { dateLocale, t } from "@/i18n"
import {
  countdownParts,
  eventProgress,
  eventStartMs,
  eventStatus,
  srcZone,
  type MarketEvent,
} from "@/lib/events"
import { cn } from "@/lib/utils"

import { CategoryChip, ImpactBadge } from "./widgets"

/** 倒计时数字盒：until=距 start 还有多久，since=自 start 已过多久。秒级跳动由内部心跳驱动 */
function CountdownBoxes({
  start,
  mode,
  approx,
}: {
  start: number
  mode: "until" | "since"
  approx?: boolean
}) {
  const now = useNow()
  const { d, h, m, s } = countdownParts(Math.abs(mode === "until" ? start - now : now - start))
  const units: [number, string][] = [
    [d, t("ev.cd.d")],
    [h, t("ev.cd.h")],
    [m, t("ev.cd.m")],
    [s, t("ev.cd.s")],
  ]
  return (
    <div role="timer" className="flex items-start gap-2 sm:gap-3" dir="ltr">
      {approx && <span className="pt-3 font-mono text-lg text-muted-foreground">≈</span>}
      {units.map(([v, label], i) => (
        <div key={label} className="flex items-start gap-2 sm:gap-3">
          {i > 0 && <span className="pt-2 font-mono text-xl font-bold text-muted-foreground/50 sm:pt-2.5">:</span>}
          <div className="flex w-12 flex-col items-center gap-1 sm:w-14">
            <span className="w-full rounded-md border border-border/60 bg-secondary/40 py-1.5 text-center font-mono text-2xl font-bold tabular sm:py-2 sm:text-3xl">
              {String(v).padStart(2, "0")}
            </span>
            <span className="font-mono text-[9px] tracking-[0.2em] text-muted-foreground uppercase">{label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/** 英雄卡进行中进度：百分比标签 + 进度条，秒级推进由内部心跳驱动 */
function HeroLiveProgress({ e }: { e: MarketEvent }) {
  const now = useNow()
  const pct = Math.round((eventProgress(e, now) ?? 0) * 100)
  return (
    <div className="w-full sm:max-w-[240px]">
      <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
        <span>{t("ev.hero.progress")}</span>
        <span className="tabular">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export function HeroCard({
  event,
  after,
  now,
  locale,
  btc,
}: {
  event: MarketEvent
  after: MarketEvent | null
  now: number
  locale: string
  btc: { price: number; changePct: number | null } | null
}) {
  const st = eventStatus(event, now)
  const start = eventStartMs(event)
  const live = st === "live"
  const title = locale === "en" ? event.en : event.zh
  const desc = locale === "en" ? event.descEn : event.descZh
  const zone = srcZone(event)
  const whenText = event.approx
    ? new Date(start).toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" })
    : new Date(start).toLocaleString(dateLocale(), {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
  const afterTitle = after ? (locale === "en" ? after.en : after.zh) : null

  return (
    <Card className={cn("fade-up", live && "border-primary/30")}>
      <CardHeader>
        <CardKicker
          title={
            live ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="live-dot size-1.5 rounded-full bg-primary" />
                {t("ev.status.live")}
              </span>
            ) : (
              t("ev.hero.next")
            )
          }
          en={live ? "HAPPENING NOW" : "NEXT KEY EVENT"}
          icon={CalendarClock}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug tracking-wide text-balance sm:text-xl">{title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-xs tabular text-muted-foreground">
              <span>
                {event.approx && "≈ "}
                {whenText}
              </span>
              {!event.approx && zone && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {locale === "en" ? zone.en : zone.zh}{" "}
                    {new Date(start).toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", {
                      timeZone: zone.iana,
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </span>
                </>
              )}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <CategoryChip category={event.category} />
              <ImpactBadge impact={event.impact} />
              {event.source && (
                <a
                  href={event.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border/60 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  {event.source.label}
                  <ExternalLink className="size-2.5" />
                </a>
              )}
            </div>
          </div>
          {/* 事件窗口的实时市场观测：BTC 秒级价格 */}
          {btc && (
            <div className="flex flex-col items-end gap-0.5 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
              <span className="font-mono text-[9px] tracking-[0.25em] text-muted-foreground uppercase">
                {t("ev.hero.btc")}
              </span>
              <LivePrice price={btc.price} />
              <Pct v={btc.changePct} />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CountdownBoxes start={start} mode={live ? "since" : "until"} approx={event.approx} />
          {live && event.end && <HeroLiveProgress e={event} />}
        </div>

        {desc && <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>}
        {after && afterTitle && (
          <p className="flex items-center gap-1.5 border-t border-border/50 pt-3 font-mono text-[11px] text-muted-foreground">
            <span className="tracking-[0.2em] text-primary/70">{t("ev.nextUp").toUpperCase()}</span>
            <span className="truncate font-sans text-xs font-semibold text-foreground/80">{afterTitle}</span>
            <span className="shrink-0 tabular">
              ·{" "}
              {new Date(eventStartMs(after)).toLocaleString(dateLocale(), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
