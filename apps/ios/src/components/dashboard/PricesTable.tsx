import { memo, useMemo, useState } from "react"
import { Pressable, Text, View, useWindowDimensions } from "react-native"
import { Link } from "expo-router"
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { STABLECOIN_IDS, type Coin } from "@repo/data/api"
import type { LiveTicker } from "@repo/data/realtime-source"
import { TRADE_SYMBOLS } from "@repo/data/realtime-source"
import { formatPct, formatPrice, formatUsdCompact } from "@repo/core/format"
import { useFavorites } from "@repo/react/useFavorites"
import { useLive } from "@repo/react/MarketData"

import { useAppTheme } from "../../lib/theme"
import { hapticImpact, hapticSelection } from "../../lib/haptics"
import { Card } from "../ui"
import { alpha } from "./color"
import { FONT } from "./util"

type Scope = "all" | "tradeable" | "favorites"

/** 分段控件（web Segmented 的 RN 版）：切换带 selection 触感 */
function ScopeSegmented({
  value,
  onChange,
  items,
}: {
  value: Scope
  onChange: (v: Scope) => void
  items: { value: Scope; label: string }[]
}) {
  const { c } = useAppTheme()
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        borderWidth: 1,
        borderColor: c("border"),
        borderRadius: 6,
        padding: 2,
        gap: 2,
      }}
    >
      {items.map((it) => {
        const on = it.value === value
        return (
          <Pressable
            key={it.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              if (it.value !== value) {
                hapticSelection()
                onChange(it.value)
              }
            }}
            style={{
              flex: 1,
              minHeight: 36,
              borderRadius: 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: on ? c("secondary") : "transparent",
              opacity: on ? 1 : 0.75,
            }}
          >
            {({ pressed }) => (
              <Text
                maxFontSizeMultiplier={1.2}
                numberOfLines={1}
                style={{
                  color: on ? c("foreground") : c("muted-foreground"),
                  fontSize: 12,
                  fontFamily: on ? FONT.semi : FONT.regular,
                  opacity: pressed ? 0.6 : 1,
                }}
              >
                {it.label}
              </Text>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

/** 自选星标（字形 hitSlop 8；切换 light 触感） */
function WatchStar({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const { c } = useAppTheme()
  return (
    <Pressable
      accessibilityLabel={active ? t("markets.removeFav") : t("markets.addFav")}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        hapticImpact("light")
        onToggle()
      }}
      style={{ width: 22, alignItems: "center" }}
    >
      <Text style={{ color: active ? c("foreground") : alpha(c("muted-foreground"), 0.3), fontSize: 14 }}>
        {active ? "★" : "☆"}
      </Text>
    </Pressable>
  )
}

/** 单色火花线（react-native-svg + 涨跌功能色；web Sparkline 的 RN 版） */
function Sparkline({
  data,
  width = 108,
  height = 30,
  color,
}: {
  data: number[]
  width?: number
  height?: number
  color: string
}) {
  const gid = useMemo(() => `sg-${Math.random().toString(36).slice(2, 8)}`, [])
  const { line, area } = useMemo(() => {
    if (data.length < 2) return { line: "", area: "" }
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const pad = 1.5
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = pad + (1 - (v - min) / span) * (height - pad * 2)
      return [x, y] as const
    })
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
    return { line: d, area: `${d} L${width},${height} L0,${height} Z` }
  }, [data, width, height])

  if (!line) return <View style={{ width, height, borderRadius: 4, backgroundColor: "transparent" }} />
  return (
    <Svg width={width} height={height} accessibilityElementsHidden>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={area} fill={`url(#${gid})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  )
}

/** 涨跌幅读数：null →「—」muted；涨跌只染数字（功能色全主题共享） */
function Pct({ v, digits = 2 }: { v: number | null | undefined; digits?: number }) {
  const { c } = useAppTheme()
  if (v == null || Number.isNaN(v)) {
    return (
      <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono }}>—</Text>
    )
  }
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit
      style={{ color: v >= 0 ? c("up") : c("down"), fontSize: 11, fontFamily: FONT.mono }}
    >
      {formatPct(v, digits)}
    </Text>
  )
}

/** 实时价格表：范围分段（全部/剔除稳定币/自选）+ 星标 + 多周期涨跌 + 7 日火花线。
 *  live ticker 由本组件自订（useLive 高频通道）——路由层不订，避免整页每秒重渲染。 */
export const PricesTable = memo(function PricesTable({
  coins,
}: {
  coins: Coin[]
  onSelect?: (coin: Coin) => void
}) {
  useT()
  const live = useLive()
  const { c } = useAppTheme()
  const { width: winW } = useWindowDimensions()
  const [scope, setScope] = useState<Scope>("all")
  const { has, toggle } = useFavorites()

  const show30d = winW >= 640 // web sm:
  const showSpark = winW >= 768 // web md:
  const showMcap = winW >= 1024 // web lg:
  const showAth = winW >= 1280 // web xl:

  const list = useMemo(() => {
    if (scope === "tradeable") return coins.filter((coin) => !STABLECOIN_IDS.has(coin.id))
    if (scope === "favorites") return coins.filter((coin) => has(coin.id))
    return coins
  }, [coins, scope, has])

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ gap: 6 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 14, fontFamily: FONT.semi }}>
          {t("pt.title")}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}>
          {t("pt.desc")}
        </Text>
        <ScopeSegmented
          value={scope}
          onChange={setScope}
          items={[
            { value: "all", label: t("common.scope.all") },
            { value: "tradeable", label: t("common.scope.tradeable") },
            { value: "favorites", label: t("common.scope.favorites") },
          ]}
        />
      </View>

      {scope === "favorites" && list.length === 0 ? (
        <View style={{ paddingVertical: 36, alignItems: "center", gap: 6 }}>
          <Text style={{ color: alpha(c("muted-foreground"), 0.5), fontSize: 18 }}>★</Text>
          <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.semi }}>
            {t("markets.empty.fav")}
          </Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ color: c("muted-foreground"), fontSize: 11, textAlign: "center", lineHeight: 16 }}
          >
            {t("markets.empty.favDesc")}
          </Text>
        </View>
      ) : (
        <View>
          {list.map((coin, idx) => {
            const tk = live[coin.id]
            const price = tk?.price ?? coin.current_price
            const chg24 = tk?.changePct ?? coin.price_change_percentage_24h_in_currency
            const hasDetail = !!TRADE_SYMBOLS[coin.id]
            const spark = coin.sparkline_in_7d?.price ?? []
            const chg7 = coin.price_change_percentage_7d_in_currency ?? 0
            const body = (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                  paddingVertical: 10,
                  borderTopWidth: idx > 0 ? 1 : 0,
                  borderTopColor: alpha(c("border"), 0.5),
                  opacity: hasDetail ? 1 : 0.8,
                }}
              >
                <WatchStar active={has(coin.id)} onToggle={() => toggle(coin.id)} />
                <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono, width: 16, textAlign: "center" }}>
                  {coin.market_cap_rank}
                </Text>
                <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.semi, textTransform: "uppercase" }}
                  >
                    {coin.symbol}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c("muted-foreground"), fontSize: 10 }}>
                    {coin.name}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.monoMed, textAlign: "right" }}
                >
                  ${formatPrice(price)}
                </Text>
                <View style={{ width: 40, alignItems: "flex-end" }}>
                  <Pct v={coin.price_change_percentage_1h_in_currency} />
                </View>
                <View style={{ width: 48, alignItems: "flex-end" }}>
                  <Pct v={chg24} />
                </View>
                <View style={{ width: 44, alignItems: "flex-end" }}>
                  <Pct v={coin.price_change_percentage_7d_in_currency} />
                </View>
                {show30d && (
                  <View style={{ width: 48, alignItems: "flex-end" }}>
                    <Pct v={coin.price_change_percentage_30d_in_currency} />
                  </View>
                )}
                {showMcap && (
                  <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono, width: 56, textAlign: "right" }}>
                    {formatUsdCompact(coin.market_cap)}
                  </Text>
                )}
                {showAth && (
                  <Text
                    style={{
                      color:
                        coin.ath_change_percentage != null && coin.ath_change_percentage >= -20
                          ? c("up")
                          : c("muted-foreground"),
                      fontSize: 11,
                      fontFamily: FONT.mono,
                      width: 52,
                      textAlign: "right",
                    }}
                  >
                    {formatPct(coin.ath_change_percentage, 1)}
                  </Text>
                )}
                {showSpark && (
                  <View style={{ width: 108, alignItems: "flex-end" }}>
                    <Sparkline data={spark} color={chg7 >= 0 ? c("up") : c("down")} />
                  </View>
                )}
                {hasDetail ? (
                  <Text style={{ color: alpha(c("muted-foreground"), 0.7), fontSize: 14 }}>›</Text>
                ) : (
                  <Text style={{ color: c("muted-foreground"), fontSize: 9, fontFamily: FONT.mono, width: 28, textAlign: "center" }}>
                    {t("common.stablecoin")}
                  </Text>
                )}
              </View>
            )
            return hasDetail ? (
              <Link key={coin.id} href={`/coin/${coin.id}`} asChild>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={coin.name}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  {body}
                </Pressable>
              </Link>
            ) : (
              <View key={coin.id}>{body}</View>
            )
          })}
        </View>
      )}
    </Card>
  )
})
