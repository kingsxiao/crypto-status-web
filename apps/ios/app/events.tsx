/**
 * 事件日历（Stack /events）— web EventsPage 的 iOS 移植。
 *
 * 功能对齐（apps/web/src/pages/EventsPage.tsx + events/ 子组件）：
 *  - 状态（全部/即将/进行中/已结束，带计数）+ 类别（宏观/加密）双分段筛选
 *  - 英雄卡：下一个关键事件 / 正在进行（SVG 倒计时拨盘 + 秒级数字盒 +
 *    BTC 实时观测 + 进行中进度）；「随后」预告行
 *  - 时间线：贯穿轨道（滚动联动生长）+ 状态节点 + 日组头 + NOW 分隔线
 *    （含「定位现在」滚动锚定）+ 折叠窗口（首屏 NOW 两侧各 20 条，
 *    「显示更早 / 显示更多」逐档放宽）+ 行内紧凑倒计时（秒级）
 *  - 行详情展开：分类/影响度/约数徽标、完整时刻（含源时区墙钟）、
 *    来源外链（expo-web-browser）、.ics 导出（buildIcs → 临时文件 →
 *    系统分享面板，settings 页同一适配模式）、提醒开关
 *  - 提醒引擎：进入提前窗口（10min）→ 本地通知（notifyLocal 封装）+
 *    success 触感；已开始未触发 → 静默核销（collectDue/markFired 同源）
 *  - 智能空态（进行中为空时预告下一事件与倒计时）/ 下拉刷新（BTC 实时价）
 *
 * 色值一律 useAppTheme().c(token)；半透明为 alpha() 衍生，无第二份色值。
 */

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Animated,
  AppState,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native"
import Svg, { Circle } from "react-native-svg"
import * as Sharing from "expo-sharing"
import * as WebBrowser from "expo-web-browser"
import { File, Paths } from "expo-file-system"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { dateLocale, t } from "@repo/core/i18n"
import { formatPrice } from "@repo/core/format"
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
  sortedEvents,
  srcZone,
  statusCounts,
  type CategoryFilter,
  type EventCategory,
  type EventImpact,
  type MarketEvent,
  type StatusFilter,
} from "@repo/core/events"
import { collectDue, markFired, readReminders } from "@repo/core/eventReminders"
import { useEventReminders } from "@repo/react/useEventReminders"
import { useLive, useMarket } from "@repo/react/MarketData"
import { useLocale, useT } from "@repo/react/i18n"
import { radius } from "@repo/ui-tokens/theme"

import { Card } from "../src/components/ui"
import { hapticImpact, hapticNotify, hapticSelection } from "../src/lib/haptics"
import { notifyLocal } from "../src/lib/notifications"
import { useAppTheme } from "../src/lib/theme"

/** 折叠窗口步长：首屏只渲染 NOW 锚点两侧（或列表头部）各 N 条（web 同源） */
const VISIBLE_STEP = 20

/** 拨盘刻度：满环 = 距事件 7 天（7 天开外恒满环） */
const RING_HORIZON_MS = 7 * 86_400_000

/** token 色值 → 半透明衍生（rgb()/hsl()/#hex 改 alpha；不引入第二份色值） */
function alpha(color: string, a: number): string {
  if (color.startsWith("rgb(")) return color.replace(/^rgb\((.*)\)$/, (_m, inner: string) => `rgba(${inner}, ${a})`)
  if (color.startsWith("hsl(")) return color.replace(/^hsl\((.*)\)$/, (_m, inner: string) => `hsla(${inner}, ${a})`)
  if (color.startsWith("#") && color.length === 7) {
    const hx = Math.round(Math.min(1, Math.max(0, a)) * 255)
      .toString(16)
      .padStart(2, "0")
    return color + hx
  }
  return color
}

/** 当前时间心跳（web useNow 的 iOS 版）：切后台暂停（AppState），
 *  回前台立即对齐一次 —— 省电也不漏秒 */
function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = globalThis.setInterval(() => {
      if (AppState.currentState === "active") setNow(Date.now())
    }, intervalMs)
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setNow(Date.now())
    })
    return () => {
      globalThis.clearInterval(id)
      sub.remove()
    }
  }, [intervalMs])
  return now
}

/** LIVE 呼吸点（web .live-dot 的 pulse-dot 2s 循环） */
function PulseDot({ size = 6, halo = false }: { size?: number; halo?: boolean }) {
  const { c } = useAppTheme()
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.35, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    a.start()
    return () => a.stop()
  }, [v])
  const dot = <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c("primary"), opacity: v }} />
  if (!halo) return dot
  return (
    <View
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: (size + 8) / 2,
        backgroundColor: alpha(c("primary"), 0.2),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {dot}
    </View>
  )
}

/** 日组头标签：相对日期（今天/明天/N 天后…）+ 绝对日期（含星期）— web 同源 */
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

/** 智能空态用的紧凑倒计时文本（web 同源） */
function compactCountdownText(ms: number): string {
  const { d, h, m } = countdownParts(ms)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  return d > 0 ? `${d}${t("ev.cd.d")} ${hh}:${mm}` : `${hh}:${mm}`
}

