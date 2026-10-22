/**
 * 每日市场立场（web apps/web/src/pages/VerdictPage.tsx 的 iOS 移植）：
 *
 *   MarketData 快照 + @repo/data/crossAsset 三源取数（稳定币/衍生品/广度）
 *     → computeVerdict 五档立场 + 综合分 + 规则化叙述
 *     → 立场卡（仪表+置信度+标题+主题）/ 立场分布 / 今日关注
 *     → 指标明细表（按域分组，完整披露读数/方向/权重/判定/依据）
 *     → 体量参照（MARKET_ANCHORS 慢变锚 + 实时加密总市值）
 *     → 判断历史（upsertToday 落库 + 次日总市值复盘打分）
 *
 * 状态机与 web 同构：加载骨架 / 快照失败重试 / 跨资产过渡态 / 主内容。
 * 判断史经 storageBus 持久化（AsyncStorage），跨启动保留。
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Pressable, StyleSheet, View } from "react-native"

import {
  computeVerdict,
  cryptoMcapOf,
  DOMAIN_KEY,
  gradeRecord,
  gradeStats,
  headlineText,
  loadHistory,
  MARKET_ANCHORS,
  themeText,
  upsertToday,
  type CrossIndicator,
  type Grade,
  type Verdict,
  type VerdictRecord,
} from "@repo/core/crossAsset"
import { fetchCrossAsset, type CrossAssetData } from "@repo/data/crossAsset"
import { formatUsdCompact } from "@repo/core/format"
import { t, tm, joinList, type LMsg, type MessageKey } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { SCORE_LEVEL_KEY, verdictOfScore } from "@repo/core/coinAnalysis"
import { useMarket } from "@repo/react/MarketData"

import { Card, Row, Tap, Txt } from "../ui"
import { useAppTheme } from "../../lib/theme"
import { hapticSelection } from "../../lib/haptics"
import {
  DivergingBar,
  GrowIn,
  Kicker,
  LoadingDots,
  PageHead,
  PaneShell,
  Pill,
  SignalGauge,
  SkBlock,
  SkHead,
  StanceBadge,
} from "./parts"

/* ------------------------------ 今日关注 ------------------------------ */

/** 由极值读数规则生成的观察清单（web WatchCard） */
function WatchCard({ items }: { items: LMsg[] }) {
  const { c } = useAppTheme()
  return (
    <Card>
      <Kicker title={t("vp.watchTitle")} en="WATCHLIST" desc={t("vp.watchDesc")} />
      <View style={{ gap: 10 }}>
        {items.map((w) => (
          <View key={w.key} style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ marginTop: 6, width: 6, height: 6, borderRadius: 3, borderWidth: 1, borderColor: c("primary") }} />
            <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), flex: 1, lineHeight: 18 }}>
              {tm(w)}
            </Txt>
          </View>
        ))}
      </View>
      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c("border"), paddingTop: 10 }}>
        <Txt maxScale={1.2} style={{ fontSize: 10, lineHeight: 15, color: c("muted-foreground"), opacity: 0.7 }}>
          {t("vp.reviewNote")}
        </Txt>
      </View>
    </Card>
  )
}

/* ------------------------------ 立场卡 ------------------------------ */

