/**
 * 价格预警（Stack）— apps/web/src/pages/AlertsPage.tsx 的 iOS 移植：
 *  - 新建：币种（仅 TRADE_SYMBOLS 覆盖集，与 web 同源约束）/ 上穿下穿分段 /
 *    目标价（mono 键盘）/ ±5% ±10% ±20% 快捷模板 + 整数关口（roundTarget
 *    逐字移植）/ MAX_ALERTS 上限与错误文案
 *  - 进行中：实时价（useLive）+ 快照价兜底、距离百分比与接近度微型进度
 *    （closeness 移植）、删除两步确认（useTwoStepConfirm 共享 hook）
 *  - 触发历史：触发价 / 触发时间（dateLocale 感知）、重新武装、新转入行
 *    涨色渐隐涂层（flash 机制移植）、清空历史两步确认
 *  - 触发引擎：web AlertEngine 的页面作用域移植 —— 页面文案（al.note /
 *    page.alerts.desc）本就披露「仅本页打开时生效」；实时价缺失回退快照价
 *    的兜底与 web 一致。触发 → 本页 toast 横幅 + 本地通知（notifyLocal，
 *    提示音开启时；iOS 横幅自带系统提示音，与 web beep 语义对齐）+
 *    success 触感（提示音关时降级 warning 触感，页内反馈保留）
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Notifications from "expo-notifications"

import { t } from "@repo/core/i18n"
import { distancePct, isTriggered, MAX_ALERTS, type AlertKind } from "@repo/core/alerts"
import { formatPrice, parseNum } from "@repo/core/format"
import { TRADE_SYMBOLS } from "@repo/data/realtime-source"
import { useAlerts } from "@repo/react/useAlerts"
import { useT } from "@repo/react/i18n"
import { useLive, useMarket } from "@repo/react/MarketData"
import { useTwoStepConfirm } from "@repo/react/useTwoStepConfirm"
import { radius } from "@repo/ui-tokens/theme"

import { Card, CardTitle, Row, Txt } from "../src/components/ui"
import { useAppTheme } from "../src/lib/theme"
import { hapticImpact, hapticNotify, hapticSelection } from "../src/lib/haptics"
import { notifyLocal } from "../src/lib/notifications"

import {
  Avatar,
  EmptyState,
  F,
  GlyphButton,
  KindBadge,
  PageHeader,
  Pill,
  ScreenScroll,
  SkFormCard,
  SkPageHeader,
  formatDateTime,
} from "../src/components/settings-shared"

/* ------------------------------ 纯函数（web 逐字移植） ------------------------------ */

/** 目标价预设模板：±5% / ±10% / ±20% */
const PRESETS = [
  { mult: 1.05, label: "+5%" },
  { mult: 1.1, label: "+10%" },
  { mult: 1.2, label: "+20%" },
  { mult: 0.95, label: "−5%" },
  { mult: 0.9, label: "−10%" },
  { mult: 0.8, label: "−20%" },
]

/** 数量级 1/10 的整数关口：67,432 → 1,000 步进（above 68,000 / below 67,000） */
function roundTarget(p: number, kind: AlertKind): number {
  const step = Math.pow(10, Math.floor(Math.log10(p)) - 1)
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  const raw = kind === "above" ? Math.ceil(p / step) * step : Math.floor(p / step) * step
  const v = kind === "above" ? (raw <= p ? raw + step : raw) : raw >= p ? raw - step : raw
  return Number(v.toFixed(dec))
}

/** 距离 → 接近度：距目标 20% 以上为 0，触达目标为 1（进度条填充比例） */
function closeness(dist: number): number {
  return Math.max(0, Math.min(1, 1 - Math.abs(dist) / 20))
}

/** expo-notifications 权限态（权限胶囊用；触发统一走 src/lib/notifications 封装） */
type PermState = "undetermined" | "granted" | "denied"

async function readPerm(): Promise<PermState> {
  try {
    const p = await Notifications.getPermissionsAsync()
    if (p.granted) return "granted"
    return p.canAskAgain === false ? "denied" : "undetermined"
  } catch {
    return "undetermined"
  }
}

/* ------------------------------ 页面 ------------------------------ */

