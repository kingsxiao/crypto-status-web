/**
 * 币种详情 — web CoinDetail.tsx 的 RN 移植（业务逻辑逐段对齐）：
 *  - 图表偏好（周期/根数/叠加/副图/渲染模式）storageBus chartPrefs 持久化，
 *    与 web 端同一 JSON 结构，跨端可互读
 *  - K 线四级容错链取数 + 请求代际（切周期/切币旧响应作废）+ 静默轮询
 *    （pollIntervalMs 按周期收紧；失败保留旧图）
 *  - 独立日线序列：多空观点固定基于日线（图表即 1d 时零额外请求）
 *  - 实时价 5s 采样合并末根K线；头部价格秒级刷新 + 涨跌色一闪（900ms）
 *  - 24H 高低区间位置条（SVG 渐变 down→up，与 web 同语义）
 *  - 复制链接 → 系统分享面板（native 适配：Share + scheme 深链）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import * as Linking from "expo-linking"
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import type { Coin } from "@repo/data/api"
import { analyzeCoin } from "@repo/core/coinAnalysis"
import { formatPrice, formatUsdCompact } from "@repo/core/format"
import { fetchCandles, mergeLiveTick, pollIntervalMs, type Candle } from "@repo/data/kline"
import { TRADE_SYMBOLS, type LiveTicker } from "@repo/data/realtime-source"
import { STORAGE_KEYS, storageGet, storageSet } from "@repo/core/storageBus"
import { useFavorites } from "@repo/react/useFavorites"

import { useAppTheme } from "../lib/theme"
import { hapticImpact, hapticSelection } from "../lib/haptics"
import { CandleChart } from "./CandleChart"
import { ChartSkeleton, SkBar } from "./skeletons"
import { Chip, GroupLabel, MonoSegmentLabel, VSeparator } from "./Segmented"
import { OpinionBoard } from "./OpinionBoard"
import { Card, Row, Tap, Txt } from "./ui"

/* ------------------------------ 图表偏好（storageBus 持久化） ------------------------------ */

interface ChartPrefs {
  intervalKey: string
  range: 100 | 250 | 500
  overlays: { ma: boolean; boll: boolean; fib: boolean }
  panes: { rsi: boolean; macd: boolean; kdj: boolean }
  /** null = 跟随数据源默认；用户手动选过蜡烛/折线后记住 */
  renderPref: "candles" | "line" | null
}

const PREFS_KEY = STORAGE_KEYS.chartPrefs
const INTERVAL_KEYS = ["1s", "1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w"] as const
const RANGES = [100, 250, 500] as const

function loadPrefs(): ChartPrefs {
  const fallback: ChartPrefs = {
    intervalKey: "1d",
    range: 250,
    overlays: { ma: true, boll: false, fib: false },
    panes: { rsi: true, macd: false, kdj: false },
    renderPref: null,
  }
  const raw = storageGet(PREFS_KEY)
  try {
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<ChartPrefs>
    return {
      intervalKey: (INTERVAL_KEYS as readonly string[]).includes(p.intervalKey ?? "")
        ? (p.intervalKey as string)
        : "1d",
      range: RANGES.includes((p.range ?? 250) as 100 | 250 | 500) ? (p.range as 100 | 250 | 500) : 250,
      overlays: { ...fallback.overlays, ...p.overlays },
      panes: { ...fallback.panes, ...p.panes },
      renderPref: p.renderPref === "candles" || p.renderPref === "line" ? p.renderPref : null,
    }
  } catch {
    return fallback
  }
}

const intervalLabel = (key: string): string =>
  (INTERVAL_KEYS as readonly string[]).includes(key)
    ? t(`coin.interval.${key as (typeof INTERVAL_KEYS)[number]}`)
    : key

/* ------------------------------ 主组件 ------------------------------ */

interface Props {
  coin: Coin
  live?: LiveTicker
  onBack: () => void
}

