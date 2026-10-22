/**
 * 行情表格共用单元格 — web price-cells.tsx 的 RN 移植：
 *  - LivePrice：价格变动时涨跌色一闪即焚（900ms，与 web flash 时长一致）
 *  - Pct：涨跌幅（近零 ±0.05% 降级弱化色，稳定币不染红绿）
 *  - AssetCell：图标 + 名称 + 代码（图标带 hairline 描边）
 */

import { memo, useEffect, useRef, useState } from "react"
import { Image, View } from "react-native"

import type { Coin } from "@repo/data/api"
import { formatPct, formatPrice } from "@repo/core/format"

import { useAppTheme } from "../lib/theme"
import { Txt } from "./ui"

export const LivePrice = memo(function LivePrice({ price }: { price: number }) {
  const { c } = useAppTheme()
  const prev = useRef<number | null>(null)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)

  useEffect(() => {
    const p = prev.current
    prev.current = price
    if (p != null && p !== price) {
      setFlash(price > p ? "up" : "down")
      const timer = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(timer)
    }
  }, [price])

  return (
    <Txt
      mono
      maxScale={1.3}
      style={{
        fontSize: 14,
        fontWeight: "600",
        fontVariant: ["tabular-nums"],
        color: flash === "up" ? c("up") : flash === "down" ? c("down") : c("foreground"),
      }}
    >
      ${formatPrice(price)}
    </Txt>
  )
})

export const Pct = memo(function Pct({ v }: { v: number | null | undefined }) {
  const { c } = useAppTheme()
  if (v == null) return <Txt maxScale={1.3} style={{ fontSize: 12, color: c("muted-foreground") }}>—</Txt>
  const nearZero = Math.abs(v) < 0.05
  return (
    <Txt
      mono
      maxScale={1.3}
      style={{
        fontSize: 12,
        fontVariant: ["tabular-nums"],
        color: nearZero ? c("muted-foreground") : v >= 0 ? c("up") : c("down"),
      }}
    >
      {formatPct(v)}
    </Txt>
  )
})

/** 资产标识：图标 + 名称 + 代码（行情页与详情页共用同一排版） */
export function AssetCell({ coin, size = 28 }: { coin: Coin; size?: number }) {
  const { c } = useAppTheme()
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 }}>
      <Image
        source={{ uri: coin.image }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: c("border"),
          backgroundColor: c("secondary"),
        }}
        accessibilityLabel={coin.name}
      />
      {/* 名称单行尾省略：行宽不足时「Bitcoin→Bitco…」而非无标截断（a11y 特大号） */}
      <View style={{ flexDirection: "column", flexShrink: 1 }}>
        <Txt variant="body" numberOfLines={1} ellipsizeMode="tail" maxScale={1.3} style={{ fontSize: 14, lineHeight: 17, fontWeight: "600" }}>
          {coin.name}
        </Txt>
        <Txt mono maxScale={1.3} style={{ fontSize: 10, lineHeight: 13, color: c("muted-foreground"), textTransform: "uppercase" }}>
          {coin.symbol}
        </Txt>
      </View>
    </View>
  )
}
