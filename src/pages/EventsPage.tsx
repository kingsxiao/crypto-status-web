import { Fragment, useMemo, useState } from "react"
import { Bitcoin, CalendarClock, ExternalLink, Landmark } from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { LivePrice, Pct } from "@/components/price-cells"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Segmented } from "@/components/ui/segmented"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { useNow } from "@/hooks/useNow"
import { usePageMeta } from "@/hooks/usePageMeta"
import { dateLocale, t, useLocale, useT } from "@/i18n"
import {
  countdownParts,
  eventProgress,
  eventStartMs,
  eventStatus,
  filterEvents,
  groupEventsByDay,
  heroEvent,
  MARKET_EVENTS,
  type CategoryFilter,
  type EventCategory,
  type EventImpact,
  type MarketEvent,
  type StatusFilter,
} from "@/lib/events"
import { cn } from "@/lib/utils"

/* ------------------------------ 小部件 ------------------------------ */

function CategoryChip({ category }: { category: EventCategory }) {
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

function ImpactBadge({ impact }: { impact: EventImpact }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[10px] tracking-wider",
        impact === "high"
          ? "border-primary/40 text-primary"
          : "border-border/60 text-muted-foreground"
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

/** 紧凑倒计时：3天 13:22:41（天数为 0 时省略天段） */
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

/** 时间线行右端的状态区：倒计时 / 进行中 / 已结束 / 时间窗 */
function RowStatus({ e, now, locale }: { e: MarketEvent; now: number; locale: string }) {
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

/** 事件行：时间 | 标题+描述+徽标 | 状态 */
function EventRow({ e, now, locale }: { e: MarketEvent; now: number; locale: string }) {
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

  return (
    <li
      className={cn(
        "grid grid-cols-[3.25rem_1fr_auto] items-start gap-3 border-b border-border/40 px-1 py-3 last:border-b-0",
        st === "finished" && "opacity-55",
        st === "live" && "rounded-md border border-primary/30 bg-primary/5 px-3"
      )}
    >
      <span className="pt-0.5 font-mono text-xs font-semibold tabular text-muted-foreground">{timeText}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold">{title}</span>
          {e.source && (
            <a
              href={e.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-primary"
            >
              {e.source.label}
              <ExternalLink className="size-2.5" />
            </a>
          )}
        </div>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <CategoryChip category={e.category} />
          <ImpactBadge impact={e.impact} />
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 pt-0.5">
        <RowStatus e={e} now={now} locale={locale} />
        {st === "live" && e.end && (
          <div className="h-1 w-16 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
              style={{ width: `${Math.round((eventProgress(e, now) ?? 0) * 100)}%` }}
            />
          </div>
        )}
      </div>
    </li>
  )
}

/** 「现在」分隔线：全部视图里插在最近一条已结束与首条未结束事件之间 */
function NowDivider({ now }: { now: number }) {
  return (
    <li className="flex items-center gap-2 py-3" aria-hidden>
      <span className="live-dot size-1.5 shrink-0 rounded-full bg-primary" />
      <span className="font-mono text-[10px] font-semibold tracking-[0.25em] text-primary">{t("ev.now")}</span>
      <span className="font-mono text-[10px] tabular text-muted-foreground">
        {new Date(now).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" />
    </li>
  )
}

/* ------------------------------ 英雄卡 ------------------------------ */

function CountdownBoxes({ ms, approx }: { ms: number; approx?: boolean }) {
  const { d, h, m, s } = countdownParts(ms)
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

function HeroCard({
  event,
  now,
  locale,
  btc,
}: {
  event: MarketEvent
  now: number
  locale: string
  btc: { price: number; changePct: number | null } | null
}) {
  const st = eventStatus(event, now)
  const start = eventStartMs(event)
  const live = st === "live"
  const title = locale === "en" ? event.en : event.zh
  const desc = locale === "en" ? event.descEn : event.descZh
  const whenText = event.approx
    ? new Date(start).toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" })
    : new Date(start).toLocaleString(dateLocale(), {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
  const pct = Math.round((eventProgress(event, now) ?? 0) * 100)

  return (
    <Card className="fade-up">
      <CardHeader>
        <CardKicker
          title={live ? t("ev.status.live") : t("ev.hero.next")}
          en={live ? "HAPPENING NOW" : "NEXT KEY EVENT"}
          icon={CalendarClock}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-snug tracking-wide text-balance sm:text-xl">{title}</h2>
            <p className="mt-1 font-mono text-xs tabular text-muted-foreground">
              {event.approx && "≈ "}
              {whenText}
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
          <CountdownBoxes ms={live ? now - start : start - now} approx={event.approx} />
          {live && event.end && (
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
          )}
        </div>
        {desc && <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>}
      </CardContent>
    </Card>
  )
}

/* ------------------------------ 页面 ------------------------------ */

/** 日组头标签：相对日期（今天/明天/N 天后…）+ 绝对日期（含星期） */
function dayLabel(dayKey: string, now: number): string {
  const [y, m, d] = dayKey.split("-").map(Number)
  const date = new Date(y, m - 1, d, 12)
  const today = new Date(now)
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  const abs = date.toLocaleDateString(dateLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  })
  if (diff === 0) return `${t("ev.today")} · ${abs}`
  if (diff === 1) return `${t("ev.tomorrow")} · ${abs}`
  if (diff === -1) return `${t("ev.yesterday")} · ${abs}`
  if (diff > 1 && diff <= 7) return `${t("ev.daysLater", { n: diff })} · ${abs}`
  if (diff < -1 && diff >= -7) return `${t("ev.daysAgo", { n: -diff })} · ${abs}`
  return abs
}

export function EventsPage() {
  useT()
  usePageMeta({ title: t("meta.events") })
  const { locale } = useLocale()
  const now = useNow()
  const { snapshot } = useMarket()
  const tickers = useLive()
  const [statusF, setStatusF] = useState<StatusFilter>("all")
  const [catF, setCatF] = useState<CategoryFilter>("all")

  const filtered = useMemo(() => filterEvents(MARKET_EVENTS, now, statusF, catF), [now, statusF, catF])
  const groups = useMemo(() => groupEventsByDay(filtered), [filtered])
  const hero = useMemo(() => heroEvent(MARKET_EVENTS, now), [now])

  const btcLive = tickers.bitcoin ?? null
  const btcFallback = snapshot?.coins.find((c) => c.id === "bitcoin") ?? null
  const btc =
    btcLive != null
      ? { price: btcLive.price, changePct: btcLive.changePct }
      : btcFallback != null
        ? { price: btcFallback.current_price, changePct: btcFallback.price_change_percentage_24h_in_currency ?? null }
        : null

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "—", [])

  // 「全部」视图的 NOW 分隔线锚点：首条未结束事件之前；全部已结束时放在列表末尾
  let markerId: string | null = null
  if (statusF === "all") {
    markerId = filtered.find((e) => eventStatus(e, now) !== "finished")?.id ?? "__end__"
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="EVENT CALENDAR" title={t("page.events.title")} description={t("page.events.desc", { tz })}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("ev.filter.status")}
            value={statusF}
            onChange={setStatusF}
            items={[
              { value: "all", label: t("ev.f.all") },
              { value: "upcoming", label: t("ev.f.upcoming") },
              { value: "live", label: t("ev.f.live") },
              { value: "finished", label: t("ev.f.finished") },
            ]}
          />
          <Segmented
            label={t("ev.filter.cat")}
            value={catF}
            onChange={setCatF}
            items={[
              { value: "all", label: t("ev.cat.all") },
              {
                value: "macro",
                label: (
                  <span className="flex items-center gap-1">
                    <Landmark className="size-3.5" />
                    {t("ev.cat.macro")}
                  </span>
                ),
              },
              {
                value: "crypto",
                label: (
                  <span className="flex items-center gap-1">
                    <Bitcoin className="size-3.5" />
                    {t("ev.cat.crypto")}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </PageHeader>

      {hero && <HeroCard event={hero} now={now} locale={locale} btc={btc} />}

      <Card className="fade-up" style={{ animationDelay: "60ms" }}>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <h2 className="text-[15px] font-semibold tracking-tight">{t("ev.timeline.title")}</h2>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              {t("ev.timeline.count", { n: filtered.length })} · {t(statusF === "finished" ? "ev.order.desc" : "ev.order.asc")}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-center">
              <CalendarClock className="size-4 text-muted-foreground/50" />
              <p className="text-sm font-semibold">{t("ev.empty.title")}</p>
              <p className="max-w-xs text-xs text-muted-foreground">{t("ev.empty.desc")}</p>
            </div>
          ) : (
            <ul>
              {groups.map((g, gi) => (
                <li key={g.dayKey}>
                  <div className="flex items-center gap-3 border-b border-border/60 pb-1.5 pt-4 first:pt-1">
                    <span className="font-mono text-[11px] font-semibold tracking-wider">{dayLabel(g.dayKey, now)}</span>
                    <span className="h-px flex-1 bg-border/60" aria-hidden />
                  </div>
                  <ul>
                    {g.events.map((e) => (
                      <Fragment key={e.id}>
                        {markerId === e.id && <NowDivider now={now} />}
                        <EventRow e={e} now={now} locale={locale} />
                      </Fragment>
                    ))}
                    {markerId === "__end__" && gi === groups.length - 1 && <NowDivider now={now} />}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p
        className="fade-up flex items-start justify-center gap-1.5 text-center font-mono text-[10px] leading-relaxed text-muted-foreground"
        style={{ animationDelay: "120ms" }}
      >
        {t("ev.note")}
      </p>
    </main>
  )
}
