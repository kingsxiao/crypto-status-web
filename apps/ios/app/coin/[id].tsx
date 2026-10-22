/**
 * 币种详情路由 — web CoinPage.tsx 的 RN 移植：
 * 加载骨架 / 快照主备源全挂错误重试 / 未找到该币种 三态守卫，
 * 数据落地后渲染 CoinDetail（key=coinId 强制重挂载，绝不复用上一币种状态）。
 * 盯盘标题：web 的 usePageMeta 在 native 由无障碍 label 承担同等语义。
 */

import { useRouter, useLocalSearchParams } from "expo-router"
import { ScrollView, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { useLive, useMarket } from "@repo/react/MarketData"

import { CoinDetail } from "../../src/components/CoinDetail"
import { Card, Row, Tap, Txt } from "../../src/components/ui"
import { ChartSkeleton, SkBar, SkCircle } from "../../src/components/skeletons"
import { useAppTheme } from "../../src/lib/theme"

export default function CoinPage() {
  useT()
  const { id } = useLocalSearchParams<{ id: string }>()
  const coinId = typeof id === "string" ? id : ""
  const router = useRouter()
  const { snapshot, error, loading, refresh } = useMarket()
  const tickers = useLive()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()

  const coin = snapshot?.coins.find((cd) => cd.id === coinId) ?? null

  /* 首载骨架：返回行 + 头部卡 + 工具条 + 图表 + 观点区 */
  if (loading && !snapshot) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: c("background") }}
        contentContainerStyle={{ paddingTop: insets.top + 12, padding: 12, gap: 10 }}
      >
        <Row style={{ justifyContent: "space-between" }}>
          <SkBar w={90} h={14} />
          <SkBar w={80} />
        </Row>
        <Card>
          <Row style={{ gap: 14 }}>
            <SkCircle size={48} />
            <View style={{ gap: 8, flex: 1 }}>
              <SkBar w={140} h={14} />
              <SkBar w={120} h={22} />
            </View>
          </Row>
          <Row style={{ justifyContent: "space-between", marginTop: 8 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <View key={i} style={{ gap: 6 }}>
                <SkBar w={44} h={6} tone="muted" />
                <SkBar w={56} h={10} />
              </View>
            ))}
          </Row>
        </Card>
        <Card>
          <Row style={{ gap: 6 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkBar key={i} w={40} h={14} />
            ))}
          </Row>
          <SkBar w="100%" h={14} />
        </Card>
        <Card>
          <SkBar w={110} h={12} />
          <ChartSkeleton bars={40} height={260} />
        </Card>
        <Card>
          <SkBar w={140} h={12} />
          <SkBar w="50%" h={34} />
          <SkBar w="100%" h={8} tone="muted" />
        </Card>
      </ScrollView>
    )
  }

  /* 快照主备源全挂：报加载失败而非「未找到该币种」 */
  if (error && !snapshot) {
    return (
      <Center inset={insets.top}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: c("border"), justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: c("foreground"), fontSize: 22 }}>⚠</Text>
        </View>
        <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600" }}>{t("common.loadFail")}</Txt>
        <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground"), textAlign: "center" }}>{error}</Txt>
        <Tap onPress={refresh}>{t("common.retry")}</Tap>
      </Center>
    )
  }

  if (!coin) {
    return (
      <Center inset={insets.top}>
        <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: c("border"), justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: c("foreground"), fontSize: 22 }}>⚠</Text>
        </View>
        <Txt variant="body" maxScale={1.3} style={{ fontWeight: "600" }}>{t("coin.notFound")}</Txt>
        <Txt mono maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>id: {coinId}</Txt>
        <Tap onPress={() => router.replace("/markets")}>{t("coin.backToList")}</Tap>
      </Center>
    )
  }

  return (
    <CoinDetail
      key={coin.id}
      coin={coin}
      live={tickers[coin.id]}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/markets"))}
    />
  )
}

function Center({ children, inset }: { children: React.ReactNode; inset: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flex: 1, backgroundColor: c("background"), paddingTop: inset + 24, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
      {children}
    </View>
  )
}
