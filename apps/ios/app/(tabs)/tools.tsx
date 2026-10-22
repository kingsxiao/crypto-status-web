/**
 * 换算器（tools tab）— web ConverterPage 的 iOS 移植。
 *
 * 功能对齐（apps/web/src/pages/ConverterPage.tsx）：
 *  - 双卡双向换算（币 → USD / USD → 币），中缝 swap 互换两侧币种（图标累计旋转）
 *  - 快捷金额 chips；结果块水平拖拽按数量级步进调额（gesture-handler Pan，
 *    竖向位移让位页面滚动）；单价 / $1,000 折合参考行；AnimatedNumber 涨落动效
 *  - 快速换算参考表：实时价（WebSocket live → 涨跌闪动）、$1,000 ≈ 数量、
 *    24H 涨跌（宽屏列，>=480pt 与 web md 断点语义一致）
 *  - 骨架（首载无快照）/ 错误态（重试）/ 下拉刷新
 *  - 触感：币种选择/快捷额/swap/分段 = selection（统一走 src/lib/haptics 封装）
 *
 * 色值一律 useAppTheme().c(token)（ui-tokens 唯一事实源经 rnColor 程序化转换）；
 * 半透明为 token 色的 alpha 衍生（alpha()），不引入第二份手工色值。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ActionSheetIOS,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
} from "react-native"
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { t } from "@repo/core/i18n"
import { formatAmount, formatPct, formatPrice, parseNum } from "@repo/core/format"
import type { Coin } from "@repo/core/models"
import type { LiveTicker } from "@repo/data/realtime-source"
import { useLive, useMarket } from "@repo/react/MarketData"
import { useT } from "@repo/react/i18n"
import { radius } from "@repo/ui-tokens/theme"

import { Card } from "../../src/components/ui"
import { hapticSelection } from "../../src/lib/haptics"
import { useAppTheme } from "../../src/lib/theme"

const CRYPTO_QUICK = [0.01, 0.1, 0.5, 1, 5, 10, 100]
const USD_QUICK = [
  { v: 100, label: "$100" },
  { v: 1000, label: "$1k" },
  { v: 5000, label: "$5k" },
  { v: 10000, label: "$10k" },
  { v: 100000, label: "$100k" },
]

/* ------------------------------ 拖拽调额（web 同源算法） ------------------------------ */

/** 步进 ≈ 数量级的 1/10（0.5 → 0.01、100 → 1、$1000 → $100） */
function stepFor(v: number): number {
  return Math.pow(10, Math.floor(Math.log10(v)) - 1)
}

/** 按步进的有效小数位取整为干净字符串（0.1 + 0.01*3 → "0.13"） */
function formatStep(v: number, step: number): string {
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9))
  return v.toFixed(dec)
}

/** 结果块水平拖拽 → 按步进增减输入金额（与 web useDragAdjust 同口径：
 *  每次从按下时的起点重算，无闭包过期；键盘路径不受影响）。
 *  runOnJS(true)：回调跑 JS 线程直改 state；activeOffsetX/failOffsetY
 *  让竖向滑动优先交给 ScrollView 滚动。 */
function useDragAdjust(amount: string, set: (v: string) => void) {
  const origin = useRef<{ start: number } | null>(null)
  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-10, 10])
        .failOffsetY([-6, 6])
        .onBegin(() => {
          const cur = parseNum(amount)
          origin.current = Number.isFinite(cur) && cur > 0 ? { start: cur } : null
        })
        .onUpdate((e) => {
          const o = origin.current
          if (!o) return
          const step = stepFor(o.start)
          const next = Math.max(0, o.start + Math.round(e.translationX / 8) * step)
          set(formatStep(next, step))
        })
        .onFinalize(() => {
          origin.current = null
        }),
    [amount, set]
  )
}

/* ------------------------------ 色值 alpha 衍生 ------------------------------ */

/** token 色值 → 半透明衍生（rgb()/hsl()/#hex 改 alpha；不引入第二份色值） */
function alpha(color: string, a: number): string {
  if (color.startsWith("rgb(")) return color.replace(/^rgb\((.*)\)$/, (_m, inner: string) => `rgba(${inner}, ${a})`)
  if (color.startsWith("hsl(")) return color.replace(/^hsl\((.*)\)$/, (_m, inner: string) => `hsla(${inner}, ${a})`)
  if (color.startsWith("#") && color.length === 7) {
    const hx = Math.round(Math.min(1, Math.max(0, a)) * 255)
      .toString(16)
      .padStart(2, "0")
    return color + hx
  }
  return color
}

