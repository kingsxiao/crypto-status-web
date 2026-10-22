/**
 * 行情与币种列表 — web MarketsPage.tsx 的 RN 移植（业务逻辑逐段对齐）：
 *  - 全量币种表（稳定币剔除/自选范围筛选 + 名称/代码搜索）
 *  - 九键排序（缺值恒排末尾；涨跌幅/市值默认降序、排名升序）
 *  - 排序输入快照：仅切换排序时捕获实时价，秒级推送不再驱动行序颠簸
 *  - 实时价单元格闪色（LivePrice）+ 近零涨跌降级 + 7 日火花线（涨跌功能色）
 *  - 自选星标（storageBus 持久化）· 预警铃铛直达 · 无交易对标「稳定币」
 *  - 市场广度（24H 涨跌家数/平均，剔稳定币）· 下拉刷新 · 骨架/空态
 */

import { memo, useMemo, useState } from "react"
import { Link } from "expo-router"
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { STABLECOIN_IDS, type Coin } from "@repo/data/api"
import { formatPrice } from "@repo/core/format"
import { TRADE_SYMBOLS, type LiveTicker } from "@repo/data/realtime-source"
import { useFavorites } from "@repo/react/useFavorites"
import { useLive, useMarket } from "@repo/react/MarketData"

import { AssetCell, LivePrice, Pct } from "../../src/components/price-cells"
import { Sparkline } from "../../src/components/Sparkline"
import { TableSkeleton } from "../../src/components/skeletons"
import { Segmented } from "../../src/components/Segmented"
import { Card, Row, Txt } from "../../src/components/ui"
import { hapticImpact, hapticSelection } from "../../src/lib/haptics"
import { useAppTheme } from "../../src/lib/theme"

type SortKey =
  | "rank"
  | "price"
  | "chg1h"
  | "chg24h"
  | "chg7d"
  | "chg30d"
  | "marketCap"
  | "volume"
  | "ath"

type SortDir = "asc" | "desc"

type Scope = "all" | "tradeable" | "favorites"

const SORT_LABELS: Record<SortKey, string> = {
  rank: "#",
  price: "PRICE",
  chg1h: "1H",
  chg24h: "24H",
  chg7d: "7D",
  chg30d: "30D",
  marketCap: "MCAP",
  volume: "VOL",
  ath: "ATH",
}

/** 排序取值：缺失（兜底源无 1h/7d/30d/ATH）返回 null，由比较器统一压到末尾 */
function coinValue(cd: Coin, key: SortKey, livePrice: number | null): number | null {
  switch (key) {
    case "rank":
      return cd.market_cap_rank
    case "price":
      return livePrice ?? cd.current_price
    case "chg1h":
      return cd.price_change_percentage_1h_in_currency ?? null
    case "chg24h":
      return cd.price_change_percentage_24h_in_currency ?? null
    case "chg7d":
      return cd.price_change_percentage_7d_in_currency ?? null
    case "chg30d":
      return cd.price_change_percentage_30d_in_currency ?? null
    case "marketCap":
      return cd.market_cap
    case "volume":
      return cd.total_volume
    case "ath":
      return cd.ath_change_percentage ?? null
  }
}

/* ------------------------------ 行组件 ------------------------------ */