/* ------------------------------ 徽标 / 状态小件 ------------------------------ */

/** 分类徽标（web CategoryChip）：宏观=primary 描边，加密=灰 */
function CategoryChip({ category }: { category: EventCategory }) {
  const { c } = useAppTheme()
  const macro = category === "macro"
  return (
    <View
      style={[
        s.chipBase,
        macro
          ? { borderColor: alpha(c("primary"), 0.4), backgroundColor: alpha(c("primary"), 0.1) }
          : { borderColor: alpha(c("border"), 0.6), backgroundColor: alpha(c("secondary"), 0.5) },
      ]}
    >
      <Text style={{ color: macro ? c("primary") : c("muted-foreground"), fontSize: 9 }}>
        {macro ? "◆" : "₿"}
      </Text>
      <Text style={[s.chipText, { color: macro ? c("primary") : c("muted-foreground") }]}>
        {t(macro ? "ev.cat.macro" : "ev.cat.crypto")}
      </Text>
    </View>
  )
}

/** 影响度徽标（web ImpactBadge）：高影响 primary */
function ImpactBadge({ impact }: { impact: EventImpact }) {
  const { c } = useAppTheme()
  const high = impact === "high"
  return (
    <View style={[s.chipBase, high ? { borderColor: alpha(c("primary"), 0.4) } : { borderColor: alpha(c("border"), 0.6) }]}>
      <View
        style={{
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: high ? c("primary") : alpha(c("muted-foreground"), 0.5),
        }}
      />
      <Text style={[s.chipText, { color: high ? c("primary") : c("muted-foreground") }]}>
        {t(high ? "ev.impact.high" : "ev.impact.medium")}
      </Text>
    </View>
  )
}

/** 行内迷你影响度（web ImpactMeter）：两根信号条（高=双亮，中=单亮） */
function ImpactMeter({ impact }: { impact: EventImpact }) {
  const { c } = useAppTheme()
  const high = impact === "high"
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
      <View style={{ width: 3, height: 10, borderRadius: 1, backgroundColor: high ? c("primary") : alpha(c("primary"), 0.7) }} />
      <View
        style={{
          width: 3,
          height: 10,
          borderRadius: 1,
          backgroundColor: high ? c("primary") : alpha(c("muted-foreground"), 0.25),
        }}
      />
    </View>
  )
}

/** 紧凑倒计时：3天 13:22:41（天数为 0 时省略天段）；秒级跳动 */
function CompactCountdown({ ms, approx }: { ms: number; approx?: boolean }) {
  const { c } = useAppTheme()
  const { d, h, m, s } = countdownParts(ms)
  const hh = String(h).padStart(2, "0")
  const mm = String(m).padStart(2, "0")
  const ss = String(s).padStart(2, "0")
  return (
    <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 12 }}>
      {approx && "≈"}
      {d > 0 ? `${d}${t("ev.cd.d")} ` : ""}
      {hh}:{mm}:{ss}
    </Text>
  )
}

/** 行右端状态区（web RowStatus）：时间窗 / 进行中 / 已结束 / 倒计时；
 *  秒级心跳在组件内消化，不牵动整页重渲染 */
function RowStatus({ e, locale }: { e: MarketEvent; locale: string }) {
  const now = useNow()
  const { c } = useAppTheme()
  const st = eventStatus(e, now)
  if (e.window) {
    if (st === "finished") {
      return (
        <Text style={{ color: alpha(c("muted-foreground"), 0.7), fontFamily: "JetBrainsMono_400Regular", fontSize: 12 }}>
          {t("ev.status.finished")}
        </Text>
      )
    }
    return (
      <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 10, letterSpacing: 1 }}>
        {locale === "en" ? e.window.en : e.window.zh} · {t("ev.status.tba")}
      </Text>
    )
  }
  if (st === "live") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <PulseDot size={5} />
        <Text style={{ color: c("primary"), fontFamily: "JetBrainsMono_500Medium", fontSize: 12 }}>
          {t("ev.status.live")}
        </Text>
      </View>
    )
  }
  if (st === "finished") {
    return (
      <Text style={{ color: alpha(c("muted-foreground"), 0.7), fontFamily: "JetBrainsMono_400Regular", fontSize: 12 }}>
        {t("ev.status.finished")}
      </Text>
    )
  }
  return <CompactCountdown ms={eventStartMs(e) - now} approx={e.approx} />
}

/** 进行中事件的进度条（web LiveProgressBar）：秒级推进 */
function LiveProgressBar({ e, width = 64 }: { e: MarketEvent; width?: number }) {
  const now = useNow()
  const { c } = useAppTheme()
  const pct = Math.round((eventProgress(e, now) ?? 0) * 100)
  return (
    <View style={{ width, height: 4, borderRadius: 2, backgroundColor: c("secondary"), overflow: "hidden" }}>
      <View style={{ height: 4, borderRadius: 2, width: `${pct}%`, backgroundColor: c("primary") }} />
    </View>
  )
}

/** 轨道节点（web RailDot）：状态决定形态（已结束灰空心 / 进行中脉冲 /
 *  未开始按影响度实心或空心 / 时间窗虚线） */