/* ------------------------------ 微动效原语 ------------------------------ */

/** LIVE 呼吸点（web .live-dot 的 pulse-dot 2s 循环） */
function PulseDot({ size = 6 }: { size?: number }) {
  const { c } = useAppTheme()
  const v = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.35, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    )
    a.start()
    return () => a.stop()
  }, [v])
  return (
    <Animated.View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c("primary"), opacity: v }} />
  )
}

/** 读数动效（web AnimatedNumber 的 iOS 版）：DOM 文本恒为终值，
 *  值变化时叠一次性 translateY ±5px + fade（涨自下而上 / 跌自上而下） */
function AnimatedNumber({
  value,
  format,
  style,
}: {
  value: number
  format: (v: number) => string
  style?: StyleProp<TextStyle>
}) {
  const prev = useRef<number | null>(null)
  const [dir, setDir] = useState<"rise" | "fall" | null>(null)
  const op = useRef(new Animated.Value(1)).current
  const ty = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const p = prev.current
    prev.current = value
    if (p == null || p === value) return
    setDir(value > p ? "rise" : "fall")
    op.setValue(0)
    ty.setValue(value > p ? 5 : -5)
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(ty, { toValue: 0, duration: 550, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setDir(null))
  }, [value, op, ty])
  // 大额读数（如 $84,335.73）单行缩字：a11y 特大号下不折行断成两截
  const fitProps = {
    numberOfLines: 1 as const,
    adjustsFontSizeToFit: true,
    minimumFontScale: 0.4,
    maxFontSizeMultiplier: 2,
  }
  if (dir == null)
    return (
      <Text {...fitProps} style={style}>
        {format(value)}
      </Text>
    )
  return (
    <Animated.Text {...fitProps} style={[style, { opacity: op, transform: [{ translateY: ty }] }]}>
      {format(value)}
    </Animated.Text>
  )
}

/** 骨架脉冲块（web Skeleton + shimmer 的 iOS 对应：透明度呼吸） */
function SkelBlock({ w, h, r = 6, dim = 1 }: { w: number | `${number}%`; h: number; r?: number; dim?: number }) {
  const { c } = useAppTheme()
  const pulse = useRef(new Animated.Value(0.45)).current
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
      ])
    )
    a.start()
    return () => a.stop()
  }, [pulse])
  return (
    <Animated.View
      style={{ width: w, height: h, borderRadius: r, backgroundColor: alpha(c("secondary"), 0.6 * dim), opacity: pulse }}
    />
  )
}

/* ------------------------------ 表单原语 ------------------------------ */

/** 等宽小标签（web .type-label：mono 10px uppercase + 0.12em tracking） */
function Label({ children }: { children: ReactNode }) {
  const { c } = useAppTheme()
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      style={{
        color: c("muted-foreground"),
        fontFamily: "JetBrainsMono_500Medium",
        fontSize: 10,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}
    >
      {children}
    </Text>
  )
}

/** 数字输入框：decimal-pad + mono 数字 + 聚焦描边（web Input 的 focus-visible 对应） */
function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const { c } = useAppTheme()
  const [focus, setFocus] = useState(false)
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={alpha(c("muted-foreground"), 0.5)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        maxFontSizeMultiplier={1.3}
        style={{
          minHeight: 44,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: 10,
          paddingVertical: 10,
          color: c("foreground"),
          borderColor: focus ? alpha(c("foreground"), 0.6) : c("input"),
          backgroundColor: c("background"),
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 17,
        }}
      />
    </View>
  )
}

/** 币种选择：原生 ActionSheet（12 币全集来自共享快照；userInterfaceStyle dark 对齐纯暗色盘） */
function CoinSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: Coin[]
}) {
  const { c } = useAppTheme()
  const current = options.find((o) => o.id === value)
  const open = () => {
    hapticSelection()
    const labels = options.map((o) => `${o.symbol.toUpperCase()} · ${o.name}`)
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...labels, t("common.cancel")],
        cancelButtonIndex: labels.length,
        userInterfaceStyle: "dark",
      },
      (i) => {
        if (i >= 0 && i < options.length) onChange(options[i].id)
      }
    )
  }
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t("coin.selectLabel")}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 44,
          borderWidth: 1,
          borderRadius: radius.md,
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderColor: c("input"),
          backgroundColor: c("background"),
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          color: c("foreground"),
          fontFamily: "JetBrainsMono_500Medium",
          fontSize: 13,
        }}
      >
        {current ? `${current.symbol.toUpperCase()} · ${current.name}` : "—"}
      </Text>
      <Text style={{ color: c("muted-foreground"), fontSize: 10 }}>▾</Text>
    </Pressable>
  )
}

