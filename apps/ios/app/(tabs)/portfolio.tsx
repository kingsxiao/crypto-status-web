/**
 * 持仓管理（页面组 key=portfolio）— apps/web/src/pages/PortfolioPage.tsx 的 iOS 移植。
 *
 * 功能对齐 web：
 *  - KPI 条（组合总值 / 24H 盈亏 / 成本盈亏 / 最大持仓，实时价优先 @repo/react/MarketData）
 *  - 持仓明细（按市值降序，行点按进入编辑）
 *  - 新增/编辑：底部 pageSheet（币种 chips + 数量/成本 + 实时估值 + 双重校验 + 覆盖提示）
 *  - 两步删除 / 两步清空（@repo/react/useTwoStepConfirm，独立实例同 web）
 *  - 配置环图（react-native-svg 自绘：分段按压联动环心读数、高亮段加粗、其余降不透明度）
 *  - CSV 导入（DocumentPicker + @repo/core/csv parseHoldingsCsv）/ 导出（临时文件 + 系统分享面板）
 *  - 加载骨架 / 空态 / 错误态 / 下拉刷新（useMarket().refresh）
 *
 * 平台纪律：色值一律 useAppTheme().c()；环图分段色为 web portfolio/colors.ts 的
 * oklch 原串经 src/lib/colors rnColor 程序化转换（首段随主题 primary），无第二份手工色值。
 * 数字/价格 JetBrains Mono；触感统一走 src/lib/haptics 封装；Txt 档位 + maxScale
 * 封顶 Dynamic Type（信息密集区 ≤1.3）；触控目标 ≥44pt。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type DimensionValue,
  type ViewStyle,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import Svg, { Circle } from "react-native-svg"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"
import * as Sharing from "expo-sharing"

import { parseHoldingsCsv } from "@repo/core/csv"
import { t } from "@repo/core/i18n"
import { formatAmount, formatPrice, formatUsdCompact, parseNum } from "@repo/core/format"
import { computeStats, type Holding, type PriceRef } from "@repo/core/portfolio"
import type { Coin } from "@repo/data/api"
import { useLive, useMarket } from "@repo/react/MarketData"
import { useT } from "@repo/react/i18n"
import { usePortfolio } from "@repo/react/usePortfolio"
import { useTwoStepConfirm } from "@repo/react/useTwoStepConfirm"
import { radius } from "@repo/ui-tokens/theme"

import { Card, CardTitle, Txt } from "../../src/components/ui"
import { rnColor } from "../../src/lib/colors"
import { hapticImpact, hapticSelection } from "../../src/lib/haptics"
import { useAppTheme } from "../../src/lib/theme"
import { nt } from "../../src/lib/native-copy"

/* ------------------------------ 常量与视图模型 ------------------------------ */

/** Inter / JetBrains Mono 字重栈（app/_layout expo-font 打包；未载入自动回退系统栈） */
const F = {
  reg: "Inter_400Regular",
  med: "Inter_500Medium",
  semi: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoMed: "JetBrainsMono_500Medium",
} as const

/** 配置环图分段色：web apps/web/src/pages/portfolio/colors.ts 的 oklch 原串
 *  （首段用主题 primary，见 allocPalette；此处禁止复制成 hex，统一 rnColor 转换） */
const ALLOC_EXTRA_OKLCH = [
  "oklch(0.72 0.13 250)",
  "oklch(0.75 0.13 160)",
  "oklch(0.78 0.12 80)",
  "oklch(0.70 0.15 25)",
  "oklch(0.72 0.12 310)",
  "oklch(0.75 0.10 200)",
  "oklch(0.74 0.12 130)",
  "oklch(0.70 0.10 350)",
  "oklch(0.72 0.10 60)",
] as const

/** 与 web portfolio/csv.ts 相同的表结构（导出）；解析在 @repo/core/csv */
const CSV_HEADERS = ["id", "symbol", "amount", "cost"] as const
const CSV_MIME = ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text"]

const DONUT_SIZE = 184

type FormState =
  | { mode: "closed" }
  | { mode: "add"; coinId: string; amount: string; cost: string }
  | { mode: "edit"; id: string; coinId: string; amount: string; cost: string }

interface RowVM {
  holding: Holding
  coin: Coin | undefined
  price: number | null
  value: number | null
  chg24h: number | null
  pnl: number | null
  pnlPct: number | null
}

interface AllocEntry {
  key: string
  symbol: string
  name: string
  value: number
  pct: number
  color: string
}

