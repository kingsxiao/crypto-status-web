import { Fragment, useMemo, useState } from "react"
import {
  BellPlus,
  BellRing,
  Bitcoin,
  CalendarClock,
  CalendarPlus,
  ChevronDown,
  Crosshair,
  ExternalLink,
  Landmark,
} from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { LivePrice, Pct } from "@/components/price-cells"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardKicker } from "@/components/ui/card"
import { Segmented } from "@/components/ui/segmented"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { useNow } from "@/hooks/useNow"
import { usePageMeta } from "@/hooks/usePageMeta"
import { dateLocale, t, useLocale, useT } from "@/i18n"
import { requestNotifyPermission, notifyPermission, notifySupported } from "@/lib/alerts"
import {
  buildIcs,
  countdownParts,
  eventProgress,
  eventStartMs,
  eventStatus,
  filterEvents,
  groupEventsByDay,
  heroEvent,
  MARKET_EVENTS,
  srcZone,
  statusCounts,
  type CategoryFilter,
  type EventCategory,
  type EventImpact,
  type MarketEvent,
  type StatusFilter,
} from "@/lib/events"
import { useEventReminders } from "@/lib/eventReminders"
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
function ImpactMeter({ impact }: { impact: EventImpact }) {
  return (
    <span className="inline-flex items-end gap-[2px]" aria-hidden>
      <span className={cn("h-2.5 w-[3px] rounded-sm", impact === "high" ? "bg-primary" : "bg-primary/70")} />
      <span className={cn("h-2.5 w-[3px] rounded-sm", impact === "high" ? "bg-primary" : "bg-muted-foreground/25")} />
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

/** 轨道节点：状态决定形态（已结束灰空心 / 进行中脉冲 / 未开始按影响度实心或空心 / 时间窗虚线） */
function RailDot({ e, now }: { e: MarketEvent; now: number }) {
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
function NowDivider({ now }: { now: number }) {
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

/** 浏览器内生成 .ics 并触发下载 */
function downloadIcs(e: MarketEvent, locale: string) {
  const ics = buildIcs(e, locale === "en" ? "en" : "zh")
  const url = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
  const a = document.createElement("a")
  a.href = url
  a.download = `${e.id}.ics`
  a.click()
}

/* ------------------------------ 事件行（可展开） ------------------------------ */

function EventRow({
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
  const pct = Math.round((eventProgress(event, now) ?? 0) * 100)
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
  const { reminders, toggle } = useEventReminders()
  const [statusF, setStatusF] = useState<StatusFilter>("all")
  const [catF, setCatF] = useState<CategoryFilter>("all")
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => filterEvents(MARKET_EVENTS, now, statusF, catF), [now, statusF, catF])
  const groups = useMemo(() => groupEventsByDay(filtered), [filtered])
  const hero = useMemo(() => heroEvent(MARKET_EVENTS, now), [now])
  // 「随后」预告：英雄卡之外最近的未结束事件
  const after = useMemo(
    () =>
      sortedUpcoming(
        MARKET_EVENTS.filter((e) => e.id !== hero?.id && !e.window && eventStatus(e, now) !== "finished")
      ),
    [hero, now]
  )
  const counts = useMemo(() => statusCounts(MARKET_EVENTS, now), [now])
  const catCounts = useMemo(
    () => ({
      macro: MARKET_EVENTS.filter((e) => e.category === "macro").length,
      crypto: MARKET_EVENTS.filter((e) => e.category === "crypto").length,
    }),
    []
  )

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

  const toggleReminder = (id: string) => {
    const on = toggle(id)
    // 借用户手势顺便请求通知权限；拒绝不阻断（页内 toast 仍然有效）
    if (on && notifySupported() && notifyPermission() === "default") {
      void requestNotifyPermission()
    }
  }

  const locateNow = () => {
    document.getElementById("now-marker")?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const segCount = (n: number) => <span className="ml-0.5 text-[10px] opacity-55">{n}</span>

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="EVENT CALENDAR" title={t("page.events.title")} description={t("page.events.desc", { tz })}>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("ev.filter.status")}
            value={statusF}
            onChange={setStatusF}
            items={[
              { value: "all", label: <span>{t("ev.f.all")}{segCount(MARKET_EVENTS.length)}</span> },
              { value: "upcoming", label: <span>{t("ev.f.upcoming")}{segCount(counts.upcoming)}</span> },
              { value: "live", label: <span>{t("ev.f.live")}{segCount(counts.live)}</span> },
              { value: "finished", label: <span>{t("ev.f.finished")}{segCount(counts.finished)}</span> },
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
                    {segCount(catCounts.macro)}
                  </span>
                ),
              },
              {
                value: "crypto",
                label: (
                  <span className="flex items-center gap-1">
                    <Bitcoin className="size-3.5" />
                    {t("ev.cat.crypto")}
                    {segCount(catCounts.crypto)}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </PageHeader>

      {hero && <HeroCard event={hero} after={after} now={now} locale={locale} btc={btc} />}

      <Card className="fade-up" style={{ animationDelay: "60ms" }}>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <h2 className="text-[15px] font-semibold tracking-tight">{t("ev.timeline.title")}</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                {t("ev.timeline.count", { n: filtered.length })} ·{" "}
                {t(statusF === "finished" ? "ev.order.desc" : "ev.order.asc")}
              </span>
              {statusF === "all" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 rounded-full px-2.5 font-mono text-[10px]"
                  onClick={locateNow}
                >
                  <Crosshair className="size-3" />
                  {t("ev.locateNow")}
                </Button>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-center">
              <CalendarClock className="size-4 text-muted-foreground/50" />
              <p className="text-sm font-semibold">
                {statusF === "live" ? t("ev.empty.live.title") : t("ev.empty.title")}
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                {statusF === "live" && hero
                  ? t("ev.empty.live.desc", {
                      title: locale === "en" ? hero.en : hero.zh,
                      t: compactCountdownText(eventStartMs(hero) - now),
                    })
                  : t("ev.empty.desc")}
              </p>
            </div>
          ) : (
            <ul>
              {groups.map((g, gi) => (
                <li key={g.dayKey}>
                  {/* 粘性日头：长列表滚动时贴在顶栏下沿 */}
                  <div className="sticky top-16 z-10 -mx-1 flex items-center gap-3 bg-background/95 px-1 py-1.5 backdrop-blur-sm">
                    <span className="font-mono text-[11px] font-semibold tracking-wider">{dayLabel(g.dayKey, now)}</span>
                    <span className="h-px flex-1 bg-border/60" aria-hidden />
                  </div>
                  <ul className="relative">
                    {/* 轨道竖线：日组内贯穿，节点盖在其上 */}
                    <span aria-hidden className="absolute bottom-2 left-3 top-2 w-px bg-border/60" />
                    {g.events.map((e) => (
                      <Fragment key={e.id}>
                        {markerId === e.id && <NowDivider now={now} />}
                        <EventRow
                          e={e}
                          now={now}
                          locale={locale}
                          open={openId === e.id}
                          onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))}
                          reminderOn={!!reminders[e.id]}
                          onToggleReminder={() => toggleReminder(e.id)}
                        />
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

/** 英雄卡之外的下一个事件（升序取首个） */
function sortedUpcoming(events: MarketEvent[]): MarketEvent | null {
  const sorted = [...events].sort((a, b) => eventStartMs(a) - eventStartMs(b))
  return sorted[0] ?? null
}

/** 智能空态用的紧凑倒计时文本 */
function compactCountdownText(ms: number): string {
  const { d, h, m } = countdownParts(ms)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  return d > 0 ? `${d}${t("ev.cd.d")} ${hh}:${mm}` : `${hh}:${mm}`
}