/** 每日市场立场：五档判定 + 综合分仪表 + 置信度 + 规则化标题（web VerdictCard） */
function VerdictCardView({ verdict }: { verdict: Verdict }) {
  const { c } = useAppTheme()
  const t = useT()
  return (
    <Card>
      <Kicker title={t("vc.title")} en="DAILY VERDICT" desc={t("vc.desc", { date: verdict.date })} />
      <SignalGauge score={verdict.composite} />
      <View style={{ alignItems: "center", gap: 8 }}>
        <Txt variant="display" mono maxScale={1.3} style={{ fontSize: 30, lineHeight: 36 }}>
          {`${verdict.composite > 0 ? "+" : ""}${verdict.composite}`}
        </Txt>
        <StanceBadge stance={verdict.stance} />
      </View>

      {/* 置信度：方向一致度 × 综合分强度 */}
      <View style={{ gap: 6 }}>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
            {t("vc.confidence")}
          </Txt>
          <Txt mono variant="caption" maxScale={1.2}>
            {`${(verdict.confidence * 100).toFixed(0)}%`}
          </Txt>
        </Row>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c("secondary"), overflow: "hidden" }}>
          <GrowIn style={{ height: 6, borderRadius: 3, backgroundColor: c("primary"), width: `${Math.round(verdict.confidence * 100)}%` }} />
        </View>
      </View>

      <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c("border"), paddingTop: 10, gap: 8 }}>
        <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600", lineHeight: 22 }}>
          {headlineText(verdict.headline)}
        </Txt>
        {verdict.themes.map((th, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ marginTop: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: c("primary"), opacity: 0.7 }} />
            <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), flex: 1, lineHeight: 18 }}>
              {themeText(th)}
            </Txt>
          </View>
        ))}
      </View>
    </Card>
  )
}

/* ------------------------------ 立场分布 ------------------------------ */

type Faction = "bull" | "neutral" | "bear"

function factionOf(score: number): Faction {
  if (score > 0.2) return "bull"
  if (score < -0.2) return "bear"
  return "neutral"
}

/** 立场分布：占比堆叠条 + 图例 + 分组明细（web StanceMixCard）。hover 联动 → 点按高亮（selection 触感）。 */
function StanceMixCard({ verdict }: { verdict: Verdict }) {
  const { c } = useAppTheme()
  const t = useT()
  const [focus, setFocus] = useState<Faction | null>(null)
  const total = verdict.indicators.length
  const groups: { key: Faction; label: MessageKey }[] = [
    { key: "bull", label: "sm.bull" },
    { key: "neutral", label: "sm.neutral" },
    { key: "bear", label: "sm.bear" },
  ]
  const dotColor = (f: Faction) => (f === "bull" ? c("up") : f === "bear" ? c("down") : c("primary"))

  return (
    <Card>
      <Kicker title={t("sm.title")} en="STANCE MIX" desc={t("sm.desc", { n: total })} />
      <View style={{ height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), overflow: "hidden", flexDirection: "row" }}>
        {groups.map((g, gi) => {
          const n = verdict.mix[g.key]
          if (!n) return null
          return (
            <GrowIn
              key={g.key}
              delayMs={gi * 120}
              style={{
                width: `${(n / total) * 100}%`,
                height: "100%",
                backgroundColor: dotColor(g.key),
                opacity: g.key === "neutral" ? 0.25 : focus != null && focus !== g.key ? 0.45 : 1,
              }}
            />
          )
        })}
      </View>

      <Row style={{ justifyContent: "space-between" }}>
        {groups.map((g) => (
          <TapLegend key={g.key} dim={focus != null && focus !== g.key} onPress={() => setFocus(focus === g.key ? null : g.key)}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor(g.key), opacity: g.key === "neutral" ? 0.3 : 1 }} />
              <Txt mono variant="caption" maxScale={1.2}>
                {verdict.mix[g.key]}
              </Txt>
              <Txt variant="caption" maxScale={1.2} style={{ color: focus === g.key ? c("foreground") : c("muted-foreground") }}>
                {t(g.label)}
              </Txt>
            </View>
          </TapLegend>
        ))}
      </Row>

      <View style={{ gap: 12 }}>
        {groups.map((g) => {
          const items = verdict.indicators.filter((i) => factionOf(i.score) === g.key)
          if (!items.length) return null
          return (
            <View key={g.key} style={{ gap: 6, opacity: focus != null && focus !== g.key ? 0.45 : 1 }}>
              <Txt variant="label" maxScale={1.2} style={{ color: focus === g.key ? c("foreground") : c("muted-foreground") }}>
                {`${t(g.label)} · ${items.length}`}
              </Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {items.map((i) => (
                  <View
                    key={i.key}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: c("border"),
                      backgroundColor: c("secondary"),
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 5,
                    }}
                  >
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor(g.key), opacity: g.key === "neutral" ? 0.3 : 1 }} />
                    <Txt maxScale={1.2} style={{ fontSize: 11, fontWeight: "500" }}>
                      {tm(i.name)}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
          )
        })}
      </View>
    </Card>
  )
}