interface DonutSlice {
  key: string
  pct: number
  color: string
}

type Tone = "default" | "up" | "down"

interface KpiItem {
  label: string
  value: string
  sub: string
  tone: Tone
  subTone: Tone
}

/** 盈亏金额格式化：接近零时避免 formatPrice 的 6 位小数展开（对齐 web） */
function formatPnlAbs(v: number): string {
  return Math.abs(v) < 0.01 ? "0.00" : formatPrice(Math.abs(v))
}

function fmtSignedUsd(v: number): string {
  return `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

/* ------------------------------ 页面 ------------------------------ */

/** 持仓管理：读-改-写全部经 storageBus（HydrationGate 之后零覆写风险） */
export default function Portfolio() {
  useT() // 订阅语言切换（zh/en 双语，词典键与 web 同源）
  const { snapshot, loading, refreshing, error, refresh } = useMarket()
  const tickers = useLive()
  const { holdings, upsert, remove, clear } = usePortfolio()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()

  const [form, setForm] = useState<FormState>({ mode: "closed" })
  /** 环图联动：按压的分段 key（null = 显示组合整体，对应 web 的 hover 态） */
  const [focusKey, setFocusKey] = useState<string | null>(null)
  /** 页内浮层提示（web pushToast 的 iOS 等价物；5s 自动消退同 ttlMs） */
  const [notice, setNotice] = useState<{ text: string; tone: "ok" | "err" } | null>(null)
  // 两个二次确认各自独立实例（共用会把另一方的自动复位 timer 顶掉，web 同注释）
  const deleteConfirm = useTwoStepConfirm<string>()
  const clearConfirm = useTwoStepConfirm<true>()

  useEffect(() => {
    if (!notice) return
    const id = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(id)
  }, [notice])

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])

  /** coinId → 价格引用（实时优先，回退快照；口径同 web，不按可交易表过滤） */
  const prices = useMemo(() => {
    const map: Record<string, PriceRef> = {}
    for (const coin of coins) {
      const tk = tickers[coin.id]
      map[coin.id] = {
        price: tk?.price ?? coin.current_price,
        chg24h: tk?.changePct ?? coin.price_change_percentage_24h_in_currency ?? null,
      }
    }
    return map
  }, [coins, tickers])

  const stats = useMemo(() => computeStats(holdings, prices), [holdings, prices])

  /** 行视图：有价格在前、按市值降序；无价格行垫底 */
  const rows = useMemo<RowVM[]>(() => {
    const list = holdings.map((h): RowVM => {
      const coin = coins.find((x) => x.id === h.id)
      const ref = prices[h.id]
      const price = ref?.price ?? null
      const value = price != null ? h.amount * price : null
      const pnl = value != null && h.cost != null ? value - h.cost : null
      const pnlPct = pnl != null && h.cost ? (pnl / h.cost) * 100 : null
      return { holding: h, coin, price, value, chg24h: ref?.chg24h ?? null, pnl, pnlPct }
    })
    return list.sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
  }, [holdings, coins, prices])

  /** 环图分段色板：首段随主题 primary，其余为 web 固定明度色相（rnColor 转换） */
  const allocPalette = useMemo(
    () => [c("primary"), ...ALLOC_EXTRA_OKLCH.map((s) => rnColor(s))],
    [c]
  )

  const alloc = useMemo<AllocEntry[]>(() => {
    const total = rows.reduce((sum, r) => sum + (r.value ?? 0), 0)
    if (total <= 0) return []
    return rows
      .filter((r) => r.value != null && r.value > 0)
      .map((r, i) => ({
        key: r.holding.id,
        symbol: (r.coin?.symbol ?? r.holding.id).toUpperCase(),
        name: r.coin?.name ?? r.holding.id,
        value: r.value ?? 0,
        pct: ((r.value ?? 0) / total) * 100,
        color: allocPalette[i % allocPalette.length],
      }))
  }, [rows, allocPalette])

  /** 稳定引用：秒级行情推送不触发环图重算（memo 化，web 同策略） */
  const slices = useMemo(() => alloc.map((a) => ({ key: a.key, pct: a.pct, color: a.color })), [alloc])

  const top = alloc[0]
  /** 联动读数：图例/分段指向的资产（undefined = 组合整体） */
  const focusAlloc = focusKey != null ? alloc.find((a) => a.key === focusKey) : undefined

  const onToggleFocus = useCallback((k: string) => {
    hapticSelection()
    setFocusKey((cur) => (cur === k ? null : k))
  }, [])

  const openAdd = (coinId?: string) => {
    hapticSelection()
    setForm({ mode: "add", coinId: coinId ?? coins[0]?.id ?? "bitcoin", amount: "", cost: "" })
  }

  const openEdit = (h: Holding) => {
    hapticSelection()
    setForm({
      mode: "edit",
      id: h.id,
      coinId: h.id,
      amount: String(h.amount),
      cost: h.cost != null ? String(h.cost) : "",
    })
  }

  const submitForm = () => {
    if (form.mode === "closed") return
    const amount = parseNum(form.amount)
    const cost = form.cost.trim() === "" ? null : parseNum(form.cost)
    upsert({ id: form.coinId, amount, cost: cost ?? null, addedAt: Date.now() })
    hapticImpact("light") // 保存/新增 = light impact
    setForm({ mode: "closed" })
  }

  const onDeleteRow = (h: Holding) => {
    if (deleteConfirm.confirm(h.id)) {
      remove(h.id)
      hapticImpact("medium")
    } else {
      hapticSelection()
    }
  }

  const onClearAll = () => {
    if (clearConfirm.confirm(true)) {
      clear()
      setForm({ mode: "closed" })
      hapticImpact("medium")
    } else {
      hapticSelection()
    }
  }

  const onExportCsv = async () => {
    hapticSelection()
    try {
      const symbolOf = (id: string) => (coins.find((x) => x.id === id)?.symbol ?? id).toUpperCase()
      const lines = [
        CSV_HEADERS.join(","),
        ...holdings.map((h) => [h.id, symbolOf(h.id), String(h.amount), h.cost != null ? String(h.cost) : ""].join(",")),
      ]
      const name = `crypto-status-portfolio-${new Date().toISOString().slice(0, 10)}.csv`
      const file = new File(Paths.cache, name)
      if (file.exists) file.delete()
      file.write(lines.join("\n"), { encoding: "utf8" })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: "CRYPTO STATUS portfolio" })
      }
      // 分享面板不可用的环境静默跳过（同 web blob 下载的尽力语义）
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), tone: "err" })
    }
  }

  const onImportCsv = async () => {
    hapticSelection()
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: CSV_MIME, copyToCacheDirectory: true })
      if (r.canceled || !r.assets?.[0]) return
      const text = await (await fetch(r.assets[0].uri)).text()
      const { rows: parsed } = parseHoldingsCsv(text)
      if (parsed.length === 0) {
        // 表头缺列或全部数据行非法：库未被动过
        setNotice({ text: t("pf.csv.importFail"), tone: "err" })
        hapticImpact("medium")
        return
      }
      for (const row of parsed) upsert({ id: row.id, amount: row.amount, cost: row.cost, addedAt: row.addedAt })
      setNotice({ text: t("pf.csv.importOk", { n: parsed.length }), tone: "ok" })
      hapticImpact("light")
    } catch {
      setNotice({ text: t("pf.csv.importFail"), tone: "err" })
      hapticImpact("medium")
    }
  }

  /* ------------------------------ 派生展示 ------------------------------ */

  const kpis: KpiItem[] = [
    {
      label: t("pf.kpi.total"),
      value: `$${stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
      sub: t("pf.kpi.totalSub", { n: holdings.length }),
      tone: "default",
      subTone: "default",
    },
    {
      label: "24H",
      value: stats.pnl24h != null ? fmtSignedUsd(stats.pnl24h) : "—",
      tone: stats.pnl24h != null ? (stats.pnl24h >= 0 ? "up" : "down") : "default",
      sub: stats.pnl24hPct != null ? `${stats.pnl24hPct >= 0 ? "+" : ""}${stats.pnl24hPct.toFixed(2)}%` : t("pf.kpi.pnl24hNone"),
      subTone: stats.pnl24hPct != null ? (stats.pnl24hPct >= 0 ? "up" : "down") : "default",
    },
    {
      label: t("pf.kpi.costPnl"),
      value: stats.costPnl != null ? fmtSignedUsd(stats.costPnl) : "—",
      tone: stats.costPnl != null ? (stats.costPnl >= 0 ? "up" : "down") : "default",
      sub: stats.costPnlPct != null ? `${stats.costPnlPct >= 0 ? "+" : ""}${stats.costPnlPct.toFixed(2)}%` : t("pf.kpi.costPnlNone"),
      subTone: stats.costPnlPct != null ? (stats.costPnlPct >= 0 ? "up" : "down") : "default",
    },
    {
      label: t("pf.kpi.top"),
      value: top ? top.symbol : "—",
      tone: "default",
      sub: top ? `${top.pct.toFixed(1)}% · ${formatUsdCompact(top.value)}` : "—",
      subTone: "default",
    },
  ]

  const loadingSkeleton = loading && !snapshot
  const emptyState = holdings.length === 0 && form.mode === "closed"

  return (
    <View style={{ flex: 1, backgroundColor: c("background") }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 28, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={c("primary")}
            colors={[c("primary")]}
            progressBackgroundColor={c("card")}
          />
        }
      >
        {/* 页头（对齐 web PageHeader：en 小标 + 标题 + 描述） */}
        <View style={{ gap: 2 }}>
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
            PORTFOLIO
          </Txt>
          <Txt variant="title" maxScale={1.4} style={{ fontFamily: F.semi }}>
            {t("page.portfolio.title")}
          </Txt>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), fontFamily: F.reg }}>
            {nt("page.portfolio.desc")}
          </Txt>
        </View>

        {loadingSkeleton ? (
          <>
            <KpiStripSkeleton />
            <TableSkeleton />
            <DonutSkeleton />
          </>
        ) : emptyState ? (
          <EmptyState onAdd={() => openAdd()} />
        ) : (
          <>
            {/* 快照失败且无缓存数据：错误态 + 重试 */}
            {error && !snapshot ? <ErrorCard message={error} onRetry={refresh} /> : null}

            {/* KPI 统计条 */}
            <Card>
              <View style={s.kpiGrid}>
                {kpis.map((k) => (
                  <Kpi key={k.label} item={k} />
                ))}
              </View>
            </Card>

            {/* 持仓明细 */}
            <Card>
              <View style={{ gap: 2 }}>
                <CardTitle>{t("pf.table.title")}</CardTitle>
                <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), fontFamily: F.reg }}>
                  {t("pf.table.desc", { n: rows.length })}
                </Txt>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Btn glyph="⤓" label={t("pf.csv.export")} onPress={() => void onExportCsv()} />
                <Btn glyph="⤒" label={t("pf.csv.import")} onPress={() => void onImportCsv()} />
                <Btn glyph="+" label={t("pf.form.add")} variant="solid" onPress={() => openAdd()} />
              </View>

              {/* 列头（移动端精简两栏：资产 / 市值·盈亏） */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), flex: 1 }}>
                  {t("common.col.asset")}
                </Txt>
                <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), textAlign: "right", minWidth: 104 }}>
                  {t("pf.col.value")} · {t("pf.col.pnl")}
                </Txt>
                <View style={{ width: 44 }} />
              </View>

              {rows.map((r, i) => (
                <Fragment key={r.holding.id}>
                  {i > 0 ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c("border") }} /> : null}
                  <HoldingRow
                    row={r}
                    armed={deleteConfirm.armed === r.holding.id}
                    onEdit={() => openEdit(r.holding)}
                    onDelete={() => onDeleteRow(r.holding)}
                  />
                </Fragment>
              ))}

              {/* 页脚：隐私说明 + 两步清空 */}
              <View style={[s.tableFooter, { borderTopColor: c("border") }]}>
                <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), flex: 1 }}>
                  {nt("pf.privacy")}
                </Txt>
                <Pressable
                  onPress={onClearAll}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={clearConfirm.armed ? t("pf.clearConfirm") : t("pf.clear")}
                  style={{ minHeight: 44, justifyContent: "center" }}
                >
                  <Txt
                    variant="label"
                    mono
                    maxScale={1.2}
                    style={{ color: clearConfirm.armed ? c("down") : c("muted-foreground"), textTransform: "uppercase" }}
                  >
                    {clearConfirm.armed ? t("pf.clearConfirm") : t("pf.clear")}
                  </Txt>
                </Pressable>
              </View>
            </Card>

            {/* 配置占比 */}
            <Card>
              <View style={{ gap: 2 }}>
                <CardTitle>{t("pf.alloc.title")}</CardTitle>
                <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), fontFamily: F.reg }}>
                  {t("pf.alloc.desc")}
                </Txt>
              </View>
              {alloc.length === 0 ? (
                <View style={{ height: 160, alignItems: "center", justifyContent: "center" }}>
                  <Txt variant="caption" style={{ color: c("muted-foreground") }}>
                    {t("pf.noPrice")}
                  </Txt>
                </View>
              ) : (
                <>
                  <View style={{ alignSelf: "center", width: DONUT_SIZE, height: DONUT_SIZE }}>
                    <AllocDonut slices={slices} activeKey={focusKey} onPressSlice={onToggleFocus} size={DONUT_SIZE} />
                    {/* 环心读数：按压资产 / 组合整体 二态切换 */}
                    <View
                      pointerEvents="none"
                      style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 2 }]}
                    >
                      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
                        {focusAlloc ? focusAlloc.symbol : t("pf.kpi.total")}
                      </Txt>
                      {focusAlloc ? (
                        <>
                          <Txt mono maxScale={1.3} style={{ fontSize: 22, lineHeight: 28, fontFamily: F.monoMed, color: c("foreground") }}>
                            {focusAlloc.pct.toFixed(1)}%
                          </Txt>
                          <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
                            {formatUsdCompact(focusAlloc.value)}
                          </Txt>
                        </>
                      ) : (
                        <Txt
                          mono
                          maxScale={1.3}
                          style={{ fontSize: 20, lineHeight: 26, fontFamily: F.monoMed, color: c("foreground") }}
                        >
                          ${stats.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                        </Txt>
                      )}
                    </View>
                  </View>

                  {/* 图例：按压联动环图高亮 */}
                  <View>
                    {alloc.map((a) => {
                      const active = focusKey === a.key
                      return (
                        <Pressable
                          key={a.key}
                          onPress={() => onToggleFocus(a.key)}
                          accessibilityRole="button"
                          accessibilityLabel={`${a.symbol} ${a.pct.toFixed(1)}%`}
                          style={({ pressed }) => [
                            s.legendRow,
                            {
                              backgroundColor: active ? c("secondary") : "transparent",
                              borderColor: active ? c("primary") : "transparent",
                              opacity: pressed ? 0.6 : 1,
                            },
                          ]}
                        >
                          <View
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: 3,
                              backgroundColor: a.color,
                              borderWidth: StyleSheet.hairlineWidth,
                              borderColor: active ? c("primary") : c("border"),
                            }}
                          />
                          <Txt mono maxScale={1.3} style={{ flex: 1, fontFamily: F.monoMed, fontSize: 12, color: c("foreground"), textTransform: "uppercase" }}>
                            {a.symbol}
                          </Txt>
                          <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
                            {formatUsdCompact(a.value)}
                          </Txt>
                          <Txt mono maxScale={1.3} style={{ width: 56, textAlign: "right", fontFamily: F.monoMed, fontSize: 12, color: c("foreground") }}>
                            {a.pct.toFixed(1)}%
                          </Txt>
                        </Pressable>
                      )
                    })}
                  </View>
                </>
              )}
            </Card>
          </>
        )}
      </ScrollView>

      {/* 浮层提示（对齐 web pushToast 的 5s 自动消退） */}
      {notice ? <NoticeBar notice={notice} /> : null}

      {/* 新增 / 编辑表单（pageSheet；sheet 卸载时一并清错） */}
      {form.mode !== "closed" ? (
        <HoldingSheet
          form={form}
          coins={coins}
          prices={prices}
          existing={form.mode === "add" && holdings.some((h) => h.id === form.coinId)}
          onChange={setForm}
          onClose={() => setForm({ mode: "closed" })}
          onSubmit={submitForm}
        />
      ) : null}
    </View>
  )
}