/** 快捷金额 chips：视觉 36pt + hitSlop 4 → 有效命中 ≥44pt（HIG 触控） */
function QuickChips({ items, onPick }: { items: string[]; onPick: (v: string) => void }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {items.map((q) => (
        <Pressable
          key={q}
          hitSlop={4}
          onPress={() => {
            hapticSelection()
            onPick(q)
          }}
          accessibilityRole="button"
          style={({ pressed }) => [
            {
              minHeight: 36,
              minWidth: 44,
              paddingHorizontal: 12,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: 1,
              borderRadius: radius.sm,
              borderColor: pressed ? alpha(c("foreground"), 0.5) : c("border"),
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11 }}>
            {q}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

/** 结果块（可拖拽调额）：≈ 读数 + 单价参考行 + 拖动提示 */
function ResultBlock({
  label,
  value,
  format,
  meta,
  gesture,
}: {
  label: string
  value: number | null
  format: (v: number) => string
  meta: string | null
  gesture: ReturnType<typeof Gesture.Pan>
}) {
  const { c } = useAppTheme()
  return (
    <GestureDetector gesture={gesture}>
      <View style={{ borderRadius: radius.lg, backgroundColor: alpha(c("secondary"), 0.6), padding: 14, gap: 6 }}>
        <Label>{label}</Label>
        {value != null ? (
          <AnimatedNumber
            value={value}
            format={format}
            style={{
              color: c("foreground"),
              fontFamily: "JetBrainsMono_500Medium",
              fontSize: 30,
              lineHeight: 34,
              letterSpacing: -0.6,
            }}
          />
        ) : (
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 30, lineHeight: 34 }}
          >
            —
          </Text>
        )}
        {meta && (
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize: 11, lineHeight: 16 }}
          >
            {meta}
          </Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
          <Text style={{ color: alpha(c("muted-foreground"), 0.6), fontSize: 11 }}>↔</Text>
          <Text
            maxFontSizeMultiplier={1.3}
            style={{ color: alpha(c("muted-foreground"), 0.6), fontFamily: "JetBrainsMono_400Regular", fontSize: 10 }}
          >
            {t("cv.dragHint")}
          </Text>
        </View>
      </View>
    </GestureDetector>
  )
}

/* ------------------------------ 参考表 ------------------------------ */

/** 资产标识：黑白极简 monogram（web AssetCell 的图标在 iOS 用首字母圆片对应） */
function AssetCell({ coin }: { coin: Coin }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: alpha(c("border"), 0.9),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 11 }}>
          {coin.symbol.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={{ minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: c("foreground"), fontSize: 13, fontWeight: "600" }}>
          {coin.name}
        </Text>
        <Text
          style={{
            color: c("muted-foreground"),
            fontFamily: "JetBrainsMono_400Regular",
            fontSize: 9,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          {coin.symbol}
        </Text>
      </View>
    </View>
  )
}

/** 实时价：变化时 900ms 涨跌闪动着色（web LivePrice state 型 flash） */
function LivePrice({ price, big = false }: { price: number; big?: boolean }) {
  const { c } = useAppTheme()
  const prev = useRef<number | null>(null)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)
  useEffect(() => {
    const p = prev.current
    prev.current = price
    if (p != null && p !== price) {
      setFlash(price > p ? "up" : "down")
      const id = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(id)
    }
  }, [price])
  return (
    <Text
      style={{
        fontFamily: "JetBrainsMono_500Medium",
        fontSize: big ? 17 : 13,
        color: flash === "up" ? c("up") : flash === "down" ? c("down") : c("foreground"),
      }}
    >
      ${formatPrice(price)}
    </Text>
  )
}

/** 涨跌幅：近零降级弱化色（web Pct 同口径） */
function Pct({ v, fontSize = 12 }: { v: number | null; fontSize?: number }) {
  const { c } = useAppTheme()
  if (v == null) {
    return <Text style={{ color: c("muted-foreground"), fontFamily: "JetBrainsMono_400Regular", fontSize }}>—</Text>
  }
  const nearZero = Math.abs(v) < 0.05
  return (
    <Text
      style={{
        fontFamily: "JetBrainsMono_400Regular",
        fontSize,
        color: nearZero ? c("muted-foreground") : v >= 0 ? c("up") : c("down"),
      }}
    >
      {formatPct(v)}
    </Text>
  )
}

/** 快速换算参考表：窄屏 3 列（资产 / 实时价 / $1,000 ≈），宽屏追加 24H 列 */
function QuickTable({
  coins,
  tickers,
  wide,
}: {
  coins: Coin[]
  tickers: Record<string, LiveTicker>
  wide: boolean
}) {
  const { c } = useAppTheme()
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 6,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: alpha(c("border"), 0.7),
        }}
      >
        <Text style={[s.th, { color: c("muted-foreground"), flex: 1 }]}>{t("common.col.asset")}</Text>
        <View style={s.colPrice}>
          <Text style={[s.th, { color: c("muted-foreground"), textAlign: "right" }]}>{t("cv.col.livePrice")}</Text>
        </View>
        <View style={s.colAmount}>
          <Text style={[s.th, { color: c("muted-foreground"), textAlign: "right" }]}>{t("cv.col.per1000")}</Text>
        </View>
        {wide && (
          <View style={s.colPct}>
            <Text style={[s.th, { color: c("muted-foreground"), textAlign: "right" }]}>24H</Text>
          </View>
        )}
      </View>
      {coins.map((coin, i) => {
        const live = tickers[coin.id]
        const p = live?.price ?? coin.current_price
        const chg = live?.changePct ?? coin.price_change_percentage_24h_in_currency ?? null
        return (
          <View
            key={coin.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              minHeight: 46,
              borderBottomWidth: i === coins.length - 1 ? 0 : StyleSheet.hairlineWidth,
              borderBottomColor: alpha(c("border"), 0.5),
            }}
          >
            <AssetCell coin={coin} />
            <View style={s.colPrice}>
              <LivePrice price={p} />
            </View>
            <View style={s.colAmount}>
              <Text style={{ color: c("foreground"), fontFamily: "JetBrainsMono_500Medium", fontSize: 13, textAlign: "right" }}>
                {p > 0 ? formatAmount(1000 / p) : "—"}
              </Text>
            </View>
            {wide && (
              <View style={s.colPct}>
                <Pct v={chg} />
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

/* ------------------------------ 页头 / 骨架 / 错误 ------------------------------ */

/** 页头（web PageHeader 的节奏：眉题 EN + 标题 + 副标题） */
function Head({ en, title, desc }: { en: string; title: string; desc: string }) {
  const { c } = useAppTheme()
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text
          style={{
            color: c("primary"),
            fontFamily: "JetBrainsMono_500Medium",
            fontSize: 10,
            letterSpacing: 3.2,
            textTransform: "uppercase",
          }}
        >
          {en}
        </Text>
        <View style={{ width: 24, height: StyleSheet.hairlineWidth, backgroundColor: alpha(c("primary"), 0.4) }} />
      </View>
      <Text maxFontSizeMultiplier={1.35} style={{ color: c("foreground"), fontSize: 22, fontWeight: "700", letterSpacing: 0.2 }}>
        {title}
      </Text>
      <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 17 }}>
        {desc}
      </Text>
    </View>
  )
}

/** 换算双卡骨架（web 首载 SkeletonCard 的 iOS 对应） */
function ConverterSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <Card key={i}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <SkelBlock w={26} h={26} r={6} />
            <View style={{ gap: 6 }}>
              <SkelBlock w={128} h={14} r={4} />
              <SkelBlock w={160} h={8} r={4} dim={0.7} />
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <SkelBlock w="50%" h={44} r={8} />
            <SkelBlock w="50%" h={44} r={8} dim={0.7} />
          </View>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[0, 1, 2, 3].map((j) => (
              <SkelBlock key={j} w={48} h={36} r={6} dim={0.7} />
            ))}
          </View>
          <View style={{ borderRadius: radius.lg, backgroundColor: "transparent", padding: 14, gap: 8 }}>
            <SkelBlock w={80} h={8} r={4} />
            <SkelBlock w={144} h={30} r={8} />
            <SkelBlock w={112} h={8} r={4} dim={0.8} />
          </View>
        </Card>
      ))}
    </>
  )
}

