import { memo, useEffect, useMemo, useState } from "react"
import { Text, View } from "react-native"
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import type { FearGreedEntry } from "@repo/data/api"
import { fngLabel, fngShade } from "@repo/core/fng"

import { useAppTheme } from "../../lib/theme"
import { rnColor } from "../../lib/colors"
import { Card } from "../ui"
import { CardKicker, EASE_STATE, FONT } from "./util"

/** 情绪条五段热力色（fngShade 同源 oklch 原串经 rnColor；RN 无 CSS 渐变，用等比分段近似 FNG_GRADIENT） */
const FNG_STOPS = [0, 25, 45, 55, 75].map((edge) => rnColor(fngShade(edge + 0.5)))
const FNG_SEGMENTS = [
  { w: 25, color: FNG_STOPS[0] },
  { w: 20, color: FNG_STOPS[1] },
  { w: 10, color: FNG_STOPS[2] },
  { w: 20, color: FNG_STOPS[3] },
  { w: 25, color: FNG_STOPS[4] },
]

/** 恐惧贪婪指数卡（alternative.me）+ 30 日情绪走势 */
export const SentimentCard = memo(function SentimentCard({ fng }: { fng: FearGreedEntry[] }) {
  useT()
  const { c } = useAppTheme()

  const latest = fng[0]
  const history = useMemo(() => [...fng].reverse(), [fng]) // 时间升序，末尾为今天
  const weekAgo = fng[Math.min(7, fng.length - 1)]
  const monthMin = fng.length ? Math.min(...fng.map((e) => e.value)) : 0
  const monthMax = fng.length ? Math.max(...fng.map((e) => e.value)) : 0
  const weekDelta = latest && weekAgo ? latest.value - weekAgo.value : 0

  // 游标挂载从中性位（50）滑到当前值（450ms 状态切换档）
  const cursor = useSharedValue(0.5)
  const [barW, setBarW] = useState(0)
  useEffect(() => {
    if (latest) cursor.value = withTiming(latest.value / 100, { duration: 450, easing: EASE_STATE })
  }, [latest?.value, cursor])
  const cursorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: barW * cursor.value }] }))

  return (
    <Card style={{ gap: 12 }}>
      <CardKicker glyph="◐" title={t("page.sentiment.title")} en="FEAR & GREED" desc={t("sc.desc")} />

      {latest ? (
        <>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
            <Text
              maxFontSizeMultiplier={1.4}
              style={{ color: c("foreground"), fontSize: 40, lineHeight: 44, fontFamily: FONT.monoMed }}
            >
              {String(latest.value).padStart(2, "0")}
            </Text>
            <View style={{ gap: 2, paddingBottom: 5 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.semi }}>
                {fngLabel(latest.classification)}
              </Text>
              <Text style={{ color: c("muted-foreground"), fontSize: 11 }}>/ 100</Text>
            </View>
          </View>

          {/* 0-100 情绪条：分段热力色 + 游标 */}
          <View
            onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
            style={{ height: 10, borderRadius: 5, overflow: "hidden", flexDirection: "row" }}
          >
            {FNG_SEGMENTS.map((seg, i) => (
              <View key={i} style={{ width: `${seg.w}%`, backgroundColor: seg.color }} />
            ))}
            <Animated.View
              style={[
                cursorStyle,
                {
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: -1.5,
                  width: 3,
                  borderRadius: 2,
                  backgroundColor: c("popover"),
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 10 }}>
              {t("sc.scaleLeft")}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 10 }}>
              {t("sc.scaleMid")}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 10 }}>
              {t("sc.scaleRight")}
            </Text>
          </View>

          {/* 30 日情绪柱状 */}
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 1 }}>
                {t("common.trend30")}
              </Text>
              <Text style={{ color: c("muted-foreground"), fontSize: 11 }}>
                {t("sc.weekChg", { v: `${weekDelta >= 0 ? "+" : ""}${weekDelta}` })}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 48 }} accessibilityElementsHidden>
              {history.slice(-30).map((e, i) => (
                <Animated.View
                  key={i}
                  entering={FadeIn.delay(Math.min(i, 8) * 60)}
                  style={{
                    flex: 1,
                    borderRadius: 2,
                    height: `${18 + (e.value / 100) * 82}%`,
                    backgroundColor: rnColor(fngShade(e.value)),
                  }}
                />
              ))}
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c("muted-foreground"), fontSize: 11 }}>
                {t("sc.monthMin", { v: monthMin })}
              </Text>
              <Text style={{ color: c("muted-foreground"), fontSize: 11 }}>
                {t("sc.monthMax", { v: monthMax })}
              </Text>
            </View>
          </View>
        </>
      ) : (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12 }}>
            {t("sc.unavailable")}
          </Text>
        </View>
      )}
    </Card>
  )
})
