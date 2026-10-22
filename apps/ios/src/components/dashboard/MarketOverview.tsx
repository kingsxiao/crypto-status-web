import { memo } from "react"
import { Text, View, useWindowDimensions } from "react-native"

import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import type { GlobalData } from "@repo/data/api"
import { formatPct, formatUsdCompact } from "@repo/core/format"

import { useAppTheme } from "../../lib/theme"
import { Card } from "../ui"
import { alpha } from "./color"
import { FONT } from "./util"

interface StatItem {
  glyph: string
  label: string
  value: string
  sub: string
  tone?: "up" | "down"
  subTone?: "up" | "down"
}

function StatCell({ item, wide }: { item: StatItem; wide: boolean }) {
  const { c } = useAppTheme()
  const toneColor = item.tone === "up" ? c("up") : item.tone === "down" ? c("down") : c("foreground")
  const subColor =
    item.subTone === "up" ? c("up") : item.subTone === "down" ? c("down") : c("muted-foreground")
  return (
    <View
      style={{
        width: wide ? undefined : "50%",
        flex: wide ? 1 : undefined,
        paddingHorizontal: 14,
        paddingVertical: 14,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ color: c("primary"), fontSize: 12 }}>{item.glyph}</Text>
        <Text numberOfLines={1} style={{ color: c("muted-foreground"), fontSize: 11, letterSpacing: 0.5 }}>
          {item.label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.3}
        style={{ color: toneColor, fontSize: 17, fontFamily: FONT.monoMed }}
      >
        {item.value}
      </Text>
      <Text numberOfLines={1} style={{ color: subColor, fontSize: 11 }}>
        {item.sub}
      </Text>
    </View>
  )
}

/** 全球市场概览条（2×2 移动 / 4 分格宽屏 + hairline 分隔；限流时降级为提示条） */
export const MarketOverview = memo(function MarketOverview({ global }: { global: GlobalData }) {
  useT()
  const { c } = useAppTheme()
  const { width: winW } = useWindowDimensions()
  const wide = winW >= 768
  const available = global.total_market_cap_usd > 0

  if (!available) {
    return (
      <Card style={{ paddingVertical: 18, paddingHorizontal: 16 }}>
        <Text maxFontSizeMultiplier={1.3} style={{ color: c("muted-foreground"), fontSize: 12, textAlign: "center", lineHeight: 17 }}>
          {t("mo.unavailable")}
        </Text>
      </Card>
    )
  }

  const chgUp = global.market_cap_change_24h_pct >= 0

  const items: StatItem[] = [
    {
      glyph: "◎",
      label: t("mo.mcap"),
      value: formatUsdCompact(global.total_market_cap_usd),
      sub: `24H ${formatPct(global.market_cap_change_24h_pct)}`,
      subTone: chgUp ? "up" : "down",
    },
    {
      glyph: "▮",
      label: t("mo.vol"),
      value: formatUsdCompact(global.total_volume_usd),
      sub: t("mo.active", { n: global.active_cryptocurrencies.toLocaleString() }),
    },
    {
      glyph: "≡",
      label: t("mo.dom"),
      value: `${global.btc_dominance.toFixed(1)}%`,
      sub: `ETH ${global.eth_dominance.toFixed(1)}%`,
    },
    {
      glyph: "↗",
      label: t("mo.chg"),
      value: formatPct(global.market_cap_change_24h_pct),
      tone: chgUp ? "up" : "down",
      sub: chgUp ? t("mo.inflow") : t("mo.outflow"),
    },
  ]

  const divider = alpha(c("border"), 0.6)
  return (
    <Card style={{ padding: 0, gap: 0, flexDirection: "row", flexWrap: wide ? "nowrap" : "wrap" }}>
      {items.map((it, i) => (
        <View
          key={i}
          style={{
            borderLeftWidth: wide ? (i > 0 ? 1 : 0) : i % 2 === 1 ? 1 : 0,
            borderTopWidth: wide ? 0 : i >= 2 ? 1 : 0,
            borderColor: divider,
          }}
        >
          <StatCell item={it} wide={wide} />
        </View>
      ))}
    </Card>
  )
})
