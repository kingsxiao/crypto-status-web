/**
 * 市场情绪（web apps/web/src/pages/SentimentPage.tsx 的 iOS 移植）：
 *
 *   alternative.me 恐惧贪婪指数（快照内 31 天）
 *     → 当前指数 + 关键点位（昨日/上周/上月差值 + 30 日均值/区间 + 解读）
 *     → 多空情绪总览（三维综合：技术面 50% / 情绪面 25% / 市场广度 25%，
 *       缺失维度按剩余权重归一 —— 与 web SentimentPage 同口径）
 *     → 近 30 日柱状走势（点按聚焦：web Tooltip 的触屏对应物，selection 触感）
 *     → 各情绪区间天数分布 + 逆向使用提示（链接回总览页）
 *
 * 状态机与 web 同构：加载骨架（含柱状剪影）/ 情绪源不可用空态 / 主内容。
 */

import { useCallback, useMemo, useState } from "react"
import { Animated, Pressable, StyleSheet, Text, View } from "react-native"
import { useRouter } from "expo-router"

import { STABLECOIN_IDS } from "@repo/data/api"
import { compositeOf, verdictOfComposite, verdictOfScore, VERDICT_LEVEL_KEY, SCORE_LEVEL_KEY } from "@repo/core/coinAnalysis"
import { fngLabel } from "@repo/core/fng"
import { t, tm, type MessageKey } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { clamp, scoreSentiment, type IndicatorResult } from "@repo/core/indicators"
import { useLive, useMarket } from "@repo/react/MarketData"

import { Card, Row, Txt } from "../ui"
import { useAppTheme } from "../../lib/theme"
import { hapticSelection } from "../../lib/haptics"
import {
  CompositeBar,
  Delta,
  DivergingBar,
  FngGradientBar,
  fngColor,
  GrowIn,
  Kicker,
  PageHead,
  PaneShell,
  Pill,
  SectionLabel,
  SkBlock,
  SkHead,
  useGrowIn,
} from "./parts"