/* ------------------------------ 指标明细表 ------------------------------ */

/** 单指标行（web CrossAssetTable 移动端形态）：名称/读数 → 域/权重/判定 → 方向条 → 结论与依据 */
function IndicatorRow({ ind, wSum }: { ind: CrossIndicator; wSum: number }) {
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
          {t(DOMAIN_KEY[ind.domain])}
        </Txt>
        <Txt mono maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
          {`${((ind.weight / wSum) * 100).toFixed(0)}%`}
        </Txt>
        <Pill tone={v.tone === "bull" ? "up" : v.tone === "bear" ? "down" : "muted"} bold={strong}>
          {t(SCORE_LEVEL_KEY[v.level])}
        </Pill>
      </Row>
      <DivergingBar score={ind.score * 2} />
      <Txt variant="caption" maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
        {`${tm(ind.verdict)} · ${tm(ind.rationale)}`}
      </Txt>
    </View>
  )
}

/** 跨资产指标表（web CrossAssetTable）：按域分组，完整披露推导过程 */
function CrossAssetTable({ verdict, missing }: { verdict: Verdict; missing: string[] }) {
  const { c } = useAppTheme()
  const t = useT()
  const wSum = verdict.indicators.reduce((a, i) => a + i.weight, 0)
  const domains = [...new Set(verdict.indicators.map((i) => i.domain))]

  return (
    <Card>
      <Kicker
        title={t("cat.title")}
        desc={t("cat.desc")}
        right={<Pill tone="muted">{t("cat.badge", { n: verdict.indicators.length, domains: joinList(domains.map((d) => t(DOMAIN_KEY[d]))) })}</Pill>}
      />
      <View style={{ gap: 2 }}>
        {domains.map((domain) => (
          <View key={domain} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8 }}>
              <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground") }}>
                {t(DOMAIN_KEY[domain])}
              </Txt>
              <View style={{ height: StyleSheet.hairlineWidth, flex: 1, backgroundColor: c("border"), opacity: 0.6 }} />
            </View>
            {verdict.indicators.filter((i) => i.domain === domain).map((ind) => (
              <IndicatorRow key={ind.key} ind={ind} wSum={wSum} />
            ))}
          </View>
        ))}
        {missing.length > 0 && (
          <Txt maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground"), paddingTop: 8 }}>
            {t("cat.missing", { list: joinList(missing) })}
          </Txt>
        )}
      </View>
    </Card>
  )
}

/* ------------------------------ 体量参照 ------------------------------ */

