/**
 * 关于（Stack）— apps/web/src/pages/AboutPage.tsx 的 iOS 移植：
 *  - 项目说明（about.what.p1/p2a），十页清单逐页可跳转（RN 嵌套 Text 的
 *    onPress 内联链接，虚线下划线暗示可跳，与 web NavLink 同语言）；
 *    路由映射到 iOS 页面集（5 tab + 5 stack）：sentiment 并入总览、
 *    verdict→/signal、converter→/tools、settings 入列补足十页
 *  - 功能特性：十项（f1-f10 词典同源），lucide 图标以 mono 字形替代
 *    （与 tab bar 的字形图标语言一致）
 *  - 技术栈：iOS 侧真实栈（React Native / Expo / expo-router 等）
 *  - 版本行随主题联动（THEMES.en，useAppTheme 订阅重渲染）
 */
import { Text, View } from "react-native"
import { router, type Href } from "expo-router"

import { getLocale, t, type MessageKey } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { radius } from "@repo/ui-tokens/theme"

import { Card, CardTitle, Txt } from "../src/components/ui"
import { useAppTheme, THEMES } from "../src/lib/theme"
import { hapticSelection } from "../src/lib/haptics"

import { F, PageHeader, ScreenScroll } from "../src/components/settings-shared"
import { nt } from "../src/lib/native-copy"

/**
 * 清单 settings 行专用描述：其余九行用词典 about.pg.*（自带「 (」前缀与
 * 「), 」尾随分隔），settings 行复用的 page.settings.desc 两头都没有，
 * 相邻 <Text> 直排会粘连（「SettingsLocal data…」/「…browserAbout (this
 * page)」）。此处按清单格式补齐分隔（词典无对应键，iOS 侧平台措辞）。
 */
const PAGES_SETTINGS_DESC = {
  en: " (local data backup & restore · data stays on this device), ",
  zh: "（本地数据备份与还原 · 数据不出本机）、",
} as const

/** 功能特性：[标题键, 描述键, mono 字形] */
const FEATURES: [MessageKey, MessageKey, string][] = [
  ["about.f1.title", "about.f1.desc", "⚡"],
  ["about.f2.title", "about.f2.desc", "Σ"],
  ["about.f3.title", "about.f3.desc", "▮"],
  ["about.f4.title", "about.f4.desc", "⇅"],
  ["about.f5.title", "about.f5.desc", "★"],
  ["about.f6.title", "about.f6.desc", "⇄"],
  ["about.f7.title", "about.f7.desc", "▤"],
  ["about.f8.title", "about.f8.desc", "◉"],
  ["about.f9.title", "about.f9.desc", "▦"],
  ["about.f10.title", "about.f10.desc", "⚖"],
]

/** 页面清单：名称取词典 key + 一句定位（desc 自带顿号/逗号句读）+ 路由 */
const PAGES: [MessageKey, MessageKey, Href][] = [
  ["nav.dashboard", "about.pg.dash", "/"],
  ["nav.markets", "about.pg.markets", "/markets"],
  ["about.pg.coinName", "about.pg.coin", "/coin/bitcoin"],
  ["nav.verdict", "about.pg.verdict", "/signal"],
  ["nav.converter", "about.pg.converter", "/tools"],
  ["nav.portfolio", "about.pg.portfolio", "/portfolio"],
  ["nav.alerts", "about.pg.alerts", "/alerts"],
  ["nav.events", "about.pg.events", "/events"],
  ["nav.settings", "page.settings.desc", "/settings"],
  ["nav.about", "about.pg.about", "/about"],
]

/** iOS 侧真实技术栈（web 页为 React/Vite/Tailwind 栈） */
const STACK = [
  "React Native 0.86",
  "React 19",
  "TypeScript",
  "Expo SDK 57",
  "expo-router",
  "react-native-svg",
  "monorepo: core · data · react · ui-tokens",
]

export default function AboutScreen() {
  useT()
  const { theme, c } = useAppTheme()
  const themeEn = THEMES.find((x) => x.id === theme)?.en ?? "MONO"

  return (
    <ScreenScroll>
      <PageHeader
        en="ABOUT"
        title={t("page.about.title")}
        desc={"CRYPTO STATUS · " + themeEn + " EDITION · v2.0"}
      />

      {/* 这是什么 */}
      <Card style={{ gap: 8 }}>
        <View style={{ gap: 2 }}>
          <CardTitle>{t("about.what.title")}</CardTitle>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 17 }}>
            {t("about.what.desc")}
          </Txt>
        </View>
        <Txt variant="body" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 22 }}>
          {nt("about.what.p1")}
        </Txt>
        <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 20 }}>
          {t("about.what.p2a")}
          {PAGES.map(([key, desc, to]) => {
            const d = desc === "page.settings.desc" ? PAGES_SETTINGS_DESC[getLocale()] : t(desc)
            return (
              <Text key={key}>
                <Text
                  onPress={() => {
                    hapticSelection()
                    router.push(to)
                  }}
                  accessibilityRole="link"
                  style={{
                    color: c("foreground"),
                    fontFamily: F.semiBold,
                    textDecorationLine: "underline",
                    textDecorationStyle: "dashed",
                    textDecorationColor: c("border"),
                  }}
                >
                  {t(key)}
                </Text>
                <Text>{d}</Text>
              </Text>
            )
          })}
        </Txt>
      </Card>

      {/* 功能特性 */}
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <CardTitle>{t("about.features.title")}</CardTitle>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 17 }}>
            {t("about.features.desc")}
          </Txt>
        </View>
        {FEATURES.map(([title, desc, glyph]) => (
          <View key={title} style={{ flexDirection: "row", gap: 10 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: radius.sm,
                borderWidth: 1,
                borderColor: c("border"),
                backgroundColor: c("secondary"),
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Text style={{ color: c("primary"), fontSize: 14, fontFamily: F.mono }}>{glyph}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="body" maxScale={1.3} style={{ fontFamily: F.semiBold, fontSize: 14 }}>
                {t(title)}
              </Txt>
              <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 18 }}>
                {t(desc)}
              </Txt>
            </View>
          </View>
        ))}
      </Card>

      {/* 技术栈 */}
      <Card>
        <CardTitle>{t("about.stack.title")}</CardTitle>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {STACK.map((s) => (
            <View
              key={s}
              style={{
                borderWidth: 1,
                borderColor: c("border"),
                borderRadius: radius.sm,
                paddingHorizontal: 8,
                paddingVertical: 5,
              }}
            >
              <Text style={{ color: c("muted-foreground"), fontSize: 11, fontFamily: F.mono }}>{s}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Txt variant="label" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10, textAlign: "center", lineHeight: 16, paddingHorizontal: 16 }}>
        {t("about.disclaimer")}
      </Txt>
    </ScreenScroll>
  )
}