/* ------------------------------ 子组件（本页面组私有） ------------------------------ */

function Kpi({ item }: { item: KpiItem }) {
  const { c } = useAppTheme()
  const valueColor = item.tone === "up" ? c("up") : item.tone === "down" ? c("down") : c("foreground")
  const subColor = item.subTone === "up" ? c("up") : item.subTone === "down" ? c("down") : c("muted-foreground")
  return (
    <View style={s.kpiCell}>
      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
        {item.label}
      </Txt>
      <Txt mono maxScale={1.3} style={{ fontSize: 16, lineHeight: 22, fontFamily: F.monoMed, color: valueColor }}>
        {item.value}
      </Txt>
      <Txt variant="caption" mono maxScale={1.2} style={{ color: subColor }}>
        {item.sub}
      </Txt>
    </View>
  )
}

function Btn({
  label,
  glyph,
  variant = "outline",
  onPress,
  style,
}: {
  label: string
  glyph?: string
  variant?: "outline" | "solid"
  onPress: () => void
  style?: ViewStyle
}) {
  const { c } = useAppTheme()
  const solid = variant === "solid"
  const fg = solid ? c("primary-foreground") : c("foreground")
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.btn,
        {
          borderColor: solid ? "transparent" : c("border"),
          backgroundColor: solid ? c("primary") : "transparent",
          opacity: pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      {glyph ? (
        <Txt mono maxScale={1.3} style={{ fontSize: 13, color: fg }}>
          {glyph}
        </Txt>
      ) : null}
      <Txt maxScale={1.3} style={{ fontSize: 13, fontFamily: F.med, color: fg }}>
        {label}
      </Txt>
    </Pressable>
  )
}