export function CoinDetail({ coin, live, onBack }: Props) {
  useT()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [prefs] = useState(loadPrefs)
  const [intervalKey, setIntervalKey] = useState(prefs.intervalKey)
  const [range, setRange] = useState<100 | 250 | 500>(prefs.range)
  const [overlays, setOverlays] = useState(prefs.overlays)
  const [panes, setPanes] = useState(prefs.panes)
  const [renderPref, setRenderPref] = useState(prefs.renderPref)

  useEffect(() => {
    storageSet(PREFS_KEY, JSON.stringify({ intervalKey, range, overlays, panes, renderPref }))
  }, [intervalKey, range, overlays, panes, renderPref])

  const [candles, setCandles] = useState<Candle[] | null>(null)
  const [sourceMode, setSourceMode] = useState<"candles" | "line">("candles")
  const [source, setSource] = useState<string>("")
  const [error, setError] = useState<string | null>(null)
  /** 切周期：保留旧图加遮罩而非闪整块骨架屏 */
  const [reloading, setReloading] = useState(false)
  /** 当前 candles 实际对应的周期（观点区日线跟随判定依据，防过渡窗口串周期） */
  const [candlesItv, setCandlesItv] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  /* 独立日线序列：观点分析固定日线，图表非 1d 时才按需独立拉取并缓存 */
  const [dailyCandles, setDailyCandles] = useState<Candle[] | null>(null)
  const [dailyLoading, setDailyLoading] = useState(true)

  const symbols = TRADE_SYMBOLS[coin.id]

  /* 请求代际 + 旧图保留判定 refs（与 web 同一套机制） */
  const genRef = useRef(0)
  const hasDataRef = useRef(false)
  const coinKeyRef = useRef("")

  const load = useCallback(
    async (silent = false) => {
      if (!symbols) {
        // 无交易对（直链进入稳定币等）：明确提示而非永久骨架屏
        coinKeyRef.current = ""
        hasDataRef.current = false
        setCandles(null)
        setCandlesItv(null)
        setReloading(false)
        setError(t("coin.noChart"))
        return
      }
      const gen = ++genRef.current
      const coinChanged = coinKeyRef.current !== coin.id
      coinKeyRef.current = coin.id
      if (!silent) {
        if (coinChanged || !hasDataRef.current) {
          hasDataRef.current = false
          setCandles(null)
          setCandlesItv(null)
          setReloading(false)
        } else {
          setReloading(true)
        }
      }
      try {
        const res = await fetchCandles(coin.id, symbols, intervalKey)
        if (gen !== genRef.current) return
        setCandles(res.candles)
        hasDataRef.current = true
        setCandlesItv(intervalKey)
        setSourceMode(res.renderMode)
        setSource(res.source === "coingecko-line" ? t("coin.source.snapshot") : t("coin.source.live"))
        setError(null)
        setReloading(false)
      } catch (e) {
        if (gen !== genRef.current) return
        setReloading(false)
        // 静默轮询失败且已有数据：保留图表等下一轮；手动切换失败同样保留旧图
        if (!silent || !hasDataRef.current) {
          setError(e instanceof Error ? e.message : t("coin.loadFailFallback"))
        }
      }
    },
    [coin.id, symbols, intervalKey],
  )

  useEffect(() => {
    void load()
  }, [load])

  /* 静默轮询：秒/分钟级周期收紧节奏；失败不清空已有图表 */
  useEffect(() => {
    const timer = setInterval(() => void load(true), pollIntervalMs(intervalKey))
    return () => clearInterval(timer)
  }, [load, intervalKey])

  const dailyGenRef = useRef(0)
  const loadDaily = useCallback(async () => {
    if (!symbols) {
      setDailyLoading(false)
      return
    }
    const gen = ++dailyGenRef.current
    setDailyLoading(true)
    try {
      const res = await fetchCandles(coin.id, symbols, "1d")
      if (gen !== dailyGenRef.current) return
      setDailyCandles(res.candles)
    } catch {
      /* 观点区显示数据不足提示 */
    } finally {
      if (gen === dailyGenRef.current) setDailyLoading(false)
    }
  }, [coin.id, symbols])

  /* 币种切换：丢弃旧币日线缓存 */
  useEffect(() => {
    setDailyCandles(null)
    setDailyLoading(true)
  }, [coin.id, symbols])

  /* 日线拉取时机：图表非 1d 且无缓存时独立拉一次；图表 1d 失败时兜底保观点区 */
  useEffect(() => {
    if (!symbols) {
      setDailyLoading(false)
      return
    }
    if (dailyCandles) return
    if (intervalKey === "1d" && !error) return
    void loadDaily()
  }, [symbols, dailyCandles, intervalKey, error, loadDaily])

  const livePrice = live?.price ?? coin.current_price
  const liveChange = live?.changePct ?? coin.price_change_percentage_24h_in_currency ?? 0

  /* 实时价跳动闪烁：方向色一闪即焚（900ms，与 web flash 关键帧同拍） */
  const prevPriceRef = useRef(livePrice)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  useEffect(() => {
    const prev = prevPriceRef.current
    if (livePrice === prev) return
    prevPriceRef.current = livePrice
    setFlash(livePrice > prev ? "up" : "down")
    const timer = setTimeout(() => setFlash(null), 900)
    return () => clearTimeout(timer)
  }, [livePrice])

  /* 24H 高低区间位置（0~1） */
  const high24 = live?.high ?? coin.high_24h
  const low24 = live?.low ?? coin.low_24h
  const pos24 =
    high24 && low24 && high24 > low24 ? Math.max(0, Math.min(1, (livePrice - low24) / (high24 - low24))) : null

  /* 自选 + 分享（native：Share 面板替代 clipboard 复制） */
  const { has, toggle } = useFavorites()
  const fav = has(coin.id)
  const shareLink = useCallback(async () => {
    try {
      const url = Linking.createURL(`coin/${coin.id}`)
      await Share.share({ message: url })
    } catch {
      /* 分享面板取消/不可用：静默 */
    }
  }, [coin.id])

  /* 实时价每秒推送，K线合并与指标重算按 5s 采样（与 web 同口径） */
  const liveRef = useRef<LiveTicker | undefined>(undefined)
  useEffect(() => {
    liveRef.current = live
  }, [live])
  const [liveSampled, setLiveSampled] = useState<LiveTicker | undefined>(undefined)
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveSampled((prev) => (liveRef.current === prev ? prev : liveRef.current))
    }, 5_000)
    return () => clearInterval(timer)
  }, [])

  const merged = useMemo(
    () => (candles ? mergeLiveTick(candles, liveSampled ? { price: liveSampled.price } : undefined) : null),
    [candles, liveSampled],
  )
  const visible = useMemo(
    () => (merged ? (range >= merged.length ? merged : merged.slice(-range)) : null),
    [merged, range],
  )

  /* 多空观点：日线 + 实时价末位合并 → 八指标加权合成 */
  const dailySource = candlesItv === "1d" ? candles : dailyCandles
  const opinion = useMemo(() => {
    if (!dailySource?.length) return null
    const mergedDaily = mergeLiveTick(dailySource, liveSampled ? { price: liveSampled.price } : undefined)
    return analyzeCoin(
      mergedDaily.map((k) => k.close),
      mergedDaily.map((k) => k.volume),
    )
  }, [dailySource, liveSampled])

  /* 渲染模式：兜底折线源强制折线；蜡烛源下用户手动选择优先 */
  const renderMode = sourceMode === "line" ? "line" : (renderPref ?? "candles")

  return (
    <View style={{ flex: 1, backgroundColor: c("background") }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 12, gap: 10, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={c("muted-foreground")}
            onRefresh={() => {
              setRefreshing(true)
              void load(false).finally(() => setRefreshing(false))
            }}
          />
        }
      >
        {/* 返回行 + 数据源徽标 */}
        <Row style={{ justifyContent: "space-between" }}>
          <Tap onPress={onBack} style={{ alignSelf: "flex-start" }}>
            <Row style={{ gap: 4 }}>
              <Text style={{ color: c("primary"), fontSize: 18, lineHeight: 22 }}>‹</Text>
              <Txt variant="body" maxScale={1.3}>{t("coin.back")}</Txt>
            </Row>
          </Tap>
          {source ? (
            <Row style={{ gap: 6 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c("primary") }} />
              <Txt mono maxScale={1.3} style={{ fontSize: 10, color: c("muted-foreground") }}>
                {t("coin.badge", { source })}
              </Txt>
            </Row>
          ) : null}
        </Row>

        {/* 币种头部 */}
        <Card>
          <Row style={{ gap: 12 }}>
            <CoinIcon coin={coin} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <Row style={{ gap: 8 }}>
                <Txt variant="title" maxScale={1.3} style={{ fontWeight: "700" }}>{coin.name}</Txt>
                <View style={{ backgroundColor: c("secondary"), borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Txt mono maxScale={1.3} style={{ fontSize: 10, textTransform: "uppercase" }}>{coin.symbol}</Txt>
                </View>
                <Txt mono maxScale={1.3} style={{ fontSize: 10, color: c("muted-foreground") }}>#{coin.market_cap_rank}</Txt>
              </Row>
              <Row style={{ gap: 4 }}>
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={fav ? t("coin.favRemove") : t("coin.favAdd")}
                  onPress={() => {
                    hapticImpact("light")
                    toggle(coin.id)
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: fav ? c("primary") : c("muted-foreground"), fontSize: 16 }}>
                    {fav ? "★" : "☆"}
                  </Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t("coin.copyLink")}
                  onPress={shareLink}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ color: c("muted-foreground"), fontSize: 13 }}>⇗</Text>
                </Pressable>
              </Row>
            </View>
          </Row>

          <Row style={{ alignItems: "baseline", gap: 10, marginTop: 2 }}>
            <Txt
              mono
              maxScale={1.3}
              style={{
                fontSize: 28,
                lineHeight: 32,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
                color: flash === "up" ? c("up") : flash === "down" ? c("down") : c("foreground"),
              }}
            >
              ${formatPrice(livePrice)}
            </Txt>
            <Txt mono maxScale={1.3} style={{ fontSize: 14, color: liveChange >= 0 ? c("up") : c("down") }}>
              {liveChange >= 0 ? "▲" : "▼"} {Math.abs(liveChange).toFixed(2)}%
            </Txt>
          </Row>

          {/* 24H 高低区间位置条（SVG 渐变 down→up） */}
          {pos24 != null && (
            <RangeBar
              low={low24!}
              high={high24!}
              pos={pos24}
              up={liveChange >= 0}
              accessibleLabel={`${t("coin.range24Label")} ${(pos24 * 100).toFixed(0)}%`}
            />
          )}

          {/* 四项统计（hairline 分隔四分格） */}
          <View style={{ flexDirection: "row", marginTop: 4 }}>
            {[
              { label: t("coin.stat.high24"), value: high24 ? `$${formatPrice(high24)}` : "—" },
              { label: t("coin.stat.low24"), value: low24 ? `$${formatPrice(low24)}` : "—" },
              { label: t("coin.stat.vol24"), value: formatUsdCompact(live?.quoteVolume ?? coin.total_volume) },
              { label: t("coin.stat.mcap"), value: formatUsdCompact(coin.market_cap) },
            ].map((st, i) => (
              <View key={st.label} style={{ flex: 1, gap: 3, borderLeftWidth: i ? StyleSheet.hairlineWidth : 0, borderColor: c("border"), paddingLeft: i ? 10 : 0 }}>
                <Txt maxScale={1.3} style={{ fontSize: 10, color: c("muted-foreground"), letterSpacing: 0.5 }}>{st.label}</Txt>
                <Txt mono maxScale={1.3} style={{ fontSize: 13, fontWeight: "600", fontVariant: ["tabular-nums"] }}>{st.value}</Txt>
              </View>
            ))}
          </View>
        </Card>

        {/* 工具栏：周期九档（横滚）/ 根数 / 叠加 / 副图 / 图表类型 */}
        <Card>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
            {INTERVAL_KEYS.map((k) => (
              <Pressable
                key={k}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={intervalLabel(k)}
                accessibilityState={{ selected: intervalKey === k }}
                onPress={() => {
                  if (intervalKey !== k) hapticSelection()
                  setIntervalKey(k)
                }}
                style={({ pressed }) => [
                  s.itvChip,
                  intervalKey === k ? { backgroundColor: c("primary"), borderColor: c("primary") } : { borderColor: c("border") },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <MonoSegmentLabel text={intervalLabel(k)} active={intervalKey === k} invert={intervalKey === k} />
              </Pressable>
            ))}
          </ScrollView>

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c("border") }} />

          <Row style={{ flexWrap: "wrap", gap: 10 }}>
            <Row style={{ gap: 6 }}>
              <GroupLabel>{t("coin.rangeLabel")}</GroupLabel>
              {RANGES.map((r) => (
                <Chip key={r} active={range === r} onPress={() => setRange(r)} accessibilityLabel={t("coin.rangeHint", { n: r })}>
                  {String(r)}
                </Chip>
              ))}
            </Row>
            <VSeparator />
            <Row style={{ gap: 6 }}>
              <GroupLabel>{t("coin.overlayLabel")}</GroupLabel>
              <Chip active={overlays.ma} onPress={() => setOverlays((o) => ({ ...o, ma: !o.ma }))} accessibilityLabel={t("coin.overlay.maHint")}>MA</Chip>
              <Chip active={overlays.boll} onPress={() => setOverlays((o) => ({ ...o, boll: !o.boll }))} accessibilityLabel={t("coin.overlay.bollHint")}>BOLL</Chip>
              <Chip active={overlays.fib} onPress={() => setOverlays((o) => ({ ...o, fib: !o.fib }))} accessibilityLabel={t("coin.overlay.fibHint")}>FIB</Chip>
            </Row>
          </Row>

          <Row style={{ flexWrap: "wrap", gap: 10 }}>
            <Row style={{ gap: 6 }}>
              <GroupLabel>{t("coin.paneLabel")}</GroupLabel>
              <Chip active={panes.rsi} onPress={() => setPanes((p) => ({ ...p, rsi: !p.rsi }))} accessibilityLabel={t("coin.pane.rsiHint")}>RSI</Chip>
              <Chip active={panes.macd} onPress={() => setPanes((p) => ({ ...p, macd: !p.macd }))} accessibilityLabel={t("coin.pane.macdHint")}>MACD</Chip>
              <Chip active={panes.kdj} onPress={() => setPanes((p) => ({ ...p, kdj: !p.kdj }))} accessibilityLabel={t("coin.pane.kdjHint")}>KDJ</Chip>
            </Row>
            <VSeparator />
            <Row style={{ gap: 6 }}>
              <GroupLabel>{t("coin.renderLabel")}</GroupLabel>
              <Chip
                active={renderMode === "candles"}
                disabled={sourceMode === "line"}
                onPress={() => setRenderPref("candles")}
                accessibilityLabel={t("coin.render.candle")}
              >
                ▮▮
              </Chip>
              <Chip active={renderMode === "line"} onPress={() => setRenderPref("line")} accessibilityLabel={t("coin.render.line")}>
                ∿
              </Chip>
            </Row>
          </Row>
        </Card>

        {/* 图表 */}
        <Card>
          {error && !visible ? (
            <View style={{ height: 280, justifyContent: "center", alignItems: "center", gap: 10 }}>
              <Txt maxScale={1.3} style={{ fontWeight: "600" }}>{t("coin.loadFail")}</Txt>
              <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground"), textAlign: "center" }}>{error}</Txt>
              <Tap onPress={() => void load()}>{t("common.retry")}</Tap>
            </View>
          ) : !visible ? (
            <ChartSkeleton bars={40} height={260} />
          ) : (
            <View>
              <CandleChart
                candles={visible}
                renderMode={renderMode}
                overlays={overlays}
                panes={panes}
                intervalKey={intervalKey}
              />
              {/* 切周期加载 / 加载失败：旧图保留 + 遮罩提示 */}
              {(reloading || error) && (
                <View
                  style={[
                    StyleSheet.absoluteFill,
                    { borderRadius: 10, backgroundColor: c("background"), opacity: 0.88, justifyContent: "center", alignItems: "center", gap: 10 },
                  ]}
                >
                  {reloading ? (
                    <>
                      <ActivityIndicator color={c("muted-foreground")} />
                      <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>
                        {t("coin.chartLoading", { interval: intervalLabel(intervalKey) })}
                      </Txt>
                    </>
                  ) : (
                    <>
                      <Txt maxScale={1.3} style={{ fontWeight: "600" }}>{t("coin.loadFail")}</Txt>
                      <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground"), maxWidth: "80%" }}>{error}</Txt>
                      <Tap onPress={() => void load()}>{t("common.retry")}</Tap>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </Card>

        {/* 多空观点：八指标综合判断，逐项列出 */}
        {opinion ? (
          <OpinionBoard
            analysis={opinion}
            title={t("coin.opinionTitle", { name: coin.name })}
            badge={t("coin.opinionBadge", { n: opinion.indicators.length })}
          />
        ) : dailyLoading ? (
          <Card>
            <SkBar w={160} h={12} />
            <SkBar w="60%" h={34} />
            <SkBar w="100%" h={8} tone="muted" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Row key={i} style={{ justifyContent: "space-between" }}>
                <SkBar w={140} h={10} />
                <SkBar w={56} />
              </Row>
            ))}
          </Card>
        ) : (
          <Card>
            <View style={{ height: 96, justifyContent: "center", alignItems: "center", gap: 6 }}>
              <Txt maxScale={1.3} style={{ fontWeight: "600" }}>{t("coin.opinionInsufficient")}</Txt>
              <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground"), textAlign: "center" }}>
                {t("coin.opinionInsufficientDesc")}
              </Txt>
            </View>
          </Card>
        )}
      </ScrollView>
    </View>
  )
}

/* ------------------------------ 子组件 ------------------------------ */

/** 币种头像（hairline 描边；加载失败显示代码占位） */
function CoinIcon({ coin, size }: { coin: Coin; size: number }) {
  const { c } = useAppTheme()
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: c("border"),
          backgroundColor: c("secondary"),
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: c("muted-foreground"), fontSize: size / 3, fontFamily: "JetBrainsMono_500Medium" }}>
          {coin.symbol.slice(0, 3).toUpperCase()}
        </Text>
      </View>
    )
  return (
    <Image
      source={{ uri: coin.image }}
      style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: c("border") }}
      onError={() => setFailed(true)}
      accessibilityLabel={coin.name}
    />
  )
}

