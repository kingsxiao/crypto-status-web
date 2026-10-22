/**
 * 「预警与设置」页面组共享件（仅供本组三页 app/{settings,alerts,about}.tsx
 * 引用；不动共享设计系统；置 app/ 外以免被 expo-router 注册为路由）：
 *  ScreenScroll（ScrollView 补 insets.top + 下拉刷新）/ PageHeader（栈页返回
 * + web PageHeader 的 en/标题/描述结构）/ 骨架脉冲 / 空态 / 胶囊与字形按钮 /
 * KindBadge / 分区标签 / 日期格式化。
 *
 * 排版沿用 ui.tsx Txt 的 variant 档（display26/title17/body15/caption13/
 * label12），字族显式指到 expo-font 打包的 Inter / JetBrains Mono（与 web
 * Google Fonts 同名同栈）；色值一律 useAppTheme().c(key)，无裸写 hex。
 */
import { useEffect, useRef, type ReactNode } from "react"
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native"
import { router } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { dateLocale, t } from "@repo/core/i18n"
import { radius } from "@repo/ui-tokens/theme"

import { Card, Txt } from "./ui"
import { useAppTheme } from "../lib/theme"

/** expo-font 打包字族注册名（加载失败时 RN 回退系统 SF / 等宽栈） */
export const F = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semiBold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  mono: "JetBrainsMono_500Medium",
  monoLight: "JetBrainsMono_400Regular",
} as const

/* ------------------------------ 页面容器 ------------------------------ */

/** 详情页滚动容器：headerShown:false 下自带顶部安全区；数据页可接下拉刷新 */
export function ScreenScroll({
  children,
  refresh,
  refreshing,
}: {
  children: ReactNode
  refresh?: () => void
  refreshing?: boolean
}) {
  const { c } = useAppTheme()
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c("background") }}
      contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 32, gap: 12 }}
      refreshControl={
        refresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={refresh}
            tintColor={c("muted-foreground")}
            colors={[c("primary")]}
          />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  )
}

/** 栈页页头：返回（可返回时）+ mono 英文眉题 + 大标题 + 描述 + 右侧动作 */
export function PageHeader({
  en,
  title,
  desc,
  actions,
}: {
  en: string
  title: string
  desc?: string
  actions?: ReactNode
}) {
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ paddingTop: insets.top + 8, gap: 4 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {router.canGoBack() ? (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="back"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <Txt
                variant="title"
                maxScale={1.3}
                style={{
                  color: c("muted-foreground"),
                  fontFamily: F.medium,
                  fontSize: 26,
                  lineHeight: 30,
                  minWidth: 30,
                  textAlign: "center",
                }}
              >
                ‹
              </Txt>
            </Pressable>
          ) : null}
          <View style={{ gap: 2 }}>
            <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 2 }}>
              {en}
            </Txt>
            <Txt variant="display" maxScale={1.3} style={{ fontFamily: F.semiBold, fontSize: 24, lineHeight: 30 }}>
              {title}
            </Txt>
          </View>
        </View>
        {actions ? <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 6 }}>{actions}</View> : null}
      </View>
      {desc ? (
        <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), paddingRight: 8, lineHeight: 18 }}>
          {desc}
        </Txt>
      ) : null}
    </View>
  )
}

/* ------------------------------ 骨架 / 空态 ------------------------------ */