function HoldingRow({
  row,
  armed,
  onEdit,
  onDelete,
}: {
  row: RowVM
  /** 两步删除武装态（该行） */
  armed: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const { c } = useAppTheme()
  const { holding: h } = row
  const symbol = (row.coin?.symbol ?? h.id).toUpperCase()
  const pnlColor = row.pnl == null ? c("muted-foreground") : row.pnl >= 0 ? c("up") : c("down")
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={t("pf.editSr", { symbol })}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, opacity: pressed ? 0.6 : 1 }]}
    >
      {/* 单色字母头像（web 图片列的黑白极简等价物） */}
      <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, borderColor: c("border"), alignItems: "center", justifyContent: "center" }}>
        <Txt mono maxScale={1.2} style={{ fontSize: 10, color: c("muted-foreground") }}>
          {symbol.slice(0, 1)}
        </Txt>
      </View>

      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Txt mono maxScale={1.3} style={{ fontFamily: F.monoMed, fontSize: 13, color: c("foreground") }}>
            {symbol}
          </Txt>
          {row.coin ? (
            <Txt variant="caption" maxScale={1.2} style={{ color: c("muted-foreground"), flexShrink: 1, fontFamily: F.reg }}>
              {row.coin.name}
            </Txt>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
          <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
            {formatAmount(h.amount)} × {row.price != null ? `$${formatPrice(row.price)}` : t("pf.noPrice")}
          </Txt>
          {row.chg24h != null ? (
            <Txt variant="caption" mono maxScale={1.2} style={{ color: row.chg24h >= 0 ? c("up") : c("down") }}>
              {row.chg24h >= 0 ? "+" : ""}
              {row.chg24h.toFixed(2)}%
            </Txt>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <Txt mono maxScale={1.3} style={{ fontFamily: F.monoMed, fontSize: 13, color: c("foreground") }}>
          {row.value != null ? `$${formatPrice(row.value)}` : "—"}
        </Txt>
        {row.pnl != null ? (
          <Txt variant="caption" mono maxScale={1.2} style={{ color: pnlColor }}>
            {row.pnl >= 0 ? "+" : "−"}${formatPnlAbs(row.pnl)}
            {row.pnlPct != null ? ` (${row.pnlPct >= 0 ? "+" : ""}${row.pnlPct.toFixed(2)}%)` : ""}
          </Txt>
        ) : (
          <Txt variant="caption" mono style={{ color: c("muted-foreground") }}>
            —
          </Txt>
        )}
      </View>

      {/* 删除（两步确认：武装态换文案并转 down 色，2.6s 自动复位） */}
      <Pressable
        onPress={onDelete}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={armed ? t("pf.deleteConfirm") : t("pf.deleteSr", { symbol })}
        style={{ minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" }}
      >
        {armed ? (
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("down"), fontSize: 9, textAlign: "right" }}>
            {t("pf.deleteConfirm")}
          </Txt>
        ) : (
          <Txt mono style={{ fontSize: 15, color: c("muted-foreground") }}>
            ✕
          </Txt>
        )}
      </Pressable>
    </Pressable>
  )
}

/** 配置环图（react-native-svg 自绘）：dasharray 直接用百分比；分段按压联动。
 *  到场动效以整环 fade-up 近似 web 的弧生长（0.8s CSS 过渡的 iOS 等价物）。 */
function AllocDonut({
  slices,
  activeKey,
  onPressSlice,
  size = DONUT_SIZE,
}: {
  slices: DonutSlice[]
  activeKey: string | null
  onPressSlice: (key: string) => void
  size?: number
}) {
  const { c } = useAppTheme()
  const fade = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }).start()
  }, [fade])

  // 预计算每段起点（累计百分比），避免渲染期变量重赋值（web 同实现）
  const segments = useMemo(
    () =>
      slices.reduce<{ key: string; pct: number; color: string; start: number }[]>((acc, seg) => {
        const prev = acc[acc.length - 1]
        acc.push({ ...seg, start: prev ? prev.start + prev.pct : 0 })
        return acc
      }, []),
    [slices]
  )

  const r = 15.9155 // 周长恰为 100，dasharray 直接用百分比
  return (
    <Animated.View style={{ opacity: fade, transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 42 42" accessibilityLabel={t("pf.alloc.title")}>
        <Circle cx={21} cy={21} r={r} fill="none" stroke={c("secondary")} strokeWidth={5} />
        {segments.map((seg) => {
          const len = Math.max(seg.pct - (segments.length > 1 ? 0.7 : 0), 0.3)
          const dim = activeKey != null && activeKey !== seg.key
          return (
            <Circle
              key={seg.key}
              cx={21}
              cy={21}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={activeKey === seg.key ? 6.6 : seg.pct >= 99.5 ? 5 : 5.8}
              strokeDasharray={`${len} ${100 - len}`}
              strokeDashoffset={-seg.start}
              transform="rotate(-90 21 21)"
              opacity={dim ? 0.3 : 1}
              onPress={() => onPressSlice(seg.key)}
            />
          )
        })}
      </Svg>
    </Animated.View>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { c } = useAppTheme()
  return (
    <Card style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c("border"),
          backgroundColor: c("muted"),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Txt mono style={{ color: c("primary"), fontSize: 18 }}>
          ◈
        </Txt>
      </View>
      <Txt maxScale={1.4} style={{ fontFamily: F.med, fontSize: 14 }}>
        {t("pf.empty.title")}
      </Txt>
      <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center", maxWidth: 300, fontFamily: F.reg }}>
        {nt("pf.empty.desc")}
      </Txt>
      <Btn glyph="+" label={t("pf.empty.cta")} variant="solid" onPress={onAdd} />
      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), opacity: 0.7, textAlign: "center" }}>
        {nt("pf.privacy")}
      </Txt>
    </Card>
  )
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { c } = useAppTheme()
  return (
    <Card style={{ gap: 10 }}>
      <CardTitle>{t("common.loadFail")}</CardTitle>
      <Txt variant="caption" mono style={{ color: c("muted-foreground") }}>
        {message}
      </Txt>
      <Btn glyph="↻" label={t("common.retry")} onPress={onRetry} style={{ alignSelf: "flex-start" }} />
    </Card>
  )
}

