/**
 * 通用多空观点看板 — web OpinionBoard.tsx 的 RN 移植：
 * 综合分汇总（CompositeBar ±100）+ 逐指标观点行（DivergingBar -2..+2）。
 * 引擎与文案 key 与 web 完全同源（@repo/core/coinAnalysis），zh/en 双语保留。
 */

import { memo } from "react"
import { StyleSheet, Text, View } from "react-native"

import { joinList, t, tm } from "@repo/core/i18n"
import type { IndicatorResult } from "@repo/core/indicators"
import {
  SCORE_LEVEL_KEY,
  VERDICT_LEVEL_KEY,
  verdictOfScore,
  type CoinAnalysis,
} from "@repo/core/coinAnalysis"
import { useT } from "@repo/react/i18n"

import { useAppTheme } from "../lib/theme"
import { Card } from "./ui"

const kindLabel: Record<IndicatorResult["kind"], Parameters<typeof t>[0]> = {
  trend: "kind.trend",
  momentum: "kind.momentum",
  sentiment: "kind.sentiment",
  position: "kind.position",
}

/** 单指标分值横条：中线 0，左空右多，-2 ~ +2 */
export function DivergingBar({ score }: { score: number }) {
  const { c } = useAppTheme()
  const pct = (Math.max(-2, Math.min(2, score)) / 2) * 50
  return (
    <View style={[s.barTrack, { backgroundColor: c("secondary") }]}>
      <View style={[s.barMid, { backgroundColor: c("border") }]} />
      <View
        style={[
          s.barFill,
          pct >= 0 ? { left: "50%", backgroundColor: c("up") } : { right: "50%", backgroundColor: c("down") },
          { width: `${Math.abs(pct)}%` },
        ]}
      />
    </View>
  )
}

/** 综合分横条：中线 0，左空右多，-100 ~ +100 */
export function CompositeBar({ composite }: { composite: number }) {
  const { c } = useAppTheme()
  const clamped = Math.max(-100, Math.min(100, composite))
  const pct = (Math.abs(clamped) / 100) * 50
  return (
    <View style={[s.barTrack, { height: 10, borderRadius: 5, backgroundColor: c("secondary") }]}>
      <View style={[s.barMid, { backgroundColor: c("border") }]} />
      <View
        style={[
          s.barFill,
          { borderRadius: 5 },
          clamped >= 0 ? { left: "50%", backgroundColor: c("up") } : { right: "50%", backgroundColor: c("down") },
          { width: `${pct}%` },
        ]}
      />
    </View>
  )
}

/** 判定档位（与 web verdictBadge 同档位口径） */

function ScoreBadge({ score }: { score: number }) {
  const { c } = useAppTheme()
  const level = verdictOfScore(score).level
  const text = t(SCORE_LEVEL_KEY[level])
  const bg =
    level === "long" ? c("up") : level === "short" ? c("down") : "transparent"
  const border =
    level === "long" || level === "leanLong"
      ? c("up")
      : level === "short" || level === "leanShort"
        ? c("down")
        : c("border")
  const color =
    level === "long"
      ? c("up-foreground")
      : level === "short"
        ? c("down-foreground")
        : level === "leanLong"
          ? c("up")
          : level === "leanShort"
            ? c("down")
            : c("muted-foreground")
  return (
    <View style={[s.badge, { borderColor: border, backgroundColor: bg }]}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{text}</Text>
    </View>
  )
}

/** 单指标观点行（窄容器堆叠布局，对应 web OpinionRow 的移动端形态） */
export function OpinionRow({ ind, wSum }: { ind: IndicatorResult; wSum: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c("border") }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c("foreground"), fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
            {tm(ind.name)}
          </Text>
          <Text style={{ color: c("muted-foreground"), fontSize: 11, letterSpacing: 0.5 }}>{t(kindLabel[ind.kind])}</Text>
        </View>
        <Text style={{ color: c("foreground"), fontSize: 14, fontFamily: "JetBrainsMono_500Medium", textAlign: "right" }}>
          {tm(ind.display)}
        </Text>
      </View>
      <DivergingBar score={ind.score} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15, flex: 1 }}>{tm(ind.verdict)}</Text>
        <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: "JetBrainsMono_400Regular" }}>
          {((ind.weight / wSum) * 100).toFixed(0)}%
        </Text>
        <ScoreBadge score={ind.score} />
      </View>
    </View>
  )
}