/** 体量参照（web MarketAnchorsCard）：加密总市值（实时）vs 黄金/美股/M2 慢变锚 */
function MarketAnchorsCard({ cryptoMcap }: { cryptoMcap: number }) {
  const { c } = useAppTheme()
  const t = useT()
  const rows = MARKET_ANCHORS.map((a) => {
    const live = a.key === "crypto"
    return { ...a, live, value: live ? cryptoMcap : a.value }
  })
  const hasLive = cryptoMcap > 0
  const max = Math.max(...rows.map((r) => r.value))
  const gold = rows.find((r) => r.key === "gold")
  const m2 = rows.find((r) => r.key === "m2")

  return (
    <Card>
      <Kicker title={t("ma.title")} en="MARKET ANCHORS" desc={t("ma.desc")} />
      {!hasLive && (
        <Txt
          maxScale={1.3}
          style={{
            fontSize: 11,
            lineHeight: 16,
            color: c("muted-foreground"),
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: c("border"),
            borderRadius: 6,
            paddingHorizontal: 12,
            paddingVertical: 8,
            textAlign: "center",
          }}
        >
          {t("ma.unavailable")}
        </Txt>
      )}
      <View style={{ gap: 12 }}>
        {rows.map((r, i) => (
          <View key={r.key} style={{ gap: 4 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <Row style={{ gap: 6 }}>
                <Txt variant="caption" maxScale={1.2} style={{ color: r.live ? c("primary") : c("foreground"), fontWeight: r.live ? "600" : "500" }}>
                  {t(r.nameKey)}
                </Txt>
                {r.live && (
                  <Row style={{ gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c("primary") }} />
                    <Txt mono maxScale={1.2} style={{ fontSize: 10, color: c("primary"), opacity: 0.7 }}>
                      LIVE
                    </Txt>
                  </Row>
                )}
              </Row>
              <Txt mono variant="caption" maxScale={1.2} style={{ color: r.live ? c("foreground") : c("muted-foreground") }}>
                {formatUsdCompact(r.value)}
              </Txt>
            </Row>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c("secondary"), overflow: "hidden" }}>
              <GrowIn delayMs={i * 40} style={{ height: 8, borderRadius: 4, width: `${Math.max((r.value / max) * 100, 1.2)}%`, backgroundColor: c("primary"), opacity: r.live ? 1 : 0.25 }} />
            </View>
            {!r.live && hasLive && (
              <Txt mono maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground"), textAlign: "right" }}>
                {t("ma.ratio", { name: t(r.nameKey), pct: ((cryptoMcap / r.value) * 100).toFixed(1) })}
              </Txt>
            )}
          </View>
        ))}
        {hasLive && gold && m2 && (
          <Txt maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
            {t("ma.summary", { gold: ((cryptoMcap / gold.value) * 100).toFixed(1), m2: ((cryptoMcap / m2.value) * 100).toFixed(1) })}
          </Txt>
        )}
      </View>
    </Card>
  )
}

/* ------------------------------ 判断历史 ------------------------------ */

const GRADE_META: Record<Exclude<Grade, "pending">, { label: MessageKey; icon: string; tone: "up" | "down" | "muted" }> = {
  correct: { label: "grade.correct", icon: "✓", tone: "up" },
  wrong: { label: "grade.wrong", icon: "✗", tone: "down" },
  partial: { label: "grade.partial", icon: "—", tone: "muted" },
}

/** 判断历史（web VerdictHistoryCard）：近 14 条，次日总市值实际走向复盘打分 */
function VerdictHistoryCard({ history }: { history: VerdictRecord[] }) {
  const { c } = useAppTheme()
  const t = useT()
  const stats = gradeStats(history)
  const rows = [...history].reverse().slice(0, 14)
  const desc =
    stats.hitRate != null
      ? `${t("vh.desc")} · ${t("vh.hit")} ${(stats.hitRate * 100).toFixed(0)}% (${stats.correct}✓ / ${stats.wrong}✗ / ${stats.partial}◐)`
      : t("vh.desc")

  return (
    <Card>
      <Kicker title={t("vh.title")} en="VERDICT HISTORY" desc={desc} />
      {rows.length === 0 ? (
        <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center", paddingVertical: 28 }}>
          {t("vh.empty")}
        </Txt>
      ) : (
        <View>
          {rows.map((r, i) => {
            const next = i > 0 ? rows[i - 1] : null
            const grade = gradeRecord(r, next)
            const meta = grade === "pending" ? null : GRADE_META[grade]
            const chgColor = r.mcapChg24h > 0 ? c("up") : r.mcapChg24h < 0 ? c("down") : c("muted-foreground")
            return (
              <Row
                key={r.date}
                style={{
                  gap: 8,
                  flexWrap: "wrap",
                  paddingVertical: 8,
                  borderTopWidth: i ? StyleSheet.hairlineWidth : 0,
                  borderTopColor: c("border"),
                }}
              >
                <Txt mono variant="caption" maxScale={1.2} style={{ width: 48, color: c("muted-foreground") }}>
                  {r.date.slice(5)}
                </Txt>
                <StanceBadge stance={r.stance} />
                <Txt
                  mono
                  variant="caption"
                  maxScale={1.2}
                  style={{ marginLeft: "auto", color: chgColor }}
                >
                  {`${r.mcapChg24h > 0 ? "+" : ""}${r.mcapChg24h.toFixed(1)}%`}
                </Txt>
                {meta ? (
                  <Pill tone={meta.tone}>{`${meta.icon} ${t(meta.label)}`}</Pill>
                ) : (
                  <Pill tone="muted">{i === 0 ? t("vh.pending") : "—"}</Pill>
                )}
              </Row>
            )
          })}
        </View>
      )}
    </Card>
  )
}