/** 骨架脉冲容器（web skeleton 呼吸感的对应物） */
export function Skel({ children }: { children: ReactNode }) {
  const op = useRef(new Animated.Value(0.5)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(op, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(op, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [op])
  return <Animated.View style={{ opacity: op }}>{children}</Animated.View>
}

/** 骨架条：宽度可传百分比串 */
export function SkBar({ w, h = 12, style }: { w: number | string; h?: number; style?: ViewStyle }) {
  const { c } = useAppTheme()
  return (
    <View
      style={[
        { width: w as ViewStyle["width"], height: h, borderRadius: radius.sm, backgroundColor: c("secondary") },
        style,
      ]}
    />
  )
}

/** 页头骨架（web SkPageHeader 对应物） */
export function SkPageHeader() {
  const insets = useSafeAreaInsets()
  return (
    <Skel>
      <View style={{ paddingTop: insets.top + 10, gap: 10 }}>
        <SkBar w={140} h={10} />
        <SkBar w={230} h={24} />
        <SkBar w="82%" h={12} />
      </View>
    </Skel>
  )
}

/** 表单卡骨架（三行输入剪影） */
export function SkFormCard() {
  return (
    <Card>
      <Skel>
        <View style={{ gap: 8, paddingTop: 4 }}>
          <SkBar w={90} h={12} />
          <SkBar w="100%" h={40} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SkBar w={110} h={40} />
            <SkBar w={150} h={40} />
          </View>
          <SkBar w="60%" h={28} />
        </View>
      </Skel>
    </Card>
  )
}

/** 空态：圆形描边字形 + 标题 + 说明（与 web 各页空态同构） */
export function EmptyState({ glyph, title, desc }: { glyph: string; title: string; desc?: string }) {
  const { c } = useAppTheme()
  return (
    <View style={{ paddingVertical: 28, alignItems: "center", gap: 10 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: c("border"),
          backgroundColor: c("secondary"),
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text style={{ color: c("primary"), fontSize: 18, fontFamily: F.mono }}>{glyph}</Text>
      </View>
      <View style={{ alignItems: "center", gap: 6 }}>
        <Txt variant="body" maxScale={1.3} style={{ fontFamily: F.semiBold, textAlign: "center" }}>
          {title}
        </Txt>
        {desc ? (
          <Txt variant="caption" maxScale={1.3} style={{ color: c("muted-foreground"), textAlign: "center", maxWidth: 280, lineHeight: 18 }}>
            {desc}
          </Txt>
        ) : null}
      </View>
    </View>
  )
}

/* ------------------------------ 触控原语 ------------------------------ */

/** 胶囊按钮：视觉 36-40 高 + hitSlop 6 补足 44pt 命中；按下透明度反馈 */
export function Pill({
  onPress,
  label,
  active,
  tint,
  filled,
  disabled,
  mono = true,
  small,
  style,
}: {
  onPress: () => void
  label: string
  /** 选中态：描边与文字走高亮色 */
  active?: boolean
  tint?: "primary" | "up" | "down"
  /** 实心（主操作）：primary 底 + background 字 */
  filled?: boolean
  disabled?: boolean
  mono?: boolean
  small?: boolean
  style?: ViewStyle
}) {
  const { c } = useAppTheme()
  const hi = c(tint ?? "primary")
  const color = filled ? c("background") : active ? hi : c("muted-foreground")
  const borderColor = filled ? c("primary") : active ? hi : c("border")
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          paddingHorizontal: small ? 10 : 14,
          paddingVertical: small ? 6 : 9,
          minHeight: small ? 32 : 38,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: filled ? c("primary") : "transparent",
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text
        style={{
          color,
          fontSize: small ? 11 : 12,
          letterSpacing: 0.5,
          fontFamily: mono ? F.mono : F.medium,
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

/** 字形按钮（✕ / ↺ / ♪ 等单字符）：36 视觉 + hitSlop 8 ≥ 44pt 命中 */
export function GlyphButton({
  glyph,
  onPress,
  label,
  tone = "muted",
  size = 15,
  strike,
}: {
  glyph: string
  onPress: () => void
  label: string
  tone?: "muted" | "primary" | "up" | "down"
  size?: number
  strike?: boolean
}) {
  const { c } = useAppTheme()
  const color = tone === "down" ? c("down") : tone === "up" ? c("up") : tone === "primary" ? c("primary") : c("muted-foreground")
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          color,
          fontSize: size,
          lineHeight: size + 4,
          fontFamily: F.mono,
          textDecorationLine: strike ? "line-through" : "none",
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  )
}

/* ------------------------------ 小件 ------------------------------ */

/** 币种头像：首字母圆形描边（与 web 表格 avatar 同构） */
export function Avatar({ ch }: { ch: string }) {
  const { c } = useAppTheme()
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: c("border"),
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text style={{ color: c("muted-foreground"), fontSize: 10, fontFamily: F.mono }}>{ch}</Text>
    </View>
  )
}

/** 方向徽标：↑上穿 / ↓下穿，涨跌功能色（全主题共享） */
export function KindBadge({ kind }: { kind: "above" | "below" }) {
  const { c } = useAppTheme()
  const above = kind === "above"
  const color = above ? c("up") : c("down")
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: c("border"),
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
      }}
    >
      <Text style={{ color, fontSize: 10, lineHeight: 12, fontFamily: F.mono }}>{above ? "↑" : "↓"}</Text>
      <Text style={{ color, fontSize: 10, fontFamily: F.mono }}>{t(above ? "al.kind.above" : "al.kind.below")}</Text>
    </View>
  )
}

/** 分区标签：mono 小号大写 + 右侧发丝线（web SectionLabel 对应物） */
export function SectionLabel({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 2 }}>
      <Txt variant="label" mono maxScale={1.2} style={{ color: c("muted-foreground"), fontSize: 10, letterSpacing: 2 }}>
        {children}
      </Txt>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c("border") }} />
    </View>
  )
}

/** 触发时间：MM/DD HH:mm:ss（zh 月/日、en 日/月，随词典 locale） */
export function formatDateTime(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, "0")
  const zh = dateLocale() === "zh-CN"
  const a = zh ? d.getMonth() + 1 : d.getDate()
  const b = zh ? d.getDate() : d.getMonth() + 1
  return p(a) + "/" + p(b) + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds())
}
