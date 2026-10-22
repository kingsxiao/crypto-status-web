import { useState } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useT } from "@repo/react/i18n"

import { SentimentPane } from "../../src/components/signal/SentimentPane"
import { VerdictPane } from "../../src/components/signal/VerdictPane"
import { hapticSelection } from "../../src/lib/haptics"
import { useAppTheme } from "../../src/lib/theme"

/**
 * 信号与情绪 tab（web /verdict + /sentiment 双页合一）：
 * 顶部分段切换「判断 / 情绪」（分段切换 = selection 触感，≥44pt 命中），
 * 两面板各自持 ScrollView + 下拉刷新（PaneShell）；顶部安全区在此承担，
 * 底部由 Tabs bar 自处理。
 */
export default function Signal() {
  const t = useT()
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const [seg, setSeg] = useState<"verdict" | "sentiment">("verdict")

  const tabs = [
    { key: "verdict" as const, label: t("nav.verdict") },
    { key: "sentiment" as const, label: t("nav.sentiment") },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: c("background") }}>
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingTop: insets.top + 6, paddingBottom: 6 }}>
        {tabs.map((x) => {
          const active = seg === x.key
          return (
            <Pressable
              key={x.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) {
                  hapticSelection()
                  setSeg(x.key)
                }
              }}
              style={{
                flex: 1,
                minHeight: 44,
                justifyContent: "center",
                alignItems: "center",
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: active ? c("primary") : c("border"),
                borderRadius: 8,
                backgroundColor: active ? c("secondary") : "transparent",
                opacity: 1,
              }}
              accessibilityLabel={x.label}
            >
              <Text
                maxFontSizeMultiplier={1.3}
                style={{
                  color: active ? c("foreground") : c("muted-foreground"),
                  fontSize: 14,
                  fontWeight: active ? "600" : "400",
                }}
              >
                {x.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <View style={{ flex: 1 }}>{seg === "verdict" ? <VerdictPane /> : <SentimentPane />}</View>
    </View>
  )
}