export default function AlertsScreen() {
  useT()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { snapshot, loading, refreshing, refresh } = useMarket()
  const tickers = useLive()
  const { alerts, add, remove, rearm, clearTriggered, markTriggered, sound, setSound } = useAlerts()
  const params = useLocalSearchParams<{ coin?: string }>()

  const [coinId, setCoinId] = useState(() =>
    typeof params.coin === "string" && params.coin ? params.coin : "bitcoin",
  )
  const [kind, setKind] = useState<AlertKind>("above")
  const [price, setPrice] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [perm, setPerm] = useState<PermState>("undetermined")
  const [toast, setToast] = useState<{ title: string; desc: string } | null>(null)
  // 两个二次确认各自独立实例（与 web / Portfolio 同一套防御）
  const deleteConfirm = useTwoStepConfirm<string>()
  const clearConfirm = useTwoStepConfirm<true>()

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])
  const active = useMemo(() => alerts.filter((a) => a.status === "active"), [alerts])
  const triggered = useMemo(
    () =>
      alerts
        .filter((a) => a.status === "triggered")
        .sort((a, b) => (b.triggeredAt ?? 0) - (a.triggeredAt ?? 0)),
    [alerts],
  )
  const full = alerts.length >= MAX_ALERTS

  // 新转入历史的行闪现：以 id:triggeredAt 为键跟踪已见行（首屏存量不闪）
  const [seenKeys] = useState(() => new Set(triggered.map((a) => a.id + ":" + (a.triggeredAt ?? 0))))
  const flashKeys = useMemo(
    () =>
      new Set(
        triggered
          .filter((a) => !seenKeys.has(a.id + ":" + (a.triggeredAt ?? 0)))
          .map((a) => a.id + ":" + (a.triggeredAt ?? 0)),
      ),
    [triggered, seenKeys],
  )
  useEffect(() => {
    for (const a of triggered) seenKeys.add(a.id + ":" + (a.triggeredAt ?? 0))
  }, [triggered, seenKeys])

  const priceOf = (id: string) =>
    tickers[id]?.price ?? coins.find((cn) => cn.id === id)?.current_price ?? null
  // 可创建预警的币只列实时源（TRADE_SYMBOLS）覆盖的 —— 与 web 同源约束：
  // 可选集与推送集一致，新建规则才一定有价可判
  const selectable = useMemo(() => coins.filter((cn) => TRADE_SYMBOLS[cn.id] != null), [coins])
  const validCoinId =
    selectable.length === 0 || selectable.some((cn) => cn.id === coinId) ? coinId : selectable[0].id
  const curPrice = priceOf(validCoinId)
  const selectedCoin = coins.find((cn) => cn.id === validCoinId)

  // 通知权限态：挂载读取 + 请求后刷新（web 的 permTick 对应物）
  useEffect(() => {
    void readPerm().then(setPerm)
  }, [])

  // toast 自动消退（web ttl 4500ms）
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4500)
    return () => clearTimeout(timer)
  }, [toast])

  /* ------------------------------ 触发引擎（页面作用域） ------------------------------ */

  const snapshotPrices = useMemo(() => {
    const m = new Map<string, number>()
    for (const cn of snapshot?.coins ?? []) m.set(cn.id, cn.current_price)
    return m
  }, [snapshot])

  useEffect(() => {
    if (alerts.length === 0) return
    for (const rule of alerts) {
      if (rule.status !== "active") continue
      const price = tickers[rule.coinId]?.price ?? snapshotPrices.get(rule.coinId)
      if (price == null || !Number.isFinite(price)) continue
      if (isTriggered(rule, price)) {
        markTriggered(rule.id, price)
        const title = t("al.toast.title", { symbol: rule.symbol.toUpperCase() })
        const desc = t("al.toast.desc", {
          kind: t(rule.kind === "above" ? "al.kind.above" : "al.kind.below"),
          price: formatPrice(price),
          target: formatPrice(rule.price),
        })
        setToast({ title, desc })
        // iOS 横幅自带系统提示音（notifyLocal 固定 sound:default），
        // 提示音关闭即不弹横幅；页内闪烁涂层 + 触感反馈两种状态下都保留
        if (sound) void notifyLocal(title, desc)
        hapticNotify(sound ? "success" : "warning")
      }
    }
  }, [tickers, snapshotPrices, alerts, sound, markTriggered])

  /* ------------------------------ 动作 ------------------------------ */

  const requestPerm = () => {
    void Notifications.requestPermissionsAsync()
      .then(() => readPerm())
      .then(setPerm)
  }

  const submit = () => {
    const v = parseNum(price)
    if (!Number.isFinite(v) || v <= 0) {
      setError(t("al.create.invalid"))
      return
    }
    const sym = (selectedCoin?.symbol ?? validCoinId).toUpperCase()
    const rule = add({ coinId: validCoinId, symbol: sym, kind, price: v })
    if (!rule) {
      setError(t("al.create.full", { n: MAX_ALERTS }))
      return
    }
    setError(null)
    setPrice("")
    hapticImpact("light")
    setToast({
      title: t("al.created.title"),
      desc: t("al.created.desc", {
        symbol: sym,
        kind: t(kind === "above" ? "al.kind.above" : "al.kind.below"),
        target: formatPrice(v),
      }),
    })
    // 借用户手势请求通知权限（拒绝不阻断创建，页内 toast 仍有效）
    if (perm === "undetermined") requestPerm()
  }

  const quick = (mult: number) => {
    if (curPrice == null || curPrice <= 0) return
    setKind(mult > 1 ? "above" : "below")
    setPrice((curPrice * mult).toFixed(curPrice >= 1000 ? 0 : 2))
    setError(null)
    hapticSelection()
  }

  const quickRound = () => {
    if (curPrice == null || curPrice <= 0) return
    setPrice(String(roundTarget(curPrice, kind)))
    setError(null)
    hapticSelection()
  }

  const pickCoin = (id: string) => {
    if (id === validCoinId) return
    setCoinId(id)
    setPrice("")
    setError(null)
    hapticSelection()
  }

  const pickKind = (k: AlertKind) => {
    if (k === kind) return
    setKind(k)
    setError(null)
    hapticSelection()
  }

  /* ------------------------------ 加载骨架 ------------------------------ */

  if (loading && !snapshot) {
    return (
      <ScreenScroll refresh={refresh} refreshing={refreshing}>
        <SkPageHeader />
        <SkFormCard />
        <SkFormCard />
      </ScreenScroll>
    )
  }

  /* ------------------------------ 渲染 ------------------------------ */

  const permRow = () => {
    if (perm === "granted") {
      return (
        <Row style={{ gap: 6 }}>
          <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c("primary") }} />
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("primary"), fontSize: 10 }}>
            {t("al.notif.on")}
          </Txt>
        </Row>
      )
    }
    if (perm === "denied") {
      return (
        <Row style={{ gap: 6 }}>
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10 }}>
            {"◉ " + t("al.notif.denied")}
          </Txt>
        </Row>
      )
    }
    return <Pill onPress={requestPerm} label={t("al.notif.off")} small />
  }

  return (
    <View style={{ flex: 1, backgroundColor: c("background") }}>
      <ScreenScroll refresh={refresh} refreshing={refreshing}>
        <PageHeader
          en="PRICE ALERTS"
          title={t("page.alerts.title")}
          desc={t("page.alerts.desc")}
          actions={
            <GlyphButton
              glyph="♪"
              tone={sound ? "primary" : "muted"}
              strike={!sound}
              size={16}
              onPress={() => {
                setSound(!sound)
                hapticSelection()
              }}
              label={t("al.sound") + (sound ? " ON" : " OFF")}
            />
          }
        />

        {/* 新建预警 */}
        <Card style={{ gap: 10 }}>
          <View style={{ gap: 2 }}>
            <CardTitle>{t("al.create.title")}</CardTitle>
            <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 17 }}>
              {t("al.create.desc")}
            </Txt>
          </View>

          {/* 币种（横滑选集，仅实时源覆盖币） */}
          <View style={{ gap: 4 }}>
            <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t("al.create.coin")}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingRight: 8 }}
            >
              {(selectable.length
                ? selectable
                : coins.filter((cn) => cn.id === validCoinId)
              ).map((cn) => (
                <Pill
                  key={cn.id}
                  onPress={() => pickCoin(cn.id)}
                  label={cn.symbol.toUpperCase()}
                  active={cn.id === validCoinId}
                />
              ))}
            </ScrollView>
          </View>

          {/* 触发条件（两席分段，↑/↓ 涨跌功能色） */}
          <View style={{ gap: 4 }}>
            <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t("al.create.dir")}
            </Txt>
            <View
              style={{
                flexDirection: "row",
                borderWidth: 1,
                borderColor: c("border"),
                borderRadius: radius.md,
                padding: 3,
              }}
            >
              {(["above", "below"] as const).map((k) => {
                const on = kind === k
                const color = k === "above" ? c("up") : c("down")
                return (
                  <Pressable
                    key={k}
                    onPress={() => pickKind(k)}
                    accessibilityRole="button"
                    accessibilityLabel={t("al.create.dir") + " " + t(k === "above" ? "al.kind.above" : "al.kind.below")}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 40,
                      borderRadius: radius.sm,
                      justifyContent: "center",
                      alignItems: "center",
                      flexDirection: "row",
                      gap: 5,
                      backgroundColor: on ? c("secondary") : "transparent",
                      opacity: pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ color, fontSize: 13, fontFamily: F.mono }}>{k === "above" ? "↑" : "↓"}</Text>
                    <Text
                      style={{
                        color: on ? c("foreground") : c("muted-foreground"),
                        fontSize: 13,
                        fontFamily: on ? F.semiBold : F.regular,
                      }}
                    >
                      {t(k === "above" ? "al.kind.above" : "al.kind.below")}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>

          {/* 目标价 + 创建 */}
          <View style={{ gap: 4 }}>
            <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t("al.create.price")}
            </Txt>
            <Row style={{ gap: 8 }}>
              <TextInput
                value={price}
                onChangeText={(v) => {
                  setPrice(v)
                  setError(null)
                }}
                onSubmitEditing={submit}
                inputMode="decimal"
                placeholder={curPrice != null ? "≈ " + formatPrice(curPrice) : "USD"}
                placeholderTextColor={c("muted-foreground")}
                accessibilityLabel={t("al.create.price")}
                style={{
                  flex: 1,
                  minHeight: 44,
                  color: c("foreground"),
                  borderWidth: 1,
                  borderColor: c("input"),
                  borderRadius: radius.md,
                  paddingHorizontal: 12,
                  fontSize: 17,
                  fontFamily: F.mono,
                }}
              />
              <Pill onPress={submit} label={t("al.create.submit")} filled disabled={full} mono={false} style={{ minHeight: 44, paddingHorizontal: 16 }} />
            </Row>
          </View>

          {/* 快捷目标模板 + 整数关口（按当前方向取最近关口） */}
          {curPrice != null && curPrice > 0 ? (
            <View style={{ gap: 6 }}>
              <Row style={{ flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10 }}>
                  {t("al.quick")}
                </Txt>
                {PRESETS.map((q) => (
                  <Pill
                    key={q.label}
                    small
                    onPress={() => quick(q.mult)}
                    label={q.label}
                    tint={q.mult > 1 ? "up" : "down"}
                  />
                ))}
                <View style={{ width: 1, height: 16, backgroundColor: c("border") }} />
                <Pill small onPress={quickRound} label={t("al.preset.round")} />
              </Row>
              <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10 }}>
                {"1 " + (selectedCoin?.symbol ?? validCoinId).toUpperCase() + " = $" + formatPrice(curPrice)}
              </Txt>
            </View>
          ) : null}

          {/* 通知权限态（web 页头权限胶囊的移动端归位） */}
          {permRow()}

          {error || full ? (
            <Txt variant="caption" mono maxScale={1.2} style={{ color: c("down"), fontSize: 11 }}>
              {error ?? t("al.create.full", { n: MAX_ALERTS })}
            </Txt>
          ) : null}
        </Card>

        {/* 进行中 */}
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <CardTitle>{t("al.active.title")}</CardTitle>
            {active.length > 0 ? (
              <Row style={{ gap: 5 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c("primary") }} />
                <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 9, letterSpacing: 1.5 }}>
                  {t("al.status.monitoring")}
                </Txt>
              </Row>
            ) : null}
          </Row>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground") }}>
            {t("al.active.desc", { n: active.length })}
          </Txt>

          {active.length === 0 ? (
            <EmptyState glyph="◇" title={t("al.active.empty")} desc={t("al.active.emptyDesc")} />
          ) : (
            <View>
              {active.map((a, i) => {
                const cur = priceOf(a.coinId)
                const dist = distancePct(a, cur ?? Number.NaN)
                const live = tickers[a.coinId]
                return (
                  <View
                    key={a.id}
                    style={{
                      borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: c("border"),
                      paddingTop: i === 0 ? 2 : 10,
                      paddingBottom: 4,
                    }}
                  >
                    <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Row style={{ gap: 10, flex: 1, alignItems: "center" }}>
                        <Avatar ch={a.symbol.slice(0, 1).toUpperCase()} />
                        <View style={{ gap: 4 }}>
                          <Row style={{ gap: 6 }}>
                            <Txt variant="body" mono style={{ fontFamily: F.mono, fontSize: 14 }}>
                              {a.symbol.toUpperCase()}
                            </Txt>
                            <KindBadge kind={a.kind} />
                          </Row>
                          <Row style={{ gap: 6 }}>
                            <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11 }}>
                              {dist != null ? (dist >= 0 ? "+" : "") + dist.toFixed(2) + "%" : "—"}
                            </Txt>
                            <View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: c("muted"), overflow: "hidden" }}>
                              <View
                                style={{
                                  width: (dist != null ? closeness(dist) : 0) * 48,
                                  height: 3,
                                  borderRadius: 2,
                                  backgroundColor: c("primary"),
                                }}
                              />
                            </View>
                          </Row>
                        </View>
                      </Row>
                      <Row style={{ gap: 8, alignItems: "center" }}>
                        <View style={{ alignItems: "flex-end", gap: 4 }}>
                          <Txt variant="body" mono style={{ fontFamily: F.mono, fontSize: 14 }}>
                            {"$" + formatPrice(a.price)}
                          </Txt>
                          <Row style={{ gap: 4 }}>
                            <Txt variant="caption" mono maxScale={1.2} style={{ color: live ? c("foreground") : c("muted-foreground"), fontSize: 11 }}>
                              {cur != null ? "$" + formatPrice(cur) : "—"}
                            </Txt>
                            {live?.changePct != null ? (
                              <Txt
                                variant="caption"
                                mono
                                maxScale={1.2}
                                style={{ color: live.changePct >= 0 ? c("up") : c("down"), fontSize: 10 }}
                              >
                                {(live.changePct >= 0 ? "▲" : "▼") + Math.abs(live.changePct).toFixed(2) + "%"}
                              </Txt>
                            ) : null}
                          </Row>
                        </View>
                        <GlyphButton
                          glyph="✕"
                          tone={deleteConfirm.armed === a.id ? "down" : "muted"}
                          onPress={() => {
                            if (deleteConfirm.confirm(a.id)) remove(a.id)
                          }}
                          label={t("al.deleteSr", { symbol: a.symbol })}
                        />
                      </Row>
                    </Row>
                  </View>
                )
              })}
            </View>
          )}
        </Card>

        {/* 触发历史 */}
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <CardTitle>{t("al.history.title")}</CardTitle>
            {triggered.length > 0 ? (
              <Pressable
                onPress={() => {
                  if (clearConfirm.confirm(true)) clearTriggered()
                }}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("al.history.clear")}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, minHeight: 32, justifyContent: "center" })}
              >
                <Txt
                  variant="label"
                  mono
                  maxScale={1.2}
                  style={{ color: clearConfirm.armed ? c("down") : c("muted-foreground"), fontSize: 9, letterSpacing: 1.5 }}
                >
                  {clearConfirm.armed ? t("al.history.clearConfirm") : t("al.history.clear")}
                </Txt>
              </Pressable>
            ) : null}
          </Row>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground") }}>
            {t("al.history.desc", { n: triggered.length })}
          </Txt>

          {triggered.length === 0 ? (
            <EmptyState glyph="≡" title={t("al.history.empty")} />
          ) : (
            <View>
              {triggered.map((a, i) => {
                const flashKey = a.id + ":" + (a.triggeredAt ?? 0)
                return (
                  <FlashRow key={a.id} flash={flashKeys.has(flashKey)}>
                    <View
                      style={{
                        borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                        borderTopColor: c("border"),
                        paddingTop: i === 0 ? 2 : 10,
                        paddingBottom: 4,
                      }}
                    >
                      <Row style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                        <Row style={{ gap: 10, flex: 1, alignItems: "center" }}>
                          <Avatar ch={a.symbol.slice(0, 1).toUpperCase()} />
                          <View style={{ gap: 4 }}>
                            <Row style={{ gap: 6 }}>
                              <Txt variant="body" mono style={{ fontFamily: F.mono, fontSize: 14 }}>
                                {a.symbol.toUpperCase()}
                              </Txt>
                              <KindBadge kind={a.kind} />
                            </Row>
                            <Row style={{ gap: 6 }}>
                              <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10 }}>
                                {a.triggeredAt != null ? formatDateTime(a.triggeredAt) : "—"}
                              </Txt>
                            </Row>
                          </View>
                        </Row>
                        <Row style={{ gap: 8, alignItems: "center" }}>
                          <View style={{ alignItems: "flex-end", gap: 4 }}>
                            <Txt variant="body" mono style={{ fontFamily: F.mono, fontSize: 14 }}>
                              {"$" + formatPrice(a.price)}
                            </Txt>
                            <Txt variant="caption" mono maxScale={1.2} style={{ color: c("up"), fontSize: 11 }}>
                              {a.triggeredPrice != null ? "$" + formatPrice(a.triggeredPrice) : "—"}
                            </Txt>
                          </View>
                          <GlyphButton glyph="↺" onPress={() => rearm(a.id)} label={t("al.rearmSr", { symbol: a.symbol })} />
                          <GlyphButton
                            glyph="✕"
                            tone={deleteConfirm.armed === a.id ? "down" : "muted"}
                            onPress={() => {
                              if (deleteConfirm.confirm(a.id)) remove(a.id)
                            }}
                            label={t("al.deleteSr", { symbol: a.symbol })}
                          />
                        </Row>
                      </Row>
                    </View>
                  </FlashRow>
                )
              })}
            </View>
          )}
        </Card>

        <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10, textAlign: "center", lineHeight: 15, paddingHorizontal: 8 }}>
          {"◆ " + t("al.note")}
        </Txt>
      </ScreenScroll>

      {/* 页内 toast（web ToastHost 的页面作用域对应物；点击可关） */}
      {toast ? (
        <ToastBanner title={toast.title} desc={toast.desc} top={insets.top + 70} onDismiss={() => setToast(null)} />
      ) : null}
    </View>
  )
}