/* ------------------------------ 页面 ------------------------------ */

export default function Tools() {
  useT() // 订阅语言切换（语言切换时本页重渲染取词）
  const { c } = useAppTheme()
  const insets = useSafeAreaInsets()
  const { width: winW } = useWindowDimensions()
  const { snapshot, loading, error, refreshing, refresh } = useMarket()
  const tickers = useLive()

  const coins = useMemo(() => snapshot?.coins ?? [], [snapshot])
  const [cryptoId, setCryptoId] = useState("bitcoin")
  const [cryptoAmt, setCryptoAmt] = useState("1")
  const [usdTargetId, setUsdTargetId] = useState("ethereum")
  const [usdAmt, setUsdAmt] = useState("1000")
  // swap 累计旋转角：每次 +180°，Animated timing 一次性转过去（不走 keyframes）
  const spinDeg = useRef(new Animated.Value(0)).current
  const spinRot = spinDeg.interpolate({ inputRange: [-1e9, 1e9], outputRange: ["-1e9deg", "1e9deg"] })
  const [swapTurns, setSwapTurns] = useState(0)

  const priceOf = (id: string) => {
    const coin = coins.find((x) => x.id === id)
    if (!coin) return null
    return tickers[id]?.price ?? coin.current_price
  }

  const cryptoPrice = priceOf(cryptoId)
  const usdTargetPrice = priceOf(usdTargetId)
  const cryptoNum = parseNum(cryptoAmt)
  const usdNum = parseNum(usdAmt)

  const usdResult = cryptoPrice != null && Number.isFinite(cryptoNum) ? cryptoNum * cryptoPrice : null
  const coinResult =
    usdTargetPrice != null && Number.isFinite(usdNum) && usdTargetPrice > 0 ? usdNum / usdTargetPrice : null

  const activeCoin = coins.find((x) => x.id === cryptoId)
  const targetCoin = coins.find((x) => x.id === usdTargetId)

  /** 互换两侧币种（方向随之对调）：左卡币种 ↔ 右卡目标币种，金额不动 */
  const swap = () => {
    hapticSelection()
    setCryptoId(usdTargetId)
    setUsdTargetId(cryptoId)
    const next = swapTurns + 1
    setSwapTurns(next)
    Animated.timing(spinDeg, { toValue: next * 180, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
  }

  const dragCrypto = useDragAdjust(cryptoAmt, setCryptoAmt)
  const dragUsd = useDragAdjust(usdAmt, setUsdAmt)

  const firstLoad = loading && !snapshot
  const failed = error != null && !snapshot

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c("background") }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 12, paddingBottom: 28, gap: 12 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refresh()} tintColor={c("primary")} progressBackgroundColor={c("card")} />
        }
      >
        <Head en="Converter" title={t("page.converter.title")} desc={t("page.converter.desc")} />

        {failed ? (
          <Card>
            <Text style={{ color: c("foreground"), fontSize: 14, fontWeight: "600" }}>{t("common.loadFail")}</Text>
            <Text style={{ color: c("muted-foreground"), fontSize: 12 }}>{error}</Text>
            <Pressable
              onPress={() => refresh()}
              accessibilityRole="button"
              hitSlop={4}
              style={({ pressed }) => [
                {
                  alignSelf: "flex-start",
                  minHeight: 44,
                  justifyContent: "center",
                  paddingHorizontal: 14,
                  borderWidth: 1,
                  borderRadius: radius.md,
                  borderColor: c("border"),
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={{ color: c("foreground"), fontSize: 13 }}>{t("common.retry")}</Text>
            </Pressable>
          </Card>
        ) : firstLoad ? (
          <ConverterSkeleton />
        ) : (
          <>
            {/* 加密货币 → USD */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={[
                    s.iconChip,
                    { borderColor: alpha(c("primary"), 0.3), backgroundColor: alpha(c("primary"), 0.1) },
                  ]}
                >
                  <Text style={{ color: c("primary"), fontFamily: "JetBrainsMono_500Medium", fontSize: 13 }}>₿</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c("foreground"), fontSize: 15, fontWeight: "600" }}>
                    {t("cv.crypto2usd")}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c("muted-foreground"), fontSize: 12 }}>
                    {t("cv.crypto2usdDesc")}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <NumField label={t("cv.amount")} value={cryptoAmt} onChange={setCryptoAmt} placeholder="0.00" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Label>{t("cv.asset")}</Label>
                  <CoinSelect value={cryptoId} onChange={setCryptoId} options={coins} />
                </View>
              </View>
              <QuickChips items={CRYPTO_QUICK.map(String)} onPick={setCryptoAmt} />
              <ResultBlock
                label={t("cv.approxUsd")}
                value={usdResult}
                format={(v) => `$${formatPrice(v)}`}
                meta={
                  activeCoin && cryptoPrice != null
                    ? `1 ${activeCoin.symbol.toUpperCase()} = $${formatPrice(cryptoPrice)}`
                    : null
                }
                gesture={dragCrypto}
              />
            </Card>

            {/* 中缝：互换两侧币种（窄屏堆叠时落在两卡之间） */}
            <View style={{ alignItems: "center" }}>
              <Pressable
                onPress={swap}
                accessibilityRole="button"
                accessibilityLabel={t("cv.swap")}
                hitSlop={4}
                style={({ pressed }) => [
                  {
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    borderWidth: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderColor: pressed ? alpha(c("foreground"), 0.5) : c("border"),
                    backgroundColor: c("card"),
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Animated.Text style={{ color: c("muted-foreground"), fontSize: 16, transform: [{ rotate: spinRot }] }}>
                  ⇅
                </Animated.Text>
              </Pressable>
            </View>

            {/* USD → 加密货币 */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View
                  style={[
                    s.iconChip,
                    { borderColor: alpha(c("primary"), 0.3), backgroundColor: alpha(c("primary"), 0.1) },
                  ]}
                >
                  <Text style={{ color: c("primary"), fontFamily: "JetBrainsMono_500Medium", fontSize: 13 }}>$</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c("foreground"), fontSize: 15, fontWeight: "600" }}>
                    {t("cv.usd2crypto")}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c("muted-foreground"), fontSize: 12 }}>
                    {t("cv.usd2cryptoDesc")}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <NumField label={t("cv.usdAmount")} value={usdAmt} onChange={setUsdAmt} placeholder="1000" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Label>{t("cv.targetAsset")}</Label>
                  <CoinSelect value={usdTargetId} onChange={setUsdTargetId} options={coins} />
                </View>
              </View>
              <QuickChips items={USD_QUICK.map((q) => q.label)} onPick={(label) => setUsdAmt(String(USD_QUICK.find((q) => q.label === label)?.v ?? 0))} />
              <ResultBlock
                label={`≈ ${targetCoin ? targetCoin.symbol.toUpperCase() : t("cv.coinFallback")}`}
                value={coinResult}
                format={(v) => formatAmount(v)}
                meta={
                  targetCoin && usdTargetPrice != null
                    ? `$1,000 = ${formatAmount(1000 / usdTargetPrice)} ${targetCoin.symbol.toUpperCase()}`
                    : null
                }
                gesture={dragUsd}
              />
            </Card>

            {/* 快速换算参考 */}
            <Card>
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: c("foreground"), fontSize: 15, fontWeight: "600" }}>
                    {t("cv.quickTitle")}
                  </Text>
                  <Text numberOfLines={2} style={{ color: c("muted-foreground"), fontSize: 12, lineHeight: 16 }}>
                    {t("cv.quickDesc")}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingTop: 4 }}>
                  <PulseDot />
                  <Text
                    style={{
                      color: c("muted-foreground"),
                      fontFamily: "JetBrainsMono_400Regular",
                      fontSize: 10,
                      letterSpacing: 1,
                    }}
                  >
                    LIVE
                  </Text>
                </View>
              </View>
              <QuickTable coins={coins.slice(0, 10)} tickers={tickers} wide={winW >= 480} />
            </Card>

            <Text
              maxFontSizeMultiplier={1.3}
              style={{ color: c("muted-foreground"), fontSize: 10, lineHeight: 15, textAlign: "center" }}
            >
              {t("cv.disclaimer")}
            </Text>
          </>
        )}
      </ScrollView>
    </GestureHandlerRootView>
  )
}

const s = StyleSheet.create({
  iconChip: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  th: {
    fontSize: 10,
    fontFamily: "JetBrainsMono_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  colPrice: { width: 92, alignItems: "flex-end" },
  colAmount: { width: 88, alignItems: "flex-end" },
  colPct: { width: 64, alignItems: "flex-end" },
})
