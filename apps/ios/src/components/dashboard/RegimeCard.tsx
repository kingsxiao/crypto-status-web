import { memo, useEffect, useState } from "react"
import { Text, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { REGIME_KEY, type Analysis } from "@repo/core/indicators"
import { formatPrice } from "@repo/core/format"

import { useAppTheme } from "../../lib/theme"
import { Card } from "../ui"
import { CardKicker, EASE_STATE, FONT } from "./util"

/** 进度条：挂载从中性位（50%）推进到目标（reanimated 450ms，与 web Progress 同款时序） */
function GrowBar({ value, color }: { value: number; color: string }) {
  const { c } = useAppTheme()
  const p = useSharedValue(0.5)
  const [w, setW] = useState(0)
  useEffect(() => {
    p.value = withTiming(Math.min(100, Math.max(0, value)) / 100, { duration: 450, easing: EASE_STATE })
  }, [value, p])
  const fill = useAnimatedStyle(() => ({ width: w * p.value }))
  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ height: 4, borderRadius: 2, backgroundColor: c("secondary"), overflow: "hidden" }}
    >
      <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: color }, fill]} />
    </View>
  )
}

/** 牛熊周期卡：200 日均线体系的趋势结构判定 + 双进度 + 均线读数 */
export const RegimeCard = memo(function RegimeCard({ analysis }: { analysis: Analysis }) {
  useT()
  const { c } = useAppTheme()
  const { regime, btc } = analysis

  const isBull = regime.state === "bull" || regime.state === "recovering"
  const regimeMeta = REGIME_KEY[regime.state]

  const priceVal = Math.min(100, Math.max(0, 50 + regime.priceVsMa200))
  const maVal = Math.min(100, Math.max(0, 50 + regime.ma50VsMa200 * 2.5))

  return (
    <Card style={{ gap: 12 }}>
      <CardKicker glyph="↗" title={t("rg.title")} en="MARKET REGIME" desc={t("rg.desc")} />

      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View
              style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: isBull ? c("up") : c("down") }}
            />
            <Text
              maxFontSizeMultiplier={1.3}
              style={{ color: c("foreground"), fontSize: 28, lineHeight: 34, fontFamily: FONT.bold, letterSpacing: 1 }}
            >
              {t(regimeMeta.label)}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 11 }}>
            {t("rg.daysPre")}{" "}
            <Text style={{ color: c("foreground"), fontFamily: FONT.monoMed }}>{regime.days}</Text> {t("rg.daysPost")}
          </Text>
        </View>

        {/* 牛熊示意图：右半绿（牛）左半红（熊）；纯装饰 */}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4, height: 62 }} accessibilityElementsHidden>
          {Array.from({ length: 9 }).map((_, i) => {
            const bullSide = i >= 4
            const h = 14 + Math.abs(i - 4) * 11
            return (
              <View
                key={i}
                style={{
                  width: 8,
                  borderRadius: 2,
                  height: isBull ? h : 62 - h + 14,
                  opacity: isBull === bullSide ? 1 : 0.35,
                  backgroundColor: bullSide ? c("up") : c("down"),
                }}
              />
            )
          })}
        </View>
      </View>

      <Text
        maxFontSizeMultiplier={1.3}
        style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 16 }}
      >
        {t(regimeMeta.desc)}
      </Text>

      <View style={{ gap: 10 }}>
        <View style={{ gap: 5 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t("rg.priceVsMa")}
            </Text>
            <Text
              style={{
                color: regime.priceVsMa200 >= 0 ? c("up") : c("down"),
                fontSize: 12,
                fontFamily: FONT.monoMed,
              }}
            >
              {regime.priceVsMa200 >= 0 ? "+" : ""}
              {regime.priceVsMa200.toFixed(1)}%
            </Text>
          </View>
          <GrowBar value={priceVal} color={regime.priceVsMa200 >= 0 ? c("up") : c("down")} />
        </View>
        <View style={{ gap: 5 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 11 }}>
              {t("rg.maVsMa")}
            </Text>
            <Text
              style={{
                color: regime.ma50VsMa200 >= 0 ? c("up") : c("down"),
                fontSize: 12,
                fontFamily: FONT.monoMed,
              }}
            >
              {regime.ma50VsMa200 >= 0 ? "+" : ""}
              {regime.ma50VsMa200.toFixed(1)}%
            </Text>
          </View>
          <GrowBar value={maVal} color={regime.ma50VsMa200 >= 0 ? c("up") : c("down")} />
        </View>
      </View>

      <View
        style={{
          flexDirection: "row",
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: c("border"),
        }}
      >
        {(
          [
            { label: t("rg.btcPrice"), value: `$${formatPrice(btc.price)}`, muted: false },
            { label: "MA50", value: btc.ma50 ? `$${formatPrice(btc.ma50)}` : "—", muted: true },
            { label: "MA200", value: btc.ma200 ? `$${formatPrice(btc.ma200)}` : "—", muted: true },
          ] as const
        ).map((it, i) => (
          <View key={it.label} style={{ flex: 1, alignItems: "center", gap: 3, borderLeftWidth: i > 0 ? 1 : 0, borderLeftColor: c("border") }}>
            <Text style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 1 }}>{it.label}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: it.muted ? c("muted-foreground") : c("foreground"),
                fontSize: 12,
                fontFamily: FONT.monoMed,
              }}
            >
              {it.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
})