function NoticeBar({ notice }: { notice: { text: string; tone: "ok" | "err" } }) {
  const { c } = useAppTheme()
  return (
    <View
      pointerEvents="none"
      style={[s.notice, { borderColor: c("border"), backgroundColor: c("popover") }]}
    >
      <Txt variant="caption" mono style={{ color: notice.tone === "err" ? c("down") : c("foreground") }}>
        {notice.text}
      </Txt>
    </View>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  autoFocus?: boolean
}) {
  const { c } = useAppTheme()
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
        {label}
      </Txt>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c("muted-foreground")}
        keyboardType="decimal-pad"
        autoFocus={autoFocus}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={label}
        style={{
          minHeight: 44,
          color: c("foreground"),
          fontFamily: F.monoMed,
          fontSize: 16, // ≥16 防 iOS 聚焦自动放大
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c("input"),
          borderRadius: radius.sm,
          paddingHorizontal: 10,
        }}
      />
    </View>
  )
}

/** 新增/编辑表单：底部 pageSheet（币种 chips + 数量/成本 + 实时估值 + 校验） */
function HoldingSheet({
  form,
  coins,
  prices,
  existing,
  onChange,
  onClose,
  onSubmit,
}: {
  form: Extract<FormState, { mode: "add" | "edit" }>
  coins: Coin[]
  prices: Record<string, PriceRef>
  /** 编辑的币种是否已在持仓中（add 模式下用于覆盖提示） */
  existing: boolean
  onChange: (s: FormState) => void
  onClose: () => void
  onSubmit: () => void
}) {
  useT()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [error, setError] = useState<string | null>(null)

  const amountNum = parseNum(form.amount)
  const price = prices[form.coinId]?.price ?? coins.find((x) => x.id === form.coinId)?.current_price ?? null
  const estimate = price != null && Number.isFinite(amountNum) && amountNum > 0 ? amountNum * price : null

  const submit = () => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(t("pf.form.amountInvalid"))
      return
    }
    const costNum = form.cost.trim() === "" ? null : parseNum(form.cost)
    if (costNum != null && (!Number.isFinite(costNum) || costNum < 0)) {
      setError(t("pf.form.costInvalid"))
      return
    }
    setError(null)
    onSubmit()
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c("background") }}>
        <ScrollView
          contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 14 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Txt variant="title" maxScale={1.4} style={{ fontFamily: F.semi }}>
              {form.mode === "add" ? t("pf.form.add") : t("pf.form.edit")}
            </Txt>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
            >
              <Txt mono style={{ fontSize: 16, color: c("muted-foreground") }}>
                ✕
              </Txt>
            </Pressable>
          </View>

          <Txt
            variant="caption"
            maxScale={1.3}
            style={{ color: existing && form.mode === "add" ? c("primary") : c("muted-foreground"), fontFamily: F.reg }}
          >
            {existing && form.mode === "add" ? t("pf.form.exists") : t("pf.form.desc")}
          </Txt>

          {/* 币种选择（编辑态锁定） */}
          <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
            {t("pf.form.asset")}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            {coins.map((coin) => {
              const active = coin.id === form.coinId
              const locked = form.mode === "edit"
              return (
                <Pressable
                  key={coin.id}
                  disabled={locked}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: locked }}
                  onPress={() => {
                    hapticSelection() // 分段选择 = selection
                    onChange({ ...form, coinId: coin.id } as FormState)
                  }}
                  style={({ pressed }) => [
                    s.chip,
                    {
                      borderColor: active ? c("primary") : c("border"),
                      backgroundColor: active ? c("muted") : "transparent",
                      opacity: pressed || locked ? 0.6 : 1,
                    },
                  ]}
                >
                  <Txt
                    mono
                    maxScale={1.2}
                    style={{ fontSize: 12, fontFamily: F.monoMed, color: active ? c("primary") : c("muted-foreground"), textTransform: "uppercase" }}
                  >
                    {coin.symbol.toUpperCase()}
                  </Txt>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Field label={t("pf.form.amount")} value={form.amount} onChange={(v) => onChange({ ...form, amount: v } as FormState)} placeholder="0.00" autoFocus />
            <Field label={t("pf.form.cost")} value={form.cost} onChange={(v) => onChange({ ...form, cost: v } as FormState)} placeholder={t("pf.costPlaceholder")} />
          </View>

          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <Txt variant="caption" mono maxScale={1.2} style={{ color: c("muted-foreground") }}>
              {t("pf.form.valueNow")}
            </Txt>
            <Txt variant="caption" mono maxScale={1.2} style={{ color: c("foreground"), fontFamily: F.monoMed }}>
              {estimate != null ? `$${formatPrice(estimate)}` : "—"}
            </Txt>
            {error ? (
              <Txt variant="caption" mono maxScale={1.2} style={{ color: c("down") }}>
                {error}
              </Txt>
            ) : null}
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 2 }}>
            <Btn label={t("common.cancel")} onPress={onClose} style={{ flex: 1 }} />
            <Btn label={t("common.save")} variant="solid" onPress={submit} style={{ flex: 1 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

/* ------------------------------ 骨架（加载态） ------------------------------ */

function Sk({ w, h, r = 4, style }: { w: DimensionValue; h: number; r?: number; style?: ViewStyle }) {
  const { c } = useAppTheme()
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.2, duration: 650, useNativeDriver: true }),
      ])
    )
    a.start()
    return () => a.stop()
  }, [pulse])
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] })
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c("muted") }, style, { opacity }]} />
}

function KpiStripSkeleton() {
  return (
    <Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} w="48%" h={54} />
        ))}
      </View>
    </Card>
  )
}

function TableSkeleton() {
  return (
    <Card>
      <Sk w={96} h={12} />
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}>
          <Sk w={30} h={30} r={15} />
          <Sk w="40%" h={11} />
          <View style={{ flex: 1 }} />
          <Sk w={86} h={11} />
        </View>
      ))}
    </Card>
  )
}

function DonutSkeleton() {
  return (
    <Card style={{ alignItems: "center", gap: 12 }}>
      <Sk w={DONUT_SIZE} h={DONUT_SIZE} r={DONUT_SIZE / 2} />
      {[0, 1, 2, 3].map((i) => (
        <Sk key={i} w="100%" h={10} r={5} />
      ))}
    </Card>
  )
}

/* ------------------------------ 样式 ------------------------------ */

const s = StyleSheet.create({
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpiCell: { flexBasis: "47%", flexGrow: 1, gap: 3 },
  btn: {
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    borderRadius: radius.sm,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tableFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notice: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
})