/* ------------------------------ 骨架 ------------------------------ */

function VerdictSkeleton() {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 8 }}>
        <SkBlock w={120} h={10} />
        <SkBlock w={180} h={22} r={6} />
        <SkBlock w="80%" h={12} />
      </View>
      <Card>
        <SkHead />
        <SkBlock w="62%" h={110} r={10} style={{ alignSelf: "center", marginVertical: 10 }} />
        <SkBlock w="68%" h={6} r={3} />
        {[0, 1, 2].map((i) => (
          <Row key={i} style={{ justifyContent: "space-between" }}>
            <SkBlock w={112} h={10} />
            <SkBlock w={56} h={12} r={3} />
          </Row>
        ))}
      </Card>
      <Card>
        <SkHead />
        <View style={{ flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 }}>
          <SkBlock w="44%" h={12} />
          <SkBlock w="32%" h={12} />
          <SkBlock w="24%" h={12} />
        </View>
        {[0, 1, 2, 3].map((i) => (
          <Row key={i} style={{ justifyContent: "space-between" }}>
            <SkBlock w={80} h={10} />
            <SkBlock w={40} h={10} />
          </Row>
        ))}
      </Card>
      <Card>
        <SkHead />
        {[0, 1, 2, 3, 4].map((i) => (
          <Row key={i} style={{ gap: 10 }}>
            <SkBlock w={6} h={6} r={3} />
            <SkBlock w={`${70 - i * 8}%`} h={10} />
          </Row>
        ))}
      </Card>
      <Card>
        <SkHead />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={{ gap: 6 }}>
            <SkBlock w="55%" h={12} />
            <SkBlock w="100%" h={6} r={3} />
          </View>
        ))}
      </Card>
    </View>
  )
}

/* ------------------------------ 图例触控（≥44pt） ------------------------------ */

/** 分布图例：点按切换阵营高亮（selection 触感），命中区补足 44pt 高 */
function TapLegend({
  dim,
  onPress,
  children,
}: {
  dim: boolean
  onPress: () => void
  children: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={4}
      onPress={() => {
        hapticSelection()
        onPress()
      }}
      style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", opacity: dim ? 0.5 : pressed ? 0.6 : 1 }]}
    >
      {children}
    </Pressable>
  )
}

/* ------------------------------ 页面 ------------------------------ */