/** 月/日两位数（web dateLocale + month/day 2-digit 的确定性格式化） */
function fmtDate(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`
}

/* ------------------------------ 观点行 / 汇总 ------------------------------ */

const KIND_LABEL: Record<IndicatorResult["kind"], MessageKey> = {
  trend: "kind.trend",
  momentum: "kind.momentum",
  sentiment: "kind.sentiment",
  position: "kind.position",
}

/** 单指标观点行（web OpinionRow 窄容器形态） */
function OpinionRow({ ind, wSum }: { ind: IndicatorResult; wSum: number }) {
  const { c } = useAppTheme()
  const t = useT()
  const v = verdictOfScore(ind.score)
  const strong = v.level === "long" || v.level === "short"
  return (
    <View style={{ gap: 6, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c("border") }}>
      <Row>
        <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600", flex: 1 }}>
          {tm(ind.name)}
        </Txt>
        <Txt mono variant="caption" maxScale={1.2} style={{ textAlign: "right" }}>
          {tm(ind.display)}
        </Txt>
      </Row>
      <Row style={{ gap: 8 }}>
        <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground"), flex: 1 }}>
          {t(KIND_LABEL[ind.kind])}
        </Txt>
        <Txt mono maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
          {`${((ind.weight / wSum) * 100).toFixed(0)}%`}
        </Txt>
        <Pill tone={v.tone === "bull" ? "up" : v.tone === "bear" ? "down" : "muted"} bold={strong}>
          {t(SCORE_LEVEL_KEY[v.level])}
        </Pill>
      </Row>
      <DivergingBar score={ind.score} />
      <Txt variant="caption" maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
        {tm(ind.verdict)}
      </Txt>
    </View>
  )
}

/** 汇总头：综合分 + 横条 + 结论 + 多空计数（web OpinionSummary） */
function OpinionSummary({
  composite,
  label,
  counts,
  note,
}: {
  composite: number
  label: string
  counts: { bull: number; bear: number; neutral: number }
  note: string
}) {
  const { c } = useAppTheme()
  const t = useT()
  return (
    <View style={{ gap: 10 }}>
      <Row style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <Row style={{ alignItems: "flex-end", gap: 12 }}>
          <Txt variant="display" mono maxScale={1.3} style={{ fontSize: 34, lineHeight: 40 }}>
            {`${composite > 0 ? "+" : ""}${composite}`}
          </Txt>
          <View style={{ gap: 2, paddingBottom: 4 }}>
            <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600" }}>
              {label}
            </Txt>
            <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
              {t("ob.unit")}
            </Txt>
          </View>
        </Row>
        <Row style={{ gap: 12 }}>
          <Txt mono variant="caption" maxScale={1.2} style={{ color: c("up") }}>
            {t("ob.countBull", { n: counts.bull })}
          </Txt>
          <Txt mono variant="caption" maxScale={1.2} style={{ color: c("muted-foreground") }}>
            {t("ob.countNeutral", { n: counts.neutral })}
          </Txt>
          <Txt mono variant="caption" maxScale={1.2} style={{ color: c("down") }}>
            {t("ob.countBear", { n: counts.bear })}
          </Txt>
        </Row>
      </Row>
      <CompositeBar composite={composite} />
      <Row style={{ justifyContent: "space-between" }}>
        <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
          {t("ob.scaleBear")}
        </Txt>
        <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
          {t("ob.scaleMid")}
        </Txt>
        <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
          {t("ob.scaleBull")}
        </Txt>
      </Row>
      <Txt maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
        {note}
      </Txt>
    </View>
  )
}

/* ------------------------------ 30 日柱状走势 ------------------------------ */

/** 近 30 日柱状图：fngShade 热力配色 + 自下而上 stagger 生长 + 点按聚焦（web hover Tooltip 的触屏对应物） */
function HistoryBars({ shown, grow, sel, onSelect }: { shown: { value: number; classification: string; timestamp: number }[]; grow: Animated.Value[]; sel: number | null; onSelect: (i: number | null) => void }) {
  const { c } = useAppTheme()
  const t = useT()
  const H = 200
  return (
    <View style={{ gap: 8 }}>
      {/* 聚焦读数行：默认显示今日值；点按柱体后显示该日日期/数值/分类 */}
      <Row style={{ justifyContent: "space-between", minHeight: 16 }}>
        {sel != null ? (
          <Txt mono variant="caption" maxScale={1.2} style={{ fontSize: 10, color: c("foreground") }}>
            {`${fmtDate(shown[sel].timestamp)} · ${shown[sel].value} ${fngLabel(shown[sel].classification)}`}
          </Txt>
        ) : (
          <Txt mono variant="caption" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("common.today")}
          </Txt>
        )}
        <Txt mono variant="caption" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
          {`${shown[shown.length - 1]?.value ?? "—"} · ${fngLabel(shown[shown.length - 1]?.classification ?? "")}`}
        </Txt>
      </Row>
      <View
        style={{ height: H, flexDirection: "row", alignItems: "stretch", gap: 4 }}
        accessibilityRole="image"
        accessibilityLabel={`${t("common.trend30")} · ${t("sentiment.range", { min: Math.min(...shown.map((e) => e.value)), max: Math.max(...shown.map((e) => e.value)) })}`}
      >
        {shown.map((e, i) => (
          <Pressable
            key={e.timestamp}
            accessibilityRole="button"
            accessibilityLabel={`${fmtDate(e.timestamp)} · ${e.value} ${fngLabel(e.classification)}`}
            hitSlop={2}
            onPress={() => {
              hapticSelection()
              onSelect(sel === i ? null : i)
            }}
            style={{ flex: 1, justifyContent: "flex-end", opacity: sel != null && sel !== i ? 0.4 : 1 }}
          >
            <Animated.View
              style={{
                height: Math.max(6, (e.value / 100) * H),
                backgroundColor: fngColor(e.value),
                borderTopLeftRadius: 3,
                borderTopRightRadius: 3,
                transform: [{ scaleY: grow[i] ?? 1 }],
                transformOrigin: "50% 100%",
              }}
            />
          </Pressable>
        ))}
      </View>
    </View>
  )
}

/* ------------------------------ 骨架 ------------------------------ */

function SentimentSkeleton() {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <SkBlock w={130} h={10} />
        <SkBlock w={150} h={22} r={6} />
        <SkBlock w="85%" h={12} />
      </View>
      <Card>
        <SkHead />
        <Row style={{ alignItems: "flex-end", gap: 16 }}>
          <SkBlock w={110} h={44} r={8} />
          <View style={{ gap: 6, paddingBottom: 4 }}>
            <SkBlock w={64} h={12} />
            <SkBlock w={40} h={8} />
          </View>
        </Row>
        <SkBlock w="100%" h={12} r={6} />
        <Row style={{ justifyContent: "space-between" }}>
          <SkBlock w={48} h={8} />
          <SkBlock w={40} h={8} />
          <SkBlock w={48} h={8} />
        </Row>
      </Card>
      <Card>
        <SkHead />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), borderRadius: 8, padding: 12, gap: 8, width: "48%", flexGrow: 1 }}>
              <SkBlock w={40 + (i % 2) * 12} h={8} />
              <SkBlock w={64} h={22} r={4} />
            </View>
          ))}
        </View>
      </Card>
      {/* 30 日柱状剪影 */}
      <Card>
        <SkHead />
        <View style={{ height: 180, flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
          {Array.from({ length: 30 }, (_, i) => (
            <SkBlock key={i} style={{ flex: 1 }} h={30 + ((i * 37) % 140)} />
          ))}
        </View>
      </Card>
    </View>
  )
}

/* ------------------------------ 页面 ------------------------------ */

type Stats = {
  now: { value: number; classification: string; timestamp: number }
  yesterday: { value: number; classification: string; timestamp: number }
  weekAgo: { value: number; classification: string; timestamp: number }
  monthAgo: { value: number; classification: string; timestamp: number }
  min: number
  max: number
  avg: number
}

type Entry = { value: number; classification: string; timestamp: number }

export function SentimentPane() {
  const t = useT()
  const { c } = useAppTheme()
  const router = useRouter()
  const { snapshot, loading, refreshing, refresh, analysis } = useMarket()
  const tickers = useLive()

  const fng = useMemo(() => snapshot?.fng ?? [], [snapshot])
  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  // 升序，末尾为今天（web history = [...fng].reverse()）
  const history = useMemo(() => [...fng].reverse(), [fng])
  const shown = useMemo(() => history.slice(-30), [history])
  const grow = useGrowIn(shown.length)
  const [sel, setSel] = useState<number | null>(null)

  const stats = useMemo<Stats | null>(() => {
    if (!fng.length) return null
    const at = (d: number) => fng[Math.min(d, fng.length - 1)]
    const values = fng.map((e) => e.value)
    return {
      now: at(0),
      yesterday: at(1),
      weekAgo: at(7),
      monthAgo: at(30),
      min: Math.min(...values),
      max: Math.max(...values),
      avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
    }
  }, [fng])

  // 30 日各情绪区间天数分布
  const dist = useMemo(() => {
    const buckets = [
      { key: "Extreme Fear", label: "fng.extremeFear" as MessageKey, range: [0, 24] as const },
      { key: "Fear", label: "fng.fear" as MessageKey, range: [25, 44] as const },
      { key: "Neutral", label: "fng.neutral" as MessageKey, range: [45, 55] as const },
      { key: "Greed", label: "fng.greed" as MessageKey, range: [56, 75] as const },
      { key: "Extreme Greed", label: "fng.extremeGreed" as MessageKey, range: [76, 100] as const },
    ]
    return buckets.map((b) => ({
      ...b,
      days: fng.filter((e) => e.value >= b.range[0] && e.value <= b.range[1]).length,
    }))
  }, [fng])

  /* -------- 多空情绪总览：技术面 / 情绪面 / 市场广度 三维综合（与 web 同口径） -------- */
  const synthesis = useMemo(() => {
    // 1) 技术面：BTC 日线指标（复用总览页信号引擎，剔除情绪项避免重复计数）
    const tech = analysis?.indicators.filter((i) => i.kind !== "sentiment") ?? []
    const techComp = compositeOf(tech)

    // 2) 情绪面：恐惧贪婪逆向 + 情绪周变化顺势
    const sent: IndicatorResult[] = []
    if (stats) {
      sent.push({
        key: "fng-contrarian",
        name: { key: "ind.fngContrarian.name" },
        display: { key: "ind.sentiment.display", params: { value: stats.now.value, class: stats.now.classification } },
        score: scoreSentiment(stats.now.value),
        weight: 60,
        verdict: {
          key:
            stats.now.value <= 25 ? "ind.fngContrarian.v1"
            : stats.now.value <= 45 ? "ind.fngContrarian.v2"
            : stats.now.value < 55 ? "ind.fngContrarian.v3"
            : stats.now.value < 75 ? "ind.fngContrarian.v4"
            : "ind.fngContrarian.v5",
        },
        kind: "sentiment",
      })
      const wd = stats.now.value - stats.weekAgo.value
      sent.push({
        key: "fng-momentum",
        name: { key: "ind.fngMomentum.name" },
        display: `${wd >= 0 ? "+" : ""}${wd}`,
        score: clamp(wd / 20, -2, 2),
        weight: 40,
        verdict: {
          key:
            wd >= 8 ? "ind.fngMomentum.v1"
            : wd >= 3 ? "ind.fngMomentum.v2"
            : wd > -3 ? "ind.fngMomentum.v3"
            : wd > -8 ? "ind.fngMomentum.v4"
            : "ind.fngMomentum.v5",
        },
        kind: "momentum",
      })
    }
    const sentComp = compositeOf(sent)

    // 3) 市场广度：主流币 24H 涨跌家数与平均涨幅
    const breadth: IndicatorResult[] = []
    const pcts = coins
      .filter((x) => !STABLECOIN_IDS.has(x.id))
      .map((x) => tickers[x.id]?.changePct ?? x.price_change_percentage_24h_in_currency ?? 0)
    if (pcts.length >= 3) {
      const up = pcts.filter((v) => v > 0).length
      const down = pcts.filter((v) => v < 0).length
      const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length
      breadth.push({
        key: "breadth-ratio",
        name: { key: "ind.breadthRatio.name" },
        display: { key: "ind.breadthRatio.display", params: { up, down } },
        score: clamp(((up - down) / pcts.length) * 2, -2, 2),
        weight: 50,
        verdict: {
          key:
            up / pcts.length >= 0.7 ? "ind.breadthRatio.v1"
            : up / pcts.length >= 0.5 ? "ind.breadthRatio.v2"
            : down / pcts.length >= 0.7 ? "ind.breadthRatio.v3"
            : "ind.breadthRatio.v4",
        },
        kind: "momentum",
      })
      breadth.push({
        key: "breadth-avg",
        name: { key: "ind.breadthAvg.name" },
        display: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`,
        score: clamp(avg / 5, -2, 2),
        weight: 50,
        verdict: {
          key:
            avg >= 3 ? "ind.breadthAvg.v1"
            : avg >= 0.5 ? "ind.breadthAvg.v2"
            : avg > -0.5 ? "ind.breadthAvg.v3"
            : avg > -3 ? "ind.breadthAvg.v4"
            : "ind.breadthAvg.v5",
        },
        kind: "momentum",
      })
    }
    const breadthComp = compositeOf(breadth)

    // 加权总合成：技术 50% / 情绪 25% / 广度 25%（缺失维度按剩余权重归一）
    const parts: { comp: number; w: number }[] = []
    if (techComp !== null) parts.push({ comp: techComp, w: 0.5 })
    if (sentComp !== null) parts.push({ comp: sentComp, w: 0.25 })
    if (breadthComp !== null) parts.push({ comp: breadthComp, w: 0.25 })
    const total = parts.length
      ? Math.round(parts.reduce((a, p) => a + p.comp * p.w, 0) / parts.reduce((a, p) => a + p.w, 0))
      : null

    // 全部指标的多空计数
    const all = [...tech, ...sent, ...breadth]
    const counts = { bull: 0, bear: 0, neutral: 0 }
    for (const i of all) {
      const tone = verdictOfScore(i.score).tone
      counts[tone === "bull" ? "bull" : tone === "bear" ? "bear" : "neutral"]++
    }

    return { tech, techComp, sent, sentComp, breadth, breadthComp, total, counts }
  }, [stats, coins, tickers, analysis])

  const onRefresh = useCallback(() => refresh(), [refresh])

  if (loading && !snapshot) {
    return (
      <PaneShell refreshing={false} onRefresh={onRefresh}>
        <SentimentSkeleton />
      </PaneShell>
    )
  }

  if (!stats) {
    return (
      <PaneShell refreshing={refreshing} onRefresh={onRefresh}>
        <Card style={{ alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 64 }}>
          <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600", textAlign: "center" }}>
            {t("sentiment.unavailable")}
          </Txt>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center" }}>
            {t("sentiment.unavailableDesc")}
          </Txt>
        </Card>
      </PaneShell>
    )
  }

  const interpKey: MessageKey =
    stats.now.value >= 75 ? "sentiment.interp1"
    : stats.now.value >= 56 ? "sentiment.interp2"
    : stats.now.value >= 45 ? "sentiment.interp3"
    : stats.now.value >= 25 ? "sentiment.interp4"
    : "sentiment.interp5"

  return (
    <PaneShell refreshing={refreshing} onRefresh={onRefresh}>
      <PageHead en="SENTIMENT" title={t("page.sentiment.title")} desc={t("page.sentiment.desc")} />

      {/* 当前指数 + 关键点位 */}
      <Card>
        <Kicker title={t("sentiment.current")} en="FEAR & GREED" desc={`${fmtDate(stats.now.timestamp)} · alternative.me`} />
        <Row style={{ alignItems: "flex-end", gap: 12 }}>
          {/* hero 读数：padStart 保留个位数日前导零（"05" 形态，与 web 一致） */}
          <Txt variant="display" mono maxScale={1.3} style={{ fontSize: 44, lineHeight: 48 }}>
            {String(stats.now.value).padStart(2, "0")}
          </Txt>
          <View style={{ gap: 2, paddingBottom: 6 }}>
            <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600" }}>
              {fngLabel(stats.now.classification)}
            </Txt>
            <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
              / 100
            </Txt>
          </View>
        </Row>
        <FngGradientBar height={12} value={stats.now.value} />
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("sentiment.scale0")}
          </Txt>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("sentiment.scale50")}
          </Txt>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("sentiment.scale100")}
          </Txt>
        </Row>
      </Card>

      <Card>
        <Kicker title={t("sentiment.keyLevels")} en="KEY LEVELS" desc={t("sentiment.keyLevelsDesc")} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              { label: t("sentiment.yesterday"), entry: stats.yesterday },
              { label: t("sentiment.weekAgo"), entry: stats.weekAgo },
              { label: t("sentiment.monthAgo"), entry: stats.monthAgo },
            ] as { label: string; entry: Entry }[]
          ).map(({ label, entry }) => (
            <View key={label} style={{ width: "48%", flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), borderRadius: 8, padding: 12, gap: 4 }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
                  {label}
                </Txt>
                <Delta d={stats.now.value - entry.value} />
              </Row>
              <Txt mono variant="title" maxScale={1.3} style={{ fontSize: 22, lineHeight: 28 }}>
                {entry.value}
              </Txt>
              <Txt maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
                {fngLabel(entry.classification)}
              </Txt>
            </View>
          ))}
          <View style={{ width: "48%", flexGrow: 1, borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), borderRadius: 8, padding: 12, gap: 4 }}>
            <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
              {t("sentiment.avg30")}
            </Txt>
            <Txt mono variant="title" maxScale={1.3} style={{ fontSize: 22, lineHeight: 28 }}>
              {stats.avg}
            </Txt>
            <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
              {t("sentiment.range", { min: stats.min, max: stats.max })}
            </Txt>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("sentiment.reading")}
          </Txt>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 18 }}>
            {t(interpKey)}
          </Txt>
        </View>
      </Card>

      {/* 多空情绪总览：三维综合判断 */}
      {synthesis.total !== null && (
        <>
          <SectionLabel>{t("sentiment.synthesisLabel")}</SectionLabel>
          <Card>
            <OpinionSummary
              composite={synthesis.total}
              label={t("sentiment.compositeLabel", { label: t(VERDICT_LEVEL_KEY[verdictOfComposite(synthesis.total).level]) })}
              counts={synthesis.counts}
              note={t("sentiment.synthesisNote")}
            />
          </Card>
          {(
            [
              { title: t("dim.tech"), en: "TECHNICAL", desc: t("dim.tech.desc"), list: synthesis.tech, comp: synthesis.techComp },
              { title: t("dim.sent"), en: "SENTIMENT", desc: t("dim.sent.desc"), list: synthesis.sent, comp: synthesis.sentComp },
              { title: t("dim.breadth"), en: "BREADTH", desc: t("dim.breadth.desc"), list: synthesis.breadth, comp: synthesis.breadthComp },
            ] as const
          ).map((dim) => {
            const wSum = dim.list.reduce((a, x) => a + x.weight, 0)
            return (
              <Card key={dim.title}>
                <Kicker title={dim.title} en={dim.en} desc={dim.desc} />
                {dim.comp !== null && (
                  <View style={{ gap: 6 }}>
                    <Row style={{ justifyContent: "space-between" }}>
                      <Txt
                        mono
                        variant="caption"
                        maxScale={1.2}
                        style={{ fontWeight: "700", color: dim.comp >= 15 ? c("up") : dim.comp <= -15 ? c("down") : c("muted-foreground") }}
                      >
                        {`${dim.comp > 0 ? "+" : ""}${dim.comp}`}
                      </Txt>
                      <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
                        {t(VERDICT_LEVEL_KEY[verdictOfComposite(dim.comp).level])}
                      </Txt>
                    </Row>
                    <CompositeBar composite={dim.comp} />
                  </View>
                )}
                {dim.list.length ? (
                  <View>{dim.list.map((ind) => (
                    <OpinionRow key={ind.key} ind={ind} wSum={wSum} />
                  ))}</View>
                ) : (
                  <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center", paddingVertical: 20 }}>
                    {t("sentiment.dim.unavailable")}
                  </Txt>
                )}
              </Card>
            )
          })}
        </>
      )}

      {/* 30 日历史（柱体自下而上生长；点按聚焦当日读数） */}
      <Card>
        <Kicker title={t("common.trend30")} desc={t("sentiment.historyDesc")} />
        <HistoryBars shown={shown} grow={grow} sel={sel} onSelect={setSel} />
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {fmtDate(shown[0]?.timestamp ?? stats.now.timestamp)}
          </Txt>
          <Txt variant="label" maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
            {t("common.today")}
          </Txt>
        </Row>
      </Card>

      {/* 分布（占比条自左生长） */}
      <Card>
        <Kicker title={t("sentiment.distTitle")} desc={t("sentiment.distDesc")} />
        <View style={{ gap: 10 }}>
          {dist.map((b) => {
            const mid = (b.range[0] + b.range[1]) / 2
            return (
              <Row key={b.key} style={{ gap: 12 }}>
                <Txt variant="caption" maxScale={1.2} style={{ width: 64, textAlign: "right", color: c("muted-foreground") }}>
                  {t(b.label)}
                </Txt>
                <View style={{ flex: 1, height: 24, borderRadius: 4, backgroundColor: c("secondary"), overflow: "hidden" }}>
                  <GrowIn
                    style={{
                      height: 24,
                      width: `${Math.max(b.days ? 8 : 0, (b.days / Math.max(1, fng.length)) * 100)}%`,
                      backgroundColor: fngColor(mid),
                      justifyContent: "flex-end",
                      paddingRight: 8,
                    }}
                  >
                    {b.days > 0 && (
                      <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 10, color: mid >= 50 ? c("foreground") : c("background"), fontFamily: "JetBrainsMono_500Medium", textAlign: "right" }}>
                        {t("sentiment.daysCount", { n: b.days })}
                      </Text>
                    )}
                  </GrowIn>
                </View>
                <Txt mono maxScale={1.2} style={{ width: 48, fontSize: 10, color: c("muted-foreground") }}>
                  {`${b.range[0]}–${b.range[1]}`}
                </Txt>
              </Row>
            )
          })}
        </View>
        {/* 逆向使用提示：整段为 ≥44pt 的链接命中区（web 的 <Link to="/">） */}
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            hapticSelection()
            router.push("/")
          }}
          style={{ minHeight: 44, justifyContent: "center" }}
        >
          <Text maxFontSizeMultiplier={1.3} style={{ fontSize: 10, lineHeight: 15, color: c("muted-foreground") }}>
            {`${t("sentiment.tipA")} `}
            <Text style={{ color: c("primary"), textDecorationLine: "underline" }}>{t("sentiment.tipLink")}</Text>
            {` ${t("sentiment.tipB")}`}
          </Text>
        </Pressable>
      </Card>
    </PaneShell>
  )
}
