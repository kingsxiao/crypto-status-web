import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bitcoin, CalendarClock, ChevronDown, ChevronUp, Crosshair, Landmark } from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead } from "@/components/ui/card"
import { Segmented } from "@/components/ui/segmented"
import { useLive, useMarket } from "@/context/MarketDataContext"
import { useNow } from "@/hooks/useNow"
import { usePageMeta } from "@/hooks/usePageMeta"
import { useReveal } from "@/hooks/useReveal"
import { dateLocale, t, useLocale, useT } from "@/i18n"
import { requestNotifyPermission, notifyPermission, notifySupported } from "@/lib/alerts"
import {
  countdownParts,
  eventStartMs,
  eventStatus,
  filterEvents,
  groupEventsByDay,
  heroEvent,
  MARKET_EVENTS,
  statusCounts,
  type CategoryFilter,
  type MarketEvent,
  type StatusFilter,
} from "@/lib/events"
import { useEventReminders } from "@/lib/eventReminders"

import { EventRow } from "./events/EventRow"
import { HeroCard } from "./events/HeroCard"
import { NowDivider, TimelineRail } from "./events/widgets"

/** 折叠窗口步长：首屏只渲染 NOW 锚点两侧（或列表头部）各 N 条，「显示更多」每次放宽 N 条 */
const VISIBLE_STEP = 20

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
  const { locale } = useLocale()
  // 页面级时间粒度 5s：事件状态/筛选/分组/英雄卡选择都是分钟级语义，
  // 秒级跳动（倒计时、进度条、NOW 钟点）由各显示组件内部 useNow() 消化，
  // 整页不再每秒 reconcile。
  const now = useNow(5_000)
  const { snapshot } = useMarket()
  const tickers = useLive()
  const { reminders, toggle } = useEventReminders()
  const [statusF, setStatusF] = useState<StatusFilter>("all")
  const [catF, setCatF] = useState<CategoryFilter>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  // 折叠窗口宽度（可见条数上限）：NOW 锚点向前（更早的已结束）/向后（更远的
  // 未结束）各一档；切筛选/类别时回到初始窗口
  const [earlierLimit, setEarlierLimit] = useState(VISIBLE_STEP)
  const [laterLimit, setLaterLimit] = useState(VISIBLE_STEP)
  // 日组粒度滚动显现（无 JS / reduced-motion 时内容直接可见）。
  // useReveal 返回回调 ref（异步挂载时序驱动观察器建立）；TimelineRail 需要
  // RefObject 量高，两个职责在同一次挂载回调里合并写入
  const revealRef = useReveal<HTMLUListElement>()
  const railRootRef = useRef<HTMLUListElement | null>(null)
  const listRef = useCallback((el: HTMLUListElement | null) => {
    railRootRef.current = el
    revealRef(el)
  }, [revealRef])

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "—", [])
  usePageMeta({ title: t("meta.events"), description: t("page.events.desc", { tz }) })

  const filtered = useMemo(() => filterEvents(MARKET_EVENTS, now, statusF, catF), [now, statusF, catF])
  // 切筛选/类别回到初始窗口（不同列表的折叠量不可比）
  useEffect(() => {
    setEarlierLimit(VISIBLE_STEP)
    setLaterLimit(VISIBLE_STEP)
  }, [statusF, catF])
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

  // 「全部」视图的 NOW 分隔线锚点：首条未结束事件之前；全部已结束时放在列表末尾
  let markerId: string | null = null
  let markerIdx = 0
  if (statusF === "all") {
    const idx = filtered.findIndex((e) => eventStatus(e, now) !== "finished")
    markerIdx = idx === -1 ? filtered.length : idx
    markerId = idx === -1 ? "__end__" : filtered[idx].id
  }

  /* 折叠窗口（长清单首屏只渲染关键部分，避免百余行全量平铺约 20 屏）：
   *  - 「全部」视图（升序，NOW 锚点前全是已结束）：首屏只渲染锚点两侧各
   *    VISIBLE_STEP 条（最近已结束 + 即将到来），NOW 分隔线与「定位现在」
   *    始终可见——更早的折叠在顶部、更远的折叠在底部，各自「显示更多」；
   *  - 其余视图（upcoming/live 升序取最紧的在前、finished 降序取最新在前）：
   *    只留前 laterLimit 条——截尾，按钮放列表底部。 */
  const { shown, hiddenBefore, hiddenAfter } = useMemo(() => {
    if (statusF === "all") {
      const start = Math.max(0, markerIdx - earlierLimit)
      const end = Math.min(filtered.length, markerIdx + laterLimit)
      return {
        shown: filtered.slice(start, end),
        hiddenBefore: start,
        hiddenAfter: filtered.length - end,
      }
    }
    const end = Math.min(filtered.length, laterLimit)
    return { shown: filtered.slice(0, end), hiddenBefore: 0, hiddenAfter: filtered.length - end }
  }, [filtered, statusF, markerIdx, earlierLimit, laterLimit])

  const groups = useMemo(() => groupEventsByDay(shown), [shown])

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

      <Card>
        <CardContent className="space-y-1">
          <CardHead title={t("ev.timeline.title")}>
            <span className="type-label text-muted-foreground">
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
          </CardHead>

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
            <ul ref={listRef} className="relative">
              {/* 贯穿全时间线的生长轨道：灰线打底，primary 线随滚动生长，节点盖线之上 */}
              <TimelineRail containerRef={railRootRef} />
              {hiddenBefore > 0 && (
                /* 更早的已结束事件折叠在顶部（「全部」视图截头侧） */
                <li className="flex justify-center py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-full px-4 font-mono text-[11px]"
                    onClick={() => setEarlierLimit((n) => n + VISIBLE_STEP)}
                  >
                    <ChevronUp className="size-3.5" />
                    {t("ev.showEarlier", { n: hiddenBefore })}
                  </Button>
                </li>
              )}
              {groups.map((g, gi) => (
                <li key={g.dayKey} data-reveal>
                  {/* 粘性日头：长列表滚动时贴在顶栏下沿 */}
                  <div className="sticky top-16 z-10 -mx-1 flex items-center gap-3 bg-background/95 px-1 py-1.5 backdrop-blur-sm">
                    <span className="font-mono text-[11px] font-semibold tracking-wider">{dayLabel(g.dayKey, now)}</span>
                    <span className="h-px flex-1 bg-border/60" aria-hidden />
                  </div>
                  <ul>
                    {g.events.map((e) => (
                      <Fragment key={e.id}>
                        {markerId === e.id && <NowDivider />}
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
                    {markerId === "__end__" && gi === groups.length - 1 && <NowDivider />}
                  </ul>
                </li>
              ))}
              {hiddenAfter > 0 && (
                /* 更远的未结束/更旧的事件折叠在底部（截尾侧） */
                <li className="flex justify-center py-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 rounded-full px-4 font-mono text-[11px]"
                    onClick={() => setLaterLimit((n) => n + VISIBLE_STEP)}
                  >
                    <ChevronDown className="size-3.5" />
                    {t("ev.showMore", { n: hiddenAfter })}
                  </Button>
                </li>
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="flex items-start justify-center gap-1.5 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
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