/** 汇总：综合分 + 横条 + 结论 + 多空计数 */
export function OpinionSummary({
  composite,
  label,
  counts,
  note,
}: {
  composite: number
  label: string
  counts: { bull: number; bear: number; neutral: number }
  note?: string | null
}) {
  useT()
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 10, backgroundColor: c("secondary"), borderRadius: 8, padding: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <Text style={{ color: c("foreground"), fontSize: 34, lineHeight: 38, fontFamily: "JetBrainsMono_500Medium", fontWeight: "700" }}>
            {composite > 0 ? "+" : ""}
            {composite}
          </Text>
          <View style={{ gap: 2, paddingBottom: 3 }}>
            <Text style={{ color: c("foreground"), fontSize: 14, fontWeight: "600" }}>{label}</Text>
            <Text style={{ color: c("muted-foreground"), fontSize: 11, letterSpacing: 1 }}>{t("ob.unit")}</Text>
          </View>
        </View>
        <View style={{ gap: 2, alignItems: "flex-end" }}>
          <Text style={{ color: c("up"), fontSize: 11, fontFamily: "JetBrainsMono_400Regular" }}>
            {t("ob.countBull", { n: counts.bull })}
          </Text>
          <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: "JetBrainsMono_400Regular" }}>
            {t("ob.countNeutral", { n: counts.neutral })}
          </Text>
          <Text style={{ color: c("down"), fontSize: 11, fontFamily: "JetBrainsMono_400Regular" }}>
            {t("ob.countBear", { n: counts.bear })}
          </Text>
        </View>
      </View>
      <CompositeBar composite={composite} />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 1 }}>{t("ob.scaleBear")}</Text>
        <Text style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 1 }}>{t("ob.scaleMid")}</Text>
        <Text style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 1 }}>{t("ob.scaleBull")}</Text>
      </View>
      {note ? <Text style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 16 }}>{note}</Text> : null}
    </View>
  )
}

/** 完整观点看板卡片（memo：analysis 引用随 5s 采样稳定，秒级 live 不牵连重渲染） */
export const OpinionBoard = memo(function OpinionBoard({
  analysis,
  title,
  badge,
}: {
  analysis: CoinAnalysis
  title?: string
  badge?: string
}) {
  useT()
  const { c } = useAppTheme()
  const wSum = analysis.indicators.reduce((a, i) => a + i.weight, 0)
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text style={{ color: c("foreground"), fontSize: 15, fontWeight: "600" }} numberOfLines={1}>
          {title ?? t("ob.title")}
        </Text>
        {badge ? (
          <View style={[s.badge, { borderColor: c("border") }]}>
            <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: "JetBrainsMono_400Regular" }}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <OpinionSummary
        composite={analysis.composite}
        label={t(VERDICT_LEVEL_KEY[analysis.verdict.level])}
        counts={analysis.counts}
        note={analysis.note ? t("coin.note", { list: joinList(analysis.note.missing.map((k) => t(k))) }) : null}
      />
      {analysis.indicators.map((ind) => (
        <OpinionRow key={ind.key} ind={ind} wSum={wSum} />
      ))}
    </Card>
  )
})

const s = StyleSheet.create({
  barTrack: { height: 6, borderRadius: 3, backgroundColor: "transparent", position: "relative", overflow: "hidden" },
  barMid: { position: "absolute", top: 0, bottom: 0, left: "50%", width: StyleSheet.hairlineWidth },
  barFill: { position: "absolute", top: 0, bottom: 0, borderRadius: 3 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
})