export function VerdictPane() {
  const t = useT()
  const { c } = useAppTheme()
  const { snapshot, error, loading, refreshing: mktRefreshing, refresh } = useMarket()

  const [cross, setCross] = useState<CrossAssetData | null>(null)
  const [crossError, setCrossError] = useState(false)
  const [crossBusy, setCrossBusy] = useState(false)
  // 惰性初始化：挂载时读一次 storageBus，无需 effect + setState
  const [history, setHistory] = useState<VerdictRecord[]>(loadHistory)
  // 请求代际：连点刷新时只采纳最后一次请求的结果，避免慢响应覆盖新数据
  const loadGenRef = useRef(0)

  const loadCross = useCallback(
    (force = false): Promise<void> => {
      const gen = ++loadGenRef.current
      setCrossError(false)
      return fetchCrossAsset({
        force,
        // 缓存过期路径：旧值先行渲染，后台刷新完成后送达新值（同样受代际保护）
        onRefresh: (d) => {
          if (gen === loadGenRef.current) setCross(d)
        },
      })
        .then((d) => {
          if (gen === loadGenRef.current) setCross(d)
        })
        .catch(() => {
          if (gen === loadGenRef.current) setCrossError(true)
        })
    },
    [],
  )

  useEffect(() => {
    void loadCross()
  }, [loadCross])

  const verdict = useMemo(() => {
    if (!snapshot || !cross) return null
    return computeVerdict({ global: snapshot.global, fng: snapshot.fng[0] ?? null, coins: snapshot.coins, cross })
  }, [snapshot, cross])

  // 每次重算后落库今日判断（按日期幂等；upsertToday 内部已有漂移阈值保护）
  useEffect(() => {
    if (verdict) setHistory(upsertToday(verdict))
  }, [verdict])

  // 缺失源提示：memo 里存 key，渲染期再取词（语言切换后随重渲染刷新文案）
  const missingKeys = useMemo(() => {
    if (!cross) return []
    const m: MessageKey[] = []
    if (!cross.stablecoin) m.push("vp.missing.stablecoin")
    if (!cross.derivatives) m.push("vp.missing.derivatives")
    if (!cross.breadth) m.push("vp.missing.breadth")
    return m
  }, [cross])

  const onRefresh = useCallback(() => {
    refresh()
    setCrossBusy(true)
    void loadCross(true).finally(() => setCrossBusy(false))
  }, [refresh, loadCross])

  if (loading && !snapshot) {
    return (
      <PaneShell refreshing={false} onRefresh={onRefresh}>
        <VerdictSkeleton />
      </PaneShell>
    )
  }

  // 快照彻底失败（主备源全挂）：显式报错 + 重试，避免落进「跨资产加载中」永久转圈
  if (error && !snapshot) {
    return (
      <PaneShell refreshing={mktRefreshing} onRefresh={onRefresh}>
        <View style={{ alignItems: "center", gap: 16, paddingVertical: 64 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              borderWidth: 1,
              borderColor: c("border"),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Txt style={{ fontSize: 24, color: c("muted-foreground") }}>⚠︎</Txt>
          </View>
          <View style={{ alignItems: "center", gap: 4 }}>
            <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600" }}>
              {t("common.loadFail")}
            </Txt>
            <Txt mono variant="caption" maxScale={1.2} style={{ color: c("muted-foreground"), textAlign: "center" }}>
              {error}
            </Txt>
          </View>
          <Tap onPress={onRefresh} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), borderRadius: 8, paddingHorizontal: 16 }}>
            {`↻ ${t("common.retry")}`}
          </Tap>
        </View>
      </PaneShell>
    )
  }

  return (
    <PaneShell refreshing={mktRefreshing || crossBusy} onRefresh={onRefresh}>
      <PageHead en="VERDICT" title={t("page.verdict.title")} desc={t("page.verdict.desc")}>
        {crossError && (
          <Txt mono variant="caption" maxScale={1.2} style={{ color: c("down") }}>
            {`⚠ ${t("vp.crossError")}`}
          </Txt>
        )}
        <Tap onPress={onRefresh} style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), borderRadius: 8, paddingHorizontal: 14 }}>
          {`↻ ${t("common.refresh")}`}
        </Tap>
      </PageHead>

      {verdict && snapshot ? (
        <>
          <VerdictCardView verdict={verdict} />
          <StanceMixCard verdict={verdict} />
          <WatchCard items={verdict.watch} />
          <CrossAssetTable verdict={verdict} missing={missingKeys.map((k) => t(k))} />
          <MarketAnchorsCard cryptoMcap={cryptoMcapOf(snapshot.global, snapshot.coins)} />
          <VerdictHistoryCard history={history} />
          <View style={{ gap: 2, paddingBottom: 8 }}>
            <Txt maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
              {t("vp.sources1")}
            </Txt>
            <Txt maxScale={1.3} style={{ fontSize: 11, lineHeight: 16, color: c("muted-foreground") }}>
              {t("vp.sources2")}
            </Txt>
          </View>
        </>
      ) : (
        /* 快照已就绪、跨资产数据仍在拉取的过渡态：轻量居中指示，避免全页骨架二次闪烁 */
        <Card style={{ alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 48 }}>
          <LoadingDots />
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center" }}>
            {t("vp.loadingCross")}
          </Txt>
        </Card>
      )}
    </PaneShell>
  )
}
