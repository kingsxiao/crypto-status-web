/**
 * 设置（Stack）— apps/web/src/pages/SettingsPage.tsx 的 iOS 移植：
 *  - 主题：三套（mono/blue/violet）色板芯片，色点经 rnColor(cssTokens[x].primary)
 *    程序化取色（无第二份手工色值）；切换即写 @repo/core/theme → storageBus
 *    持久化（跨启动），ThemeProvider / StatusBar 全站联动
 *  - 语言：zh / en（LOCALES），切换 selection 触感
 *  - 备份：四域（自选/持仓/预警/事件提醒）JSON 一键导出（expo-sharing 系统
 *    分享面板，expo-file-system 写临时文件）与导入（expo-document-picker 选
 *    文件 → @repo/core/backup importBackup 粗粒度校验）；成功/失败行内
 *    反馈 + notify 触感（平台适配层归属 app，共享包零 RN 依赖）
 *  - 数据概览：四域记录数 + storage 占用（storageGet 字符长度），
 *    导入派发的域变更事件即时反映（hooks 订阅）
 *  web 端主题/语言在页头 Header，iOS 归位于本页（web Header 无移动端对应物）
 */
import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import * as Sharing from "expo-sharing"
import * as DocumentPicker from "expo-document-picker"
import { File, Paths } from "expo-file-system"

import { getLocale, LOCALES, setLocale, t } from "@repo/core/i18n"
import { BACKUP_FILENAME_PREFIX, buildBackup, importBackup } from "@repo/core/backup"
import { setTheme } from "@repo/core/theme"
import { STORAGE_KEYS, storageGet } from "@repo/core/storageBus"
import { useT } from "@repo/react/i18n"
import { useAlerts } from "@repo/react/useAlerts"
import { useEventReminders } from "@repo/react/useEventReminders"
import { useFavorites } from "@repo/react/useFavorites"
import { usePortfolio } from "@repo/react/usePortfolio"
import { cssTokens, radius } from "@repo/ui-tokens/theme"

import { Card, CardTitle, Row, Txt } from "../src/components/ui"
import { useAppTheme, THEMES } from "../src/lib/theme"
import { rnColor } from "../src/lib/colors"
import { hapticImpact, hapticNotify, hapticSelection } from "../src/lib/haptics"
import { nt } from "../src/lib/native-copy"

import { F, PageHeader, Pill, ScreenScroll, SectionLabel } from "../src/components/settings-shared"

/** 各域 storage 占用：库内字符串长度（JSON 序列化字符数，与 web 同口径） */
function bytesOf(key: string): number {
  return storageGet(key)?.length ?? 0
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB"
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB"
  return n + " B"
}