/** 24H 区间位置条：低/高标 + down→up 渐变填充 + 当前价游标（react-native-svg） */
function RangeBar({
  low,
  high,
  pos,
  up,
  accessibleLabel,
}: {
  low: number
  high: number
  pos: number
  up: boolean
  accessibleLabel: string
}) {
  const { c } = useAppTheme()
  const W = 300
  const H = 18
  const fillW = Math.max(0, Math.min(1, pos)) * W
  return (
    <View style={{ gap: 4 }} accessibilityLabel={accessibleLabel}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="range24" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={c("down")} />
            <Stop offset="1" stopColor={c("up")} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={6} width={W} height={6} rx={3} fill={c("secondary")} />
        <Rect x={0} y={6} width={fillW} height={6} rx={3} fill="url(#range24)" />
        <Circle cx={fillW} cy={9} r={5} fill={up ? c("up") : c("down")} stroke={c("background")} strokeWidth={2} />
      </Svg>
      <Row style={{ justifyContent: "space-between" }}>
        <Txt mono maxScale={1.3} style={{ fontSize: 11, color: c("down"), opacity: 0.9 }}>{formatPrice(low)}</Txt>
        <Txt mono maxScale={1.3} style={{ fontSize: 11, color: c("up"), opacity: 0.9 }}>{formatPrice(high)}</Txt>
      </Row>
    </View>
  )
}

const s = StyleSheet.create({
  itvChip: {
    minHeight: 36,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
})