const CoinRow = memo(function CoinRow({
  coin,
  ticker,
  fav,
  onToggleFav,
}: {
  coin: Coin
  ticker?: LiveTicker
  fav: boolean
  onToggleFav: (id: string) => void
}) {
  const { c } = useAppTheme()
  const hasDetail = !!TRADE_SYMBOLS[coin.id]
  const price = ticker?.price ?? coin.current_price
  const chg24 = ticker?.changePct ?? coin.price_change_percentage_24h_in_currency
  const spark = coin.sparkline_in_7d?.price ?? []
  const chg7 = coin.price_change_percentage_7d_in_currency ?? 0

  const content = (
    <View style={{ paddingVertical: 8, gap: 2 }}>
      <Row style={{ gap: 6 }}>
        {/* 自选星标（保存类操作 = light impact） */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={fav ? t("markets.removeFav") : t("markets.addFav")}
          onPress={() => {
            hapticImpact("light")
            onToggleFav(coin.id)
          }}
          style={{ width: 36, minHeight: 44, justifyContent: "center", alignItems: "center" }}
        >
          <Text style={{ color: fav ? c("primary") : c("muted-foreground"), opacity: fav ? 1 : 0.35, fontSize: 15 }}>
            {fav ? "★" : "☆"}
          </Text>
        </Pressable>
        {/* space-between：价格栈右缘对齐成列（web text-right 列），不随币名宽度漂移 */}
        <Row style={{ flex: 1, gap: 10, justifyContent: "space-between" }}>
          <AssetCell coin={coin} />
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            {ticker ? <LivePrice price={price} /> : (
              <Txt mono maxScale={1.3} style={{ fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
                ${formatPrice(price)}
              </Txt>
            )}
            <Pct v={chg24} />
          </View>
        </Row>
        {hasDetail ? (
          <Text style={{ color: c("muted-foreground"), opacity: 0.7, fontSize: 13, marginLeft: 2 }}>›</Text>
        ) : (
          <Txt mono maxScale={1.3} style={{ fontSize: 10, color: c("muted-foreground"), marginLeft: 2 }}>
            {t("common.stablecoin")}
          </Txt>
        )}
      </Row>
      <Row style={{ justifyContent: "flex-end", gap: 10, paddingRight: 4 }}>
        <Pct v={coin.price_change_percentage_1h_in_currency} />
        <Pct v={coin.price_change_percentage_7d_in_currency} />
        {spark.length > 1 ? <Sparkline data={spark} color={chg7 >= 0 ? c("up") : c("down")} width={56} height={20} strokeWidth={1.2} /> : null}
        {hasDetail ? (
          <Link href={`/alerts?coin=${coin.id}`} asChild>
            <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={t("markets.bellSr", { name: coin.name })} style={{ minHeight: 32, minWidth: 32, justifyContent: "center", alignItems: "center" }}>
              {({ pressed }) => (
                <Text style={{ color: c("muted-foreground"), opacity: pressed ? 1 : 0.4, fontSize: 13 }}>⌁</Text>
              )}
            </Pressable>
          </Link>
        ) : null}
      </Row>
    </View>
  )

  /* 无交易对（稳定币）：不可进详情，降透明度；有交易对：整行点按进详情 */
  if (!hasDetail)
    return <View style={{ opacity: 0.8 }}>{content}</View>
  return (
    <Link href={`/coin/${coin.id}`} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={coin.name} style={({ pressed }) => ({ backgroundColor: pressed ? c("secondary") : "transparent", borderRadius: 6 })}>
        {content}
      </Pressable>
    </Link>
  )
})

/* ------------------------------ 主页面 ------------------------------ */

export default function Markets() {
  useT()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { snapshot, loading, refreshing, refresh } = useMarket()
  const tickers = useLive()
  const { has, toggle } = useFavorites()

  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [sortKey, setSortKey] = useState<SortKey>("rank")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  /** 排序输入快照：只捕获切换排序列/方向那一刻的 tickers（行序不随秒级推送颠簸） */
  const [sortTickers, setSortTickers] = useState(tickers)

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = coins
    if (scope === "tradeable") list = list.filter((cd) => !STABLECOIN_IDS.has(cd.id))
    if (scope === "favorites") list = list.filter((cd) => has(cd.id))
    if (q) list = list.filter((cd) => cd.name.toLowerCase().includes(q) || cd.symbol.toLowerCase().includes(q))
    const sorted = [...list].sort((a, b) => {
      const va = coinValue(a, sortKey, sortTickers[a.id]?.price ?? null)
      const vb = coinValue(b, sortKey, sortTickers[b.id]?.price ?? null)
      // 缺失值不与真实 0 混排：无论升降序恒排末尾
      if (va == null || vb == null) {
        if (va == null && vb == null) return 0
        return va == null ? 1 : -1
      }
      const d = va - vb
      return sortDir === "asc" ? d : -d
    })
    return sorted
  }, [coins, query, scope, sortKey, sortDir, sortTickers, has])

  const onSort = (k: SortKey) => {
    hapticSelection()
    setSortTickers(tickers)
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(k)
      // 涨跌幅/市值默认从高到低，排名从低到高（与 web 同规则）
      setSortDir(k === "rank" ? "asc" : "desc")
    }
  }

  /* 市场广度：24h 涨跌家数（剔稳定币） */
  const breadth = useMemo(() => {
    const pcts = coins
      .filter((cd) => !STABLECOIN_IDS.has(cd.id))
      .map((cd) => tickers[cd.id]?.changePct ?? cd.price_change_percentage_24h_in_currency ?? 0)
    if (!pcts.length) return null
    const up = pcts.filter((v) => v > 0).length
    const avg = pcts.reduce((s, v) => s + v, 0) / pcts.length
    return { up, down: pcts.length - up, avg }
  }, [coins, tickers])

  const empty = coins.length === 0

  return (
    <View style={{ flex: 1, backgroundColor: c("background") }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 24, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c("muted-foreground")} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* 页头：标题 + 市场广度 */}
        <View style={{ gap: 4 }}>
          <Txt variant="display" maxScale={1.3} style={{ fontWeight: "700" }}>
            {t("nav.markets")}
          </Txt>
          {breadth ? (
            <Row style={{ flexWrap: "wrap", gap: 4 }}>
              <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>24H {t("markets.up")}</Txt>
              <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("up") }}>{breadth.up}</Txt>
              <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>· {t("markets.down")}</Txt>
              <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("down") }}>{breadth.down}</Txt>
              <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>· {t("markets.avg")}</Txt>
              <Txt mono maxScale={1.3} style={{ fontSize: 12, color: breadth.avg >= 0 ? c("up") : c("down") }}>
                {breadth.avg >= 0 ? "+" : ""}
                {breadth.avg.toFixed(2)}%
              </Txt>
            </Row>
          ) : (
            <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>{t("page.markets.desc")}</Txt>
          )}
        </View>

        {/* 搜索 + 范围筛选 */}
        <View style={{ borderColor: c("border"), borderWidth: 1, borderRadius: 8, height: 40, flexDirection: "row", alignItems: "center", paddingHorizontal: 10, gap: 8 }}>
          <Text style={{ color: c("muted-foreground"), fontSize: 14 }}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("markets.search")}
            placeholderTextColor={c("muted-foreground")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, color: c("foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 13, paddingVertical: 8 }}
          />
          {query ? (
            <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="clear" onPress={() => setQuery("")}>
              {({ pressed }) => <Text style={{ color: c("muted-foreground"), opacity: pressed ? 1 : 0.7, fontSize: 13 }}>✕</Text>}
            </Pressable>
          ) : null}
        </View>

        <Segmented<Scope>
          value={scope}
          onChange={setScope}
          items={[
            { value: "all", label: t("common.scope.all") },
            { value: "tradeable", label: t("common.scope.tradeable") },
            { value: "favorites", label: t("common.scope.favorites") },
          ]}
        />

        {/* 排序键（横滚九键；同键点按切换升降） */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => {
            const active = sortKey === k
            return (
              <Pressable
                key={k}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={SORT_LABELS[k]}
                accessibilityState={{ selected: active }}
                onPress={() => onSort(k)}
                style={({ pressed }) => [
                  s.sortChip,
                  active ? { backgroundColor: c("secondary"), borderColor: c("foreground") } : { borderColor: c("border") },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text
                  style={{
                    color: active ? c("foreground") : c("muted-foreground"),
                    fontSize: 10,
                    fontFamily: "JetBrainsMono_500Medium",
                    letterSpacing: 1,
                  }}
                >
                  {SORT_LABELS[k]}
                </Text>
                <Text style={{ color: active ? c("foreground") : c("muted-foreground"), fontSize: 9, opacity: active ? 1 : 0.35 }}>
                  {active ? (sortDir === "asc" ? "▲" : "▼") : "▲"}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* 行情表 */}
        {loading && !snapshot ? (
          <Card style={{ padding: 12 }}>
            <TableSkeleton rows={10} />
          </Card>
        ) : (
          <Card style={{ padding: 0 }}>
            {rows.length === 0 ? (
              <View style={{ height: 160, justifyContent: "center", alignItems: "center", gap: 8, paddingHorizontal: 16 }}>
                <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600", textAlign: "center" }}>
                  {empty
                    ? t("markets.empty.unavailable")
                    : scope === "favorites"
                      ? t("markets.empty.fav")
                      : t("markets.empty.noMatch")}
                </Txt>
                <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground"), textAlign: "center" }}>
                  {empty
                    ? t("markets.empty.unavailableDesc")
                    : scope === "favorites"
                      ? t("markets.empty.favDesc")
                      : t("markets.empty.noMatchDesc")}
                </Txt>
              </View>
            ) : (
              <View style={{ paddingHorizontal: 10 }}>
                {rows.map((cd, i) => (
                  <View key={cd.id}>
                    {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c("border") }} /> : null}
                    <CoinRow coin={cd} ticker={tickers[cd.id]} fav={has(cd.id)} onToggleFav={toggle} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  sortChip: {
    minHeight: 32,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
})