function RailDot({ e, now }: { e: MarketEvent; now: number }) {
  const { c } = useAppTheme()
  const st = eventStatus(e, now)
  const base: { position: "absolute"; left: number; top: number; width: number; height: number; borderRadius: number; zIndex: number } = {
    position: "absolute",
    left: 8,
    top: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    zIndex: 1,
  }
  if (e.window) {
    return (
      <View
        style={[base, { borderWidth: 1, borderStyle: "dashed", borderColor: alpha(c("primary"), 0.6), backgroundColor: c("background") }]}
      />
    )
  }
  if (st === "live") {
    return (
      <View style={{ position: "absolute", left: 4, top: 12, zIndex: 1, alignItems: "center", justifyContent: "center" }}>
        <PulseDot size={8} halo />
      </View>
    )
  }
  if (st === "finished") {
    return <View style={[base, { borderWidth: 1, borderColor: c("border"), backgroundColor: c("background") }]} />
  }
  if (e.impact === "high") {
    return <View style={[base, { backgroundColor: c("primary") }]} />
  }
  return <View style={[base, { borderWidth: 1, borderColor: alpha(c("primary"), 0.5), backgroundColor: c("background") }]} />
}

/** 「现在」分隔线（web NowDivider）：全部视图里插在最近已结束与首条未结束之间 */
function NowDivider({ onLayout }: { onLayout?: (y: number) => void }) {
  const now = useNow()
  const { c } = useAppTheme()
  return (
    <View
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}
      style={{ position: "relative", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingLeft: 28 }}
    >
      <View style={{ position: "absolute", left: 4, top: 0, bottom: 0, width: 16, alignItems: "center", justifyContent: "center" }}>
        <PulseDot size={8} halo />
      </View>
      <Text
        style={{
          color: c("primary"),
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 10,
          letterSpacing: 2.5,
        }}
      >
        {t("ev.now")}
      </Text>
      <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 10 }}>
        {new Date(now).toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
      </Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: alpha(c("primary"), 0.4) }} />
    </View>
  )
}

/* ------------------------------ 行详情面板 ------------------------------ */

/** 浏览器内导出 .ics 的 iOS 对应：buildIcs → 缓存临时文件 → 系统分享面板 */
async function shareIcs(e: MarketEvent, locale: string): Promise<void> {
  try {
    const ics = buildIcs(e, locale === "en" ? "en" : "zh")
    const file = new File(Paths.cache, `${e.id}.ics`)
    file.write(ics, { encoding: "utf8" })
    await Sharing.shareAsync(file.uri, { mimeType: "text/calendar", dialogTitle: t("ev.ics") })
  } catch {
    /* 分享不可用不阻塞主流程 */
  }
}