export default function SettingsScreen() {
  useT()
  const { theme, c } = useAppTheme()
  const { favorites } = useFavorites()
  const { holdings } = usePortfolio()
  const { alerts } = useAlerts()
  const { reminders } = useEventReminders()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const activeAlerts = alerts.filter((a) => a.status === "active").length
  const triggeredAlerts = alerts.length - activeAlerts

  /* ------------------------------ 备份动作 ------------------------------ */

  const onExport = async () => {
    hapticImpact("light")
    try {
      const json = JSON.stringify(buildBackup(), null, 2)
      const name = BACKUP_FILENAME_PREFIX + "-" + new Date().toISOString().slice(0, 10) + ".json"
      // 平台适配层（归属 app）：写临时文件再交系统分享面板（expo-sharing 需文件 URI）
      const file = new File(Paths.cache, name)
      file.write(json, { encoding: "utf8" })
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "CRYPTO STATUS backup",
      })
    } catch {
      /* 分享面板被取消 / 不可用：无数据变更，静默即可 */
    }
  }

  const onImport = async () => {
    const picked = await DocumentPicker.getDocumentAsync({ type: "application/json" })
    if (picked.canceled || !picked.assets?.[0]) return
    try {
      const text = await (await fetch(picked.assets[0].uri)).text()
      const result = importBackup(text)
      if (result.ok) {
        hapticNotify("success")
        setMsg({
          ok: true,
          text:
            t("set.importOk") +
            " · " +
            t("set.importOkDesc", {
              fav: result.counts.favorites,
              pf: result.counts.portfolio,
              al: result.counts.alerts,
              ev: result.counts.eventReminders,
            }),
        })
      } else {
        // 结构非法：库未被动过，提示后继续用现有数据（与 web 同语义）
        hapticNotify("error")
        setMsg({
          ok: false,
          text: t(result.error === "parse" ? "set.importFail.parse" : "set.importFail.shape"),
        })
      }
    } catch {
      hapticNotify("error")
      setMsg({ ok: false, text: t("set.importFail.parse") })
    }
  }

  const domains: { glyph: string; label: string; count: number; sub: string }[] = [
    {
      glyph: "★",
      label: t("set.dom.favorites"),
      count: favorites.length,
      sub: t("set.storage") + " " + fmtBytes(bytesOf(STORAGE_KEYS.favorites)),
    },
    {
      glyph: "▤",
      label: t("set.dom.portfolio"),
      count: holdings.length,
      sub: t("set.storage") + " " + fmtBytes(bytesOf(STORAGE_KEYS.portfolio)),
    },
    {
      glyph: "◉",
      label: t("set.dom.alerts"),
      count: alerts.length,
      sub:
        t("set.dom.alertsSub", { active: activeAlerts, triggered: triggeredAlerts }) +
        " · " +
        t("set.storage") +
        " " +
        fmtBytes(bytesOf(STORAGE_KEYS.alerts)),
    },
    {
      glyph: "▦",
      label: t("set.dom.reminders"),
      count: Object.keys(reminders).length,
      sub: t("set.storage") + " " + fmtBytes(bytesOf(STORAGE_KEYS.eventReminders)),
    },
  ]

  return (
    <ScreenScroll>
      <PageHeader en="SETTINGS" title={t("page.settings.title")} desc={nt("page.settings.desc")} />

      {/* 主题（web Header 右上角的移动端归位；storageBus 持久化跨启动） */}
      <Card>
        <CardTitle>{t("hdr.themeMenu")}</CardTitle>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {THEMES.map((x) => {
            const on = theme === x.id
            return (
              <Pressable
                key={x.id}
                onPress={() => {
                  setTheme(x.id)
                  hapticSelection()
                }}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={t(x.nameKey)}
                style={({ pressed }) => [
                  {
                    flex: 1,
                    borderWidth: 1,
                    borderColor: on ? c("primary") : c("border"),
                    borderRadius: radius.md,
                    padding: 10,
                    minHeight: 56,
                    justifyContent: "center",
                    gap: 5,
                    opacity: pressed ? 0.6 : 1,
                  },
                ]}
              >
                <Row style={{ gap: 8 }}>
                  <View
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 7,
                      backgroundColor: rnColor(cssTokens[x.id].primary),
                      borderWidth: 1,
                      borderColor: c("border"),
                    }}
                  />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    maxFontSizeMultiplier={2}
                    style={{
                      color: on ? c("primary") : c("muted-foreground"),
                      fontSize: 13,
                      fontFamily: on ? F.semiBold : F.regular,
                    }}
                  >
                    {t(x.nameKey)}
                  </Text>
                </Row>
                {/* 单行缩字：a11y 特大号下拉丁词不逐字符断行（GRAPHITE MONO 等） */}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.5}
                  maxFontSizeMultiplier={2.5}
                  style={{ color: c("muted-foreground"), fontSize: 9, fontFamily: F.mono, letterSpacing: 1.5 }}
                >
                  {x.en}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      {/* 语言 */}
      <Card>
        <CardTitle>{t("hdr.languageMenu")}</CardTitle>
        <Row style={{ gap: 8 }}>
          {LOCALES.map((l) => (
            <Pill
              key={l.id}
              label={l.label}
              active={getLocale() === l.id}
              style={{ flex: 1 }}
              onPress={() => {
                // setLocale 写 store + storageBus；useT 订阅令本页即时重渲染
                setLocale(l.id)
                hapticSelection()
              }}
            />
          ))}
        </Row>
      </Card>

      {/* 备份与还原 */}
      <Card>
        <View style={{ gap: 2 }}>
          <CardTitle>{t("set.backup.title")}</CardTitle>
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), lineHeight: 17 }}>
            {nt("set.backup.desc")}
          </Txt>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View
            style={{
              flex: 1,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c("border"),
              borderRadius: radius.lg,
              backgroundColor: c("secondary"),
              padding: 10,
              gap: 8,
            }}
          >
            <Pill onPress={() => void onExport()} label={t("set.export")} filled mono={false} style={{ minHeight: 40 }} />
            <Txt variant="caption" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}>
              {t("set.exportHint")}
            </Txt>
          </View>
          <View
            style={{
              flex: 1,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c("border"),
              borderRadius: radius.lg,
              backgroundColor: c("secondary"),
              padding: 10,
              gap: 8,
            }}
          >
            <Pill onPress={() => void onImport()} label={t("set.import")} mono={false} style={{ minHeight: 40 }} />
            <Txt variant="caption" maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 11, lineHeight: 15 }}>
              {nt("set.importHint")}
            </Txt>
          </View>
        </View>
        {msg ? (
          <Txt
            variant="caption"
            maxScale={1.2}
            style={{ color: msg.ok ? c("up") : c("down"), fontSize: 11, lineHeight: 16 }}
          >
            {(msg.ok ? "◆ " : "✕ ") + msg.text}
          </Txt>
        ) : null}
      </Card>

      {/* 各域数据概览：记录数 + 本地占用（web AnimatedNumber 的弹跳在 RN 端
          简化为即时数值；导入/删除经域变更事件即时刷新） */}
      <SectionLabel>{t("set.overview.title")}</SectionLabel>
      <Card>
        {domains.map((d, i) => (
          <View
            key={d.label}
            style={{
              borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: c("border"),
              paddingTop: i === 0 ? 2 : 10,
              paddingBottom: 2,
            }}
          >
            <Row style={{ justifyContent: "space-between" }}>
              <Row style={{ gap: 10, flex: 1 }}>
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: radius.sm,
                    borderWidth: 1,
                    borderColor: c("border"),
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: c("secondary"),
                  }}
                >
                  <Text style={{ color: c("primary"), fontSize: 13, fontFamily: F.mono }}>{d.glyph}</Text>
                </View>
                <View style={{ gap: 2, flex: 1 }}>
                  <Txt variant="body" maxScale={1.3} style={{ fontSize: 14 }}>
                    {d.label}
                  </Txt>
                  <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10 }}>
                    {d.sub}
                  </Txt>
                </View>
              </Row>
              <Txt variant="body" mono maxScale={1.3} style={{ fontFamily: F.mono, fontSize: 15 }}>
                {t("set.count", { n: d.count })}
              </Txt>
            </Row>
          </View>
        ))}
      </Card>

      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10, textAlign: "center", lineHeight: 15, paddingHorizontal: 8 }}>
        {"◆ " + nt("set.note")}
      </Txt>
    </ScreenScroll>
  )
}

