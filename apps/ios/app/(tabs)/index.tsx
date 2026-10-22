import { useMemo } from "react"
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native"
import { Link, type Href } from "expo-router"
import Animated, { FadeInDown } from "react-native-reanimated"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { useMarket } from "@repo/react/MarketData"

import { Card, Page } from "../../src/components/ui"
import { useAppTheme } from "../../src/lib/theme"
import { BtcChartCard } from "../../src/components/dashboard/BtcChartCard"
import { IndicatorBreakdown } from "../../src/components/dashboard/IndicatorBreakdown"
import { MarketOverview } from "../../src/components/dashboard/MarketOverview"
import { PageHeader, SectionLabel } from "../../src/components/dashboard/PageHeader"
import { PricesTable } from "../../src/components/dashboard/PricesTable"
import { RegimeCard } from "../../src/components/dashboard/RegimeCard"
import { SentimentCard } from "../../src/components/dashboard/SentimentCard"
import { SignalCard } from "../../src/components/dashboard/SignalCard"
import { EmptyNote, FONT } from "../../src/components/dashboard/util"
import { DashboardSkeleton } from "../../src/components/dashboard/skeletons"

/** 页头动作入口（stack 页直达；44pt 命中区） */
function HeaderLink({ href, label }: { href: Href; label: string }) {
  const { c } = useAppTheme()
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="button"
        hitSlop={6}
        style={({ pressed }) => ({
          minHeight: 44,
          justifyContent: "center",
          paddingHorizontal: 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono, letterSpacing: 1 }}>
          {label}
        </Text>
      </Pressable>
    </Link>
  )
}

/** 总览仪表盘：信号 / 牛熊 / 情绪 → 全球概览 → BTC 走势（十字线探针）→ 实时价格 → 指标推导 */
export default function Dashboard() {
  useT()
  const { snapshot, error, loading, refreshing, refresh, patchedChart, analysis } = useMarket()
  const { c } = useAppTheme()

  const chart = useMemo(() => patchedChart ?? snapshot?.btcChart ?? null, [patchedChart, snapshot])

  if (loading && !snapshot) {
    return (
      <Page>
        <DashboardSkeleton />
      </Page>
    )
  }

  if (error && !snapshot) {
    return (
      <Page>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 14 }}>
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
            <Text style={{ color: c("foreground"), fontSize: 24 }}>⚠</Text>
          </View>
          <Text maxFontSizeMultiplier={1.4} style={{ color: c("foreground"), fontSize: 15, fontFamily: FONT.semi, textAlign: "center" }}>
            {t("common.loadFail")}
          </Text>
          {error ? (
            <Text
              numberOfLines={3}
              style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: FONT.mono, textAlign: "center", maxWidth: 300 }}
            >
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.retry")}
            onPress={refresh}
            hitSlop={8}
            style={({ pressed }) => ({
              minHeight: 44,
              paddingHorizontal: 18,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c("border"),
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "row",
              gap: 6,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: c("foreground"), fontSize: 13 }}>↻</Text>
            <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.medium }}>
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      </Page>
    )
  }

  if (!snapshot) return null

  return (
    <Page>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c("primary")} />
        }
      >
        <PageHeader en="DASHBOARD" title={t("page.dashboard.title")} description={t("page.dashboard.desc")}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <HeaderLink href="/alerts" label={t("nav.alerts")} />
            <HeaderLink href="/events" label="EVENTS" />
            <HeaderLink href="/settings" label={t("nav.settings")} />
            <HeaderLink href="/about" label={t("nav.about")} />
          </View>
        </PageHeader>

        {/* 第一屏：信号 / 牛熊 / 情绪 */}
        {analysis ? (
          <SignalCard analysis={analysis} />
        ) : (
          <Card>
            <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 44, gap: 6 }}>
              <Text maxFontSizeMultiplier={1.3} style={{ color: c("foreground"), fontSize: 13, fontFamily: FONT.semi }}>
                {t("dash.noInd")}
              </Text>
              <Text
                maxFontSizeMultiplier={1.3}
                style={{ color: c("muted-foreground"), fontSize: 11, textAlign: "center", lineHeight: 16 }}
              >
                {t("dash.noIndDesc")}
              </Text>
            </View>
          </Card>
        )}
        {analysis ? (
          <RegimeCard analysis={analysis} />
        ) : (
          <Card>
            <EmptyNote tall>{t("common.noData")}</EmptyNote>
          </Card>
        )}
        <SentimentCard fng={snapshot.fng} />

        {/* 全球市场概览 */}
        <MarketOverview global={snapshot.global} />

        {/* BTC 走势（滚动显现） */}
        <Animated.View entering={FadeInDown.duration(320)} style={{ gap: 10 }}>
          <SectionLabel>{t("dash.section.structure")}</SectionLabel>
          {chart && <BtcChartCard chart={chart} analysis={analysis} />}
        </Animated.View>

        {/* 实时价格（滚动显现） */}
        <Animated.View entering={FadeInDown.duration(320).delay(60)} style={{ gap: 10 }}>
          <SectionLabel>{t("dash.section.live")}</SectionLabel>
          <PricesTable coins={snapshot.coins} />
        </Animated.View>

        {/* 指标明细 */}
        {analysis && (
          <Animated.View entering={FadeInDown.duration(320).delay(90)} style={{ gap: 10 }}>
            <SectionLabel>{t("dash.section.signal")}</SectionLabel>
            <IndicatorBreakdown analysis={analysis} />
          </Animated.View>
        )}
      </ScrollView>
    </Page>
  )
}