/** 展开面板（web EventRow 详情区）：徽标 + 描述 + 完整时刻 + 源时区 + 来源 + 动作 */
function DetailPanel({
  e,
  locale,
  reminderOn,
  onToggleReminder,
}: {
  e: MarketEvent
  locale: string
  reminderOn: boolean
  onToggleReminder: () => void
}) {
  const { c } = useAppTheme()
  const fade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [fade])

  const start = new Date(eventStartMs(e))
  const desc = locale === "en" ? e.descEn : e.descZh
  const zone = srcZone(e)
  const canRemind = eventStatus(e, Date.now()) === "upcoming" && !e.window

  const dateText = e.approx
    ? start.toLocaleDateString(dateLocale(), { year: "numeric", month: "long", day: "numeric" })
    : start.toLocaleString(dateLocale(), {
        year: "numeric",
        month: "short",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })

  return (
    <Animated.View style={[{ marginLeft: 28, marginRight: 2, marginBottom: 6, opacity: fade }]}>
      <View
        style={{
          borderRadius: radius.md,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: alpha(c("border"), 0.6),
          backgroundColor: alpha(c("secondary"), 0.3),
          padding: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
          <CategoryChip category={e.category} />
          <ImpactBadge impact={e.impact} />
          {e.approx && (
            <View style={[s.chipBase, { borderColor: alpha(c("border"), 0.6) }]}>
              <Text style={[s.chipText, { color: c("muted-foreground") }]}>≈ {t("ev.approxTip")}</Text>
            </View>
          )}
        </View>

        {desc && (
          <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 18 }}>
            {desc}
          </Text>
        )}

        <View style={{ gap: 3 }}>
          <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
            {dateText}
          </Text>
          {!e.approx && zone && (
            <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
              {locale === "en" ? zone.en : zone.zh}{" "}
              {start.toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", {
                timeZone: zone.iana,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </Text>
          )}
          {e.source && (
            <Pressable
              onPress={() => void WebBrowser.openBrowserAsync(e.source!.url)}
              accessibilityRole="link"
              hitSlop={4}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
                {e.source.label} ↗
              </Text>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 2 }}>
          <Pressable
            onPress={() => {
              hapticImpact("light")
              void shareIcs(e, locale)
            }}
            accessibilityRole="button"
            hitSlop={4}
            style={({ pressed }) => [
              s.actionBtn,
              { borderColor: c("border"), opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: c("foreground"), fontSize: 12 }}>🗓 {t("ev.ics")}</Text>
          </Pressable>
          {canRemind && (
            <Pressable
              onPress={onToggleReminder}
              accessibilityRole="button"
              accessibilityState={{ selected: reminderOn }}
              hitSlop={4}
              style={({ pressed }) => [
                s.actionBtn,
                reminderOn
                  ? { backgroundColor: c("primary"), borderColor: c("primary"), opacity: pressed ? 0.8 : 1 }
                  : { borderColor: c("border"), opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text
                style={{
                  color: reminderOn ? c("primary-foreground") : c("foreground"),
                  fontSize: 12,
                }}
              >
                {reminderOn ? `◉ ${t("ev.remind.cancel")}` : `○ ${t("ev.remind.add")}`}
              </Text>
            </Pressable>
          )}
          {canRemind && (
            <Text style={{ color: alpha(c("muted-foreground"), 0.7), fontFamily: "JetBrainsMono_400Regular", fontSize: 10 }}>
              {t("ev.remind.hint")}
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  )
}

/* ------------------------------ 时间线事件行 ------------------------------ */

/** 时间线事件行（web EventRow）：可展开详情（触控 ≥44pt；行高对齐移动端节奏） */
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
  const { c } = useAppTheme()
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

  // 展开箭头旋转（web chevron rotate-180 150ms）
  const chev = useRef(new Animated.Value(0)).current
  const chevRot = chev.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] })
  useEffect(() => {
    Animated.timing(chev, { toValue: open ? 1 : 0, duration: 150, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }, [open, chev])

  return (
    <View style={{ opacity: st === "finished" ? 0.6 : 1 }}>
      <RailDot e={e} now={now} />
      <Pressable
        onPress={() => {
          hapticSelection()
          onToggle()
        }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${t("ev.row.expandSr")}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            minHeight: 48,
            paddingVertical: 8,
            paddingLeft: 28,
            paddingRight: 2,
            borderRadius: radius.md,
            backgroundColor: st === "live" ? alpha(c("primary"), 0.05) : "transparent",
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text
          style={{ width: 46, paddingTop: 2, color: c("muted-foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 12 }}
        >
          {timeText}
        </Text>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              numberOfLines={1}
              style={{ flexShrink: 1, color: st === "live" ? c("primary") : c("foreground"), fontSize: 14, fontWeight: "600" }}
            >
              {title}
            </Text>
            {reminderOn && (
              <Text accessibilityLabel={t("ev.remind.set")} style={{ color: c("primary"), fontSize: 10 }}>
                ◉
              </Text>
            )}
            <ImpactMeter impact={e.impact} />
            <Animated.Text style={{ color: alpha(c("muted-foreground"), 0.5), fontSize: 10, transform: [{ rotate: chevRot }] }}>
              ▾
            </Animated.Text>
          </View>
          {!open && desc && (
            <Text numberOfLines={1} style={{ marginTop: 2, paddingRight: 6, color: c("muted-foreground"), fontSize: 12, lineHeight: 16 }}>
              {desc}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4, paddingTop: 2 }}>
          <RowStatus e={e} locale={locale} />
          {st === "live" && e.end && <LiveProgressBar e={e} />}
        </View>
      </Pressable>
      {open && <DetailPanel e={e} locale={locale} reminderOn={reminderOn} onToggleReminder={onToggleReminder} />}
    </View>
  )
}

/* ------------------------------ 英雄卡 ------------------------------ */

/** 「天」拨盘（web DayDial）：数字盒外的 SVG 倒计时环 — 满环 7 天，
 *  primary 弧 = 剩余占比；弧长随剩余时间逐秒平滑收敛 */
function DayDial({ frac, children }: { frac: number; children: ReactNode }) {
  const { c } = useAppTheme()
  const circ = 2 * Math.PI * 16.5
  return (
    <View style={{ width: 56, height: 56, alignItems: "center", justifyContent: "center" }}>
      <Svg width={56} height={56} viewBox="0 0 36 36" style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={18} cy={18} r={16.5} fill="none" strokeWidth={2} stroke={alpha(c("border"), 0.6)} />
        <Circle
          cx={18}
          cy={18}
          r={16.5}
          fill="none"
          strokeWidth={2}
          stroke={c("primary")}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - frac)}
          strokeLinecap="round"
        />
      </Svg>
      {children}
    </View>
  )
}

/** 倒计时数字盒（web CountdownBoxes）：天位为拨盘环，时/分/秒为线盒；
 *  秒级跳动由内部心跳驱动 */
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
  const { c } = useAppTheme()
  // 注意：解构出的秒位重命名为 sec，避免遮蔽模块级 StyleSheet 变量 s
  const { d, h, m, s: sec } = countdownParts(Math.abs(mode === "until" ? start - now : now - start))
  // 进行中：环走满；未开始：剩余占比，7 天开外钳到 1
  const frac = mode === "since" ? 1 : Math.min(1, Math.max(0, (start - now) / RING_HORIZON_MS))
  const units: [number, string][] = [
    [h, t("ev.cd.h")],
    [m, t("ev.cd.m")],
    [sec, t("ev.cd.s")],
  ]
  return (
    <View accessibilityRole="timer" style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      {approx && (
        <Text style={{ paddingTop: 18, color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 16 }}>
          ≈
        </Text>
      )}
      <View style={{ width: 56, alignItems: "center", gap: 4 }}>
        <DayDial frac={frac}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 19 }}
          >
            {String(d).padStart(2, "0")}
          </Text>
        </DayDial>
        <Text style={[s.unitLabel, { color: c("muted-foreground") }]}>{t("ev.cd.d")}</Text>
      </View>
      {units.map(([v, label]) => (
        <View key={label} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <Text style={{ paddingTop: 15, color: alpha(c("muted-foreground"), 0.5), fontFamily: "JetBrainsMono_500Medium", fontSize: 15 }}>
            :
          </Text>
          <View style={{ width: 46, alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: "100%",
                borderRadius: radius.md,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: alpha(c("border"), 0.6),
                backgroundColor: alpha(c("secondary"), 0.4),
                paddingVertical: 7,
                alignItems: "center",
              }}
            >
              <Text
                maxFontSizeMultiplier={1.2}
                style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 19 }}
              >
                {String(v).padStart(2, "0")}
              </Text>
            </View>
            <Text style={[s.unitLabel, { color: c("muted-foreground") }]}>{label}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

/** 英雄卡进行中进度（web HeroLiveProgress）：百分比标签 + 进度条 */
function HeroLiveProgress({ e }: { e: MarketEvent }) {
  const now = useNow()
  const { c } = useAppTheme()
  const pct = Math.round((eventProgress(e, now) ?? 0) * 100)
  return (
    <View style={{ alignSelf: "stretch", maxWidth: 240 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={s.miniLabel}>{t("ev.hero.progress")}</Text>
        <Text style={[s.miniLabel, { color: c("muted-foreground") }]}>{pct}%</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c("secondary"), overflow: "hidden" }}>
        <View style={{ height: 6, borderRadius: 3, width: `${pct}%`, backgroundColor: c("primary") }} />
      </View>
    </View>
  )
}

/** 英雄卡（web HeroCard）：下一个关键事件 / 正在进行（倒计时 + BTC 实时观测） */
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
  const { c } = useAppTheme()
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
    <Card style={live ? { borderColor: alpha(c("primary"), 0.3) } : undefined}>
      {/* 眉题：live 呼吸点 + 状态 / 下一关键事件 + EN kicker */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {live && <PulseDot size={5} />}
          <Text style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" }}>
            {live ? t("ev.status.live") : t("ev.hero.next")}
          </Text>
        </View>
        <Text style={{ color: alpha(c("muted-foreground"), 0.6), fontFamily: "JetBrainsMono_500Medium", fontSize: 9, letterSpacing: 2, textTransform: "uppercase" }}>
          {live ? "HAPPENING NOW" : "NEXT KEY EVENT"}
        </Text>
      </View>

      <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 18, fontWeight: "700", lineHeight: 24 }}>
        {title}
      </Text>
      <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 12, lineHeight: 17 }}>
        {event.approx && "≈ "}
        {whenText}
        {!event.approx && zone ? `  ·  ${locale === "en" ? zone.en : zone.zh} ${new Date(start).toLocaleTimeString(locale === "en" ? "en-US" : "zh-CN", { timeZone: zone.iana, hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <CategoryChip category={event.category} />
        <ImpactBadge impact={event.impact} />
        {event.source && (
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(event.source!.url)}
            accessibilityRole="link"
            hitSlop={4}
            style={({ pressed }) => [s.chipBase, { borderColor: alpha(c("border"), 0.6), opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={[s.chipText, { color: c("muted-foreground") }]}>{event.source.label} ↗</Text>
          </Pressable>
        )}
      </View>

      {/* 事件窗口的实时市场观测：BTC 秒级价格 */}
      {btc && (
        <View
          style={{
            alignSelf: "flex-start",
            borderRadius: radius.md,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: alpha(c("border"), 0.6),
            backgroundColor: alpha(c("secondary"), 0.3),
            paddingHorizontal: 12,
            paddingVertical: 8,
            gap: 2,
          }}
        >
          <Text style={[s.miniLabel, { letterSpacing: 2.5, textTransform: "uppercase" }]}>{t("ev.hero.btc")}</Text>
          <Text style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 17 }}>
            ${formatPrice(btc.price)}
          </Text>
          <Text
            style={{
              fontFamily: "JetBrainsMono_400Regular",
              fontSize: 12,
              color:
                btc.changePct == null
                  ? c("muted-foreground")
                  : Math.abs(btc.changePct) < 0.05
                    ? c("muted-foreground")
                    : btc.changePct >= 0
                      ? c("up")
                      : c("down"),
            }}
          >
            {btc.changePct == null
              ? "—"
              : `${btc.changePct >= 0 ? "+" : ""}${btc.changePct.toFixed(2)}%`}
          </Text>
        </View>
      )}

      <CountdownBoxes start={start} mode={live ? "since" : "until"} approx={event.approx} />
      {live && event.end && <HeroLiveProgress e={event} />}

      {desc && (
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 18 }}>
          {desc}
        </Text>
      )}

      {after && afterTitle && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: alpha(c("border"), 0.5),
            paddingTop: 10,
          }}
        >
          <Text style={{ color: alpha(c("primary"), 0.7), fontFamily: "JetBrainsMono_500Medium", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
            {t("ev.nextUp").toUpperCase()}
          </Text>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: alpha(c("foreground"), 0.8), fontSize: 12, fontWeight: "600" }}>
            {afterTitle}
          </Text>
          <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
            {new Date(eventStartMs(after)).toLocaleString(dateLocale(), {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </Text>
        </View>
      )}
    </Card>
  )
}

/* ------------------------------ 分段筛选 ------------------------------ */

/** 分段单选（web Segmented）：muted 底 + 激活 pill；选择触感 selection */
function Segmented<T extends string>({
  value,
  onChange,
  items,
  label,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
  label: string
}) {
  const { c } = useAppTheme()
  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: "row", backgroundColor: c("muted"), borderRadius: radius.md, padding: 3, gap: 2 }}
    >
      {items.map((it) => {
        const active = it.value === value
        return (
          <Pressable
            key={it.value}
            hitSlop={4}
            onPress={() => {
              if (!active) {
                hapticSelection()
                onChange(it.value)
              }
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 38,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.sm,
              paddingHorizontal: 6,
              paddingVertical: 6,
              backgroundColor: active ? c("background") : "transparent",
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: active ? c("primary") : c("muted-foreground"), fontSize: 12, fontWeight: "500" }}
            >
              {it.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ------------------------------ 页面 ------------------------------ */

export default function EventsScreen() {
  useT() // 订阅语言切换
  const { locale } = useLocale()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { height: winH } = useWindowDimensions()
  const { snapshot, refreshing, refresh } = useMarket()
  const tickers = useLive()
  const { reminders, toggle } = useEventReminders()

  // 页面级时间粒度 5s（web 同源）：状态/筛选/分组/英雄卡是分钟级语义，
  // 秒级跳动（倒计时、进度、NOW 钟点）由各显示组件内部 useNow() 消化
  const now = useNow(5_000)
  const [statusF, setStatusF] = useState<StatusFilter>("all")
  const [catF, setCatF] = useState<CategoryFilter>("all")
  const [openId, setOpenId] = useState<string | null>(null)
  // 折叠窗口宽度：NOW 锚点向前（更早的已结束）/向后（更远的未结束）各一档
  const [earlierLimit, setEarlierLimit] = useState(VISIBLE_STEP)
  const [laterLimit, setLaterLimit] = useState(VISIBLE_STEP)

  // 切筛选/类别回到初始窗口（不同列表的折叠量不可比）
  useEffect(() => {
    setEarlierLimit(VISIBLE_STEP)
    setLaterLimit(VISIBLE_STEP)
  }, [statusF, catF])

  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "—", [])

  const filtered = useMemo(() => filterEvents(MARKET_EVENTS, now, statusF, catF), [now, statusF, catF])
  const hero = useMemo(() => heroEvent(MARKET_EVENTS, now), [now])
  // 「随后」预告：英雄卡之外最近的未结束事件
  const after = useMemo(
    () =>
      sortedEvents(
        MARKET_EVENTS.filter((e) => e.id !== hero?.id && !e.window && eventStatus(e, now) !== "finished")
      )[0] ?? null,
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

  // 提醒引擎（web EventReminderEngine 的页内版）：读库（不闭包 state）→
  // collectDue 到期检查 → 本地通知 + success 触感；已开始（错过窗口）静默核销
  useEffect(() => {
    const plan = collectDue(MARKET_EVENTS, readReminders(), now)
    for (const id of plan.toExpire) markFired(id)
    for (const e of plan.toFire) {
      markFired(e.id)
      hapticNotify("success")
      const when = new Date(eventStartMs(e)).toLocaleTimeString(dateLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      void notifyLocal(
        t("ev.toast.title"),
        t("ev.toast.desc", { title: locale === "en" ? e.en : e.zh, time: when })
      )
    }
  }, [now, locale])

  const btcLive = tickers.bitcoin ?? null
  const btcFallback = snapshot?.coins.find((x) => x.id === "bitcoin") ?? null
  const btc =
    btcLive != null
      ? { price: btcLive.price, changePct: btcLive.changePct }
      : btcFallback != null
        ? {
            price: btcFallback.current_price,
            changePct: btcFallback.price_change_percentage_24h_in_currency ?? null,
          }
        : null

  // 「全部」视图的 NOW 分隔线锚点：首条未结束事件之前；全部已结束时放在列表末尾
  let markerId: string | null = null
  let markerIdx = 0
  if (statusF === "all") {
    const idx = filtered.findIndex((e) => eventStatus(e, now) !== "finished")
    markerIdx = idx === -1 ? filtered.length : idx
    markerId = idx === -1 ? "__end__" : filtered[idx].id
  }

  /* 折叠窗口（web 同源）：「全部」视图首屏只渲染锚点两侧各 VISIBLE_STEP 条，
   * 其余视图只留前 laterLimit 条 —— 更早的折叠在顶部、更远的折叠在底部 */
  const { shown, hiddenBefore, hiddenAfter } = useMemo(() => {
    if (statusF === "all") {
      const start = Math.max(0, markerIdx - earlierLimit)
      const end = Math.min(filtered.length, markerIdx + laterLimit)
      return { shown: filtered.slice(start, end), hiddenBefore: start, hiddenAfter: filtered.length - end }
    }
    const end = Math.min(filtered.length, laterLimit)
    return { shown: filtered.slice(0, end), hiddenBefore: 0, hiddenAfter: filtered.length - end }
  }, [filtered, statusF, markerIdx, earlierLimit, laterLimit])

  const groups = useMemo(() => groupEventsByDay(shown), [shown])

  const toggleReminder = (id: string) => {
    const on = toggle(id)
    // 新增提醒 = light impact；取消 = selection（触感规范）
    if (on) hapticImpact("light")
    else hapticSelection()
  }

  /* 滚动几何：贯穿轨道随滚动生长（前沿追踪视口中线）+ 「定位现在」锚定。
   * 逐帧 setValue 直写（web TimelineRail 的 rAF 直写同口径） */
  const scrollRef = useRef<ScrollView | null>(null)
  const scrollYRef = useRef(0)
  const railFill = useRef(new Animated.Value(0)).current
  const layout = useRef({
    cardY: 0,
    wrapY: 0,
    railY: 0,
    railH: 0,
    groupY: {} as Record<number, number>,
    marker: null as null | { gi: number; y: number },
  })

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y
    scrollYRef.current = y
    const L = layout.current
    const railTop = L.cardY + L.wrapY + L.railY
    const grown = Math.min(Math.max(winH * 0.5 - railTop + y, 0), L.railH)
    railFill.setValue(grown)
  }

  const locateNow = () => {
    hapticSelection()
    const L = layout.current
    const m = L.marker
    if (!m) return
    const absY = L.cardY + L.wrapY + (L.groupY[m.gi] ?? 0) + m.y
    scrollRef.current?.scrollTo({ y: Math.max(0, absY - winH * 0.5 + 24), animated: true })
  }

  const segCount = (n: number) => (
    <Text style={{ fontSize: 10, opacity: 0.55 }}> {n}</Text>
  )

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: c("background") }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: insets.bottom + 28, gap: 12 }}
      scrollEventThrottle={16}
      onScroll={onScroll}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => refresh()} tintColor={c("primary")} progressBackgroundColor={c("card")} />
      }
    >
      {/* 页头（web PageHeader 节奏） */}
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              color: c("primary"),
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 10,
              letterSpacing: 3.2,
              textTransform: "uppercase",
            }}
          >
            Event Calendar
          </Text>
          <View style={{ width: 24, height: StyleSheet.hairlineWidth, backgroundColor: alpha(c("primary"), 0.4) }} />
        </View>
        <Text maxFontSizeMultiplier={1.35} style={{ color: c("foreground"), fontSize: 22, fontWeight: "700", letterSpacing: 0.2 }}>
          {t("page.events.title")}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 17 }}>
          {t("page.events.desc", { tz })}
        </Text>
        <View style={{ gap: 8, marginTop: 2 }}>
          <Segmented
            label={t("ev.filter.status")}
            value={statusF}
            onChange={setStatusF}
            items={[
              { value: "all", label: <Text>{t("ev.f.all")}{segCount(MARKET_EVENTS.length)}</Text> },
              { value: "upcoming", label: <Text>{t("ev.f.upcoming")}{segCount(counts.upcoming)}</Text> },
              { value: "live", label: <Text>{t("ev.f.live")}{segCount(counts.live)}</Text> },
              { value: "finished", label: <Text>{t("ev.f.finished")}{segCount(counts.finished)}</Text> },
            ]}
          />
          <Segmented
            label={t("ev.filter.cat")}
            value={catF}
            onChange={setCatF}
            items={[
              { value: "all", label: t("ev.cat.all") },
              { value: "macro", label: <Text>◆ {t("ev.cat.macro")}{segCount(catCounts.macro)}</Text> },
              { value: "crypto", label: <Text>₿ {t("ev.cat.crypto")}{segCount(catCounts.crypto)}</Text> },
            ]}
          />
        </View>
      </View>

      {hero && <HeroCard event={hero} after={after} now={now} locale={locale} btc={btc} />}

      <View onLayout={(e) => (layout.current.cardY = e.nativeEvent.layout.y)}>
        <Card>
          {/* 卡头：标题 + 条数/排序 + 定位现在 */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 32 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: c("foreground"), fontSize: 15, fontWeight: "600" }}>
                {t("ev.timeline.title")}
              </Text>
              <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 10 }}>
                {t("ev.timeline.count", { n: filtered.length })} · {t(statusF === "finished" ? "ev.order.desc" : "ev.order.asc")}
              </Text>
            </View>
            {statusF === "all" && (
              <Pressable
                onPress={locateNow}
                accessibilityRole="button"
                hitSlop={6}
                style={({ pressed }) => [
                  {
                    minHeight: 36,
                    borderRadius: 18,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: c("border"),
                    paddingHorizontal: 10,
                    justifyContent: "center",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Text style={{ color: c("muted-foreground"), fontSize: 10 }}>⌖</Text>
                <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 10 }}>
                  {t("ev.locateNow")}
                </Text>
              </Pressable>
            )}
          </View>

          {filtered.length === 0 ? (
            /* 智能空态：进行中为空时预告下一事件与紧凑倒计时（web 同源） */
            <View style={{ minHeight: 128, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16 }}>
              <Text style={{ color: alpha(c("muted-foreground"), 0.5), fontSize: 16 }}>◷</Text>
              <Text style={{ color: c("foreground"), fontSize: 14, fontWeight: "600" }}>
                {statusF === "live" ? t("ev.empty.live.title") : t("ev.empty.title")}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 17, textAlign: "center", maxWidth: 280 }}
              >
                {statusF === "live" && hero
                  ? t("ev.empty.live.desc", {
                      title: locale === "en" ? hero.en : hero.zh,
                      t: compactCountdownText(eventStartMs(hero) - now),
                    })
                  : t("ev.empty.desc")}
              </Text>
            </View>
          ) : (
            <View
              onLayout={(e) => (layout.current.wrapY = e.nativeEvent.layout.y)}
              style={{ position: "relative" }}
            >
              {/* 贯穿全时间线的生长轨道：灰线打底，primary 线随滚动生长，节点盖线之上 */}
              <View
                onLayout={(e) => {
                  layout.current.railY = e.nativeEvent.layout.y
                  layout.current.railH = e.nativeEvent.layout.height
                }}
                style={{
                  position: "absolute",
                  left: 12,
                  top: 8,
                  bottom: 8,
                  width: 1,
                  backgroundColor: alpha(c("border"), 0.6),
                  zIndex: 0,
                }}
              >
                <Animated.View style={{ width: 1, backgroundColor: c("primary"), height: railFill }} />
              </View>

              {hiddenBefore > 0 && (
                /* 更早的已结束事件折叠在顶部（「全部」视图截头侧） */
                <View style={{ alignItems: "center", paddingVertical: 6 }}>
                  <Pressable
                    onPress={() => setEarlierLimit((n) => n + VISIBLE_STEP)}
                    accessibilityRole="button"
                    hitSlop={4}
                    style={({ pressed }) => [
                      s.foldBtn,
                      { borderColor: pressed ? alpha(c("foreground"), 0.5) : c("border"), opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={{ color: c("muted-foreground"), fontSize: 10 }}>▴</Text>
                    <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
                      {t("ev.showEarlier", { n: hiddenBefore })}
                    </Text>
                  </Pressable>
                </View>
              )}

              {groups.map((g, gi) => (
                <View key={g.dayKey} onLayout={(e) => (layout.current.groupY[gi] = e.nativeEvent.layout.y)}>
                  {/* 日组头：相对日期 + 绝对日期（含星期） */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}>
                    <Text
                      style={{
                        color: c("foreground"),
                        fontFamily: "JetBrainsMono_500Medium",
                        fontSize: 11,
                        letterSpacing: 1.5,
                      }}
                    >
                      {dayLabel(g.dayKey, now)}
                    </Text>
                    <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: alpha(c("border"), 0.6) }} />
                  </View>
                  {g.events.map((e) => (
                    <Fragment key={e.id}>
                      {markerId === e.id && (
                        <NowDivider onLayout={(y) => (layout.current.marker = { gi, y })} />
                      )}
                      <EventRow
                        e={e}
                        now={now}
                        locale={locale}
                        open={openId === e.id}
                        onToggle={() => setOpenId((cur) => (cur === e.id ? null : e.id))}
                        reminderOn={reminders[e.id] != null}
                        onToggleReminder={() => toggleReminder(e.id)}
                      />
                    </Fragment>
                  ))}
                  {markerId === "__end__" && gi === groups.length - 1 && (
                    <NowDivider onLayout={(y) => (layout.current.marker = { gi, y })} />
                  )}
                </View>
              ))}

              {hiddenAfter > 0 && (
                /* 更远的未结束/更旧的事件折叠在底部（截尾侧） */
                <View style={{ alignItems: "center", paddingVertical: 6 }}>
                  <Pressable
                    onPress={() => setLaterLimit((n) => n + VISIBLE_STEP)}
                    accessibilityRole="button"
                    hitSlop={4}
                    style={({ pressed }) => [
                      s.foldBtn,
                      { borderColor: pressed ? alpha(c("foreground"), 0.5) : c("border"), opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={{ color: c("muted-foreground"), fontSize: 10 }}>▾</Text>
                    <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
                      {t("ev.showMore", { n: hiddenAfter })}
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
          )}
        </Card>
      </View>

      <Text
        maxFontSizeMultiplier={1.3}
        style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 10, lineHeight: 16, textAlign: "center" }}
      >
        {t("ev.note")}
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  chipBase: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  chipText: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    letterSpacing: 1,
  },
  actionBtn: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
  },
  foldBtn: {
    minHeight: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    justifyContent: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "transparent",
  },
  unitLabel: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 9,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  miniLabel: {
    fontFamily: "JetBrainsMono_400Regular",
    fontSize: 10,
    letterSpacing: 1,
  },
})