/* ------------------------------ 局部小件 ------------------------------ */

/** 新转入历史的行闪现涂层：涨色 0.16 透明度 1.5s 渐隐（web flash-up 对应物） */
function FlashRow({ flash, children }: { flash: boolean; children: ReactNode }) {
  const { c } = useAppTheme()
  const v = useRef(new Animated.Value(flash ? 1 : 0)).current
  useEffect(() => {
    if (!flash) return
    v.setValue(1)
    Animated.timing(v, { toValue: 0, duration: 1500, useNativeDriver: true }).start()
  }, [flash, v])
  return (
    <View>
      {children}
      {flash ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: -4,
            right: -4,
            bottom: 0,
            borderRadius: radius.sm,
            backgroundColor: c("up"),
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }),
          }}
        />
      ) : null}
    </View>
  )
}

/** 顶部 toast 横幅：淡入停留，web pushToast 的页内反馈对应物 */
function ToastBanner({ title, desc, top, onDismiss }: { title: string; desc: string; top: number; onDismiss: () => void }) {
  const { c } = useAppTheme()
  const v = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 180, useNativeDriver: true }).start()
  }, [v])
  return (
    <View style={{ position: "absolute", top, left: 12, right: 12 }} pointerEvents="box-none">
      <Animated.View style={{ opacity: v }}>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel={title}
          style={({ pressed }) => ({
            backgroundColor: c("card"),
            borderWidth: 1,
            borderColor: c("border"),
            borderRadius: radius.lg,
            padding: 12,
            gap: 3,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Txt variant="caption" mono maxScale={1.3} style={{ fontFamily: F.mono, fontSize: 12 }}>
            {title}
          </Txt>
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11 }}>
            {desc}
          </Txt>
        </Pressable>
      </Animated.View>
    </View>
  )
}
