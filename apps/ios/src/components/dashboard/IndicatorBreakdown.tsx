import { memo } from "react"
import { Text, View } from "react-native"

import { t, tm, type MessageKey } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { SCORE_LEVEL_KEY, verdictOfScore } from "@repo/core/coinAnalysis"
import type { Analysis, IndicatorResult } from "@repo/core/indicators"

import { useAppTheme } from "../../lib/theme"
import { Card } from "../ui"
import { alpha } from "./color"
import { FONT } from "./util"

const kindLabel: Record<IndicatorResult["kind"], MessageKey> = {
  trend: "kind.trend",
  momentum: "kind.momentum",
  sentiment: "kind.sentiment",
  position: "kind.position",
}

/** 发散条：中线为 0，左红（空）右绿（多） */
function DivergingBar({ score }: { score: number }) {
  const { c } = useAppTheme()
  const pct = (Math.max(-2, Math.min(2, score)) / 2) * 50
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: c("secondary"), position: "relative", overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: 1, backgroundColor: alpha(c("border"), 0.8) }} />
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          borderRadius: 3,
          width: `${Math.abs(pct)}%`,
          left: pct >= 0 ? "50%" : undefined,
          right: pct >= 0 ? undefined : "50%",
          backgroundColor: pct >= 0 ? c("up") : c("down"),
        }}
      />
    </View>
  )
}

/** 指标明细：合成信号的完整推导过程（名称/读数/方向条/权重/判定/解读） */
export const IndicatorBreakdown = memo(function IndicatorBreakdown({ analysis }: { analysis: Analysis }) {
  useT()
  const { c } = useAppTheme()
  const wSum = analysis.indicators.reduce((a, i) => a + i.weight, 0)

  return (
    <Card style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 14, fontFamily: FONT.semi }}>
            {t("ib.title")}
          </Text>
          <Text numberOfLines={2} style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}>
            {t("ob.formula")}
          </Text>
        </View>
        <View style={{ borderWidth: 1, borderColor: c("border"), borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 }}>
          <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: FONT.mono, letterSpacing: 0.5 }}>
            {t("ib.badge", { n: analysis.indicators.length })}
          </Text>
        </View>
      </View>

      {analysis.indicators.map((ind, i) => {
        const v = verdictOfScore(ind.score)
        // 判定徽章统一描边式：涨跌色只作边框/文字；强弱层级用字重区分（strong 加粗）
        const badgeStyle = (() => {
          if (v.tone === "bull")
            return v.level === "long"
              ? { borderColor: c("up"), color: c("up"), bold: true }
              : { borderColor: alpha(c("up"), 0.6), color: c("up"), bold: false }
          if (v.tone === "bear")
            return v.level === "short"
              ? { borderColor: c("down"), color: c("down"), bold: true }
              : { borderColor: alpha(c("down"), 0.6), color: c("down"), bold: false }
          return { borderColor: "transparent", color: c("muted-foreground"), bold: false }
        })()
        return (
          <View
            key={ind.key}
            style={{
              gap: 6,
              paddingVertical: 10,
              borderTopWidth: i > 0 ? 1 : 0,
              borderTopColor: alpha(c("border"), 0.4),
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono, width: 18 }}>
                {String(i + 1).padStart(2, "0")}
              </Text>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.semi }}>
                  {tm(ind.name)}
                </Text>
                <Text style={{ color: c("muted-foreground"), fontSize: 9, letterSpacing: 1 }}>
                  {t(kindLabel[ind.kind])}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.monoMed, textAlign: "right" }}
              >
                {tm(ind.display)}
              </Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <DivergingBar score={ind.score} />
              </View>
              <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: FONT.mono, width: 30, textAlign: "right" }}>
                {((ind.weight / wSum) * 100).toFixed(0)}%
              </Text>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: badgeStyle.borderColor,
                  borderRadius: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  minWidth: 52,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: badgeStyle.color,
                    fontSize: 10,
                    fontFamily: badgeStyle.bold ? FONT.bold : FONT.regular,
                    letterSpacing: 0.5,
                  }}
                >
                  {t(SCORE_LEVEL_KEY[v.level])}
                </Text>
              </View>
            </View>

            <Text
              maxFontSizeMultiplier={1.3}
              style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 16 }}
            >
              {tm(ind.verdict)}
            </Text>
          </View>
        )
      })}
    </Card>
  )
})
