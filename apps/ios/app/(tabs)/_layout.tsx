import { Tabs } from "expo-router"
import { StyleSheet, Text, type ColorValue } from "react-native"

import { t as _t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"

import { useAppTheme } from "../../src/lib/theme"

void _t

/**
 * 底部五席（screenGroups 展开序）：总览 / 行情 / 信号 / 工具 / 持仓。
 * 标题经 i18n 词典取词（nav.* 键与 web Header 同源）。
 * 图标/标签为导航 chrome：经回调 color 按 tintColor 染色（未染色时黑字
 * 黑底不可见），并 allowFontScaling=false 冻结字号——accessibility 特大
 * 号下 chrome 文本若随动缩放会超出 tab 宽度相互叠压连片（与 UITabBar
 * 不随 Dynamic Type 缩放的平台惯例一致；正文文本仍全程支持 Dynamic Type）。
 */

/** tab 标签：冻结字号 + 单行（任何内容尺寸下五标签恒完整、恒分离） */
function TabBarLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={1}
      style={{ color, fontSize: 10, textAlign: "center" }}
    >
      {children}
    </Text>
  )
}

export default function TabsLayout() {
  const t = useT()
  const { c } = useAppTheme()
  // 图标必须取回调 color（激活/非激活 tint），否则黑字黑底不可见
  const icon = (glyph: string) => ({ color }: { color: ColorValue }) => (
    <Text allowFontScaling={false} style={[s.icon, { color }]}>
      {glyph}
    </Text>
  )
  const label = (title: string) => ({ color }: { color: ColorValue }) => (
    <TabBarLabel color={color}>{title}</TabBarLabel>
  )
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c("background"),
          borderTopColor: c("border"),
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarActiveTintColor: c("primary"),
        tabBarInactiveTintColor: c("muted-foreground"),
        sceneStyle: { backgroundColor: c("background") },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("nav.dashboard"), tabBarIcon: icon("◎"), tabBarLabel: label(t("nav.dashboard")) }} />
      <Tabs.Screen name="markets" options={{ title: t("nav.markets"), tabBarIcon: icon("§"), tabBarLabel: label(t("nav.markets")) }} />
      <Tabs.Screen name="signal" options={{ title: t("nav.verdict"), tabBarIcon: icon("∿"), tabBarLabel: label(t("nav.verdict")) }} />
      <Tabs.Screen name="tools" options={{ title: t("nav.converter"), tabBarIcon: icon("⌘"), tabBarLabel: label(t("nav.converter")) }} />
      <Tabs.Screen name="portfolio" options={{ title: t("nav.portfolio"), tabBarIcon: icon("▤"), tabBarLabel: label(t("nav.portfolio")) }} />
    </Tabs>
  )
}

const s = StyleSheet.create({
  icon: { fontSize: 16, lineHeight: 20 },
})
