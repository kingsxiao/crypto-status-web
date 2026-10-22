import { useFonts } from "expo-font"
import Constants from "expo-constants"
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter"
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono"
import { Stack } from "expo-router"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { SafeAreaProvider } from "react-native-safe-area-context"

import { configureCG } from "@repo/data/cg"
import { MarketDataProvider } from "@repo/react/MarketData"

import { configureNotifications } from "../src/lib/notifications"

import { HydrationGate } from "../src/HydrationGate"
import { ThemeProvider } from "../src/lib/theme"

/**
 * 根布局：字体（Inter / JetBrains Mono 与 web 的 Google Fonts 同名同栈，
 * 打包进 app 不依赖网络；失败回退系统 SF/等宽）→ HydrationGate → 主题 →
 * Stack 路由（(tabs) 五席 + coin/[id]/events/alerts/settings/about 详情）。
 * CG demo key 经 app config extra 注入（与 web 的 VITE_CG_KEY 同语义，
 * 空串 = 匿名请求；@repo/data 不读环境变量）。
 * GestureHandlerRootView 全站单点包裹：K 线/概览卡横拖、tools 步进拖拽的
 * GestureDetector 均要求它为祖先（tools 页原局部包裹保留，嵌套无害）。
 */
export default function RootLayout() {
  configureNotifications()
  const cgDemoKey = (Constants.expoConfig?.extra?.cgDemoKey as string | undefined)?.trim()
  configureCG({ demoKey: cgDemoKey || undefined })
  useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  })

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HydrationGate>
        <SafeAreaProvider>
          <ThemeProvider>
            <MarketDataProvider>
              <Stack screenOptions={{ headerShown: false }} />
            </MarketDataProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </HydrationGate>
    </GestureHandlerRootView>
  )
}
