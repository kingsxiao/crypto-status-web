/**
 * 体量参照 — 慢变常量锚点（取自公开研究数据，asof 2026-09），
 * 仅用于与加密总市值的体量对比；加密总市值为实时值，随行情刷新。
 */

import type { MessageKey } from "@/i18n"

export interface MarketAnchor {
  key: string
  /** 展示名（文案 key，渲染层翻译） */
  nameKey: MessageKey
  value: number
  /** 加密总市值为实时值，其余为参考常量 */
  live?: boolean
}

export const MARKET_ANCHORS: MarketAnchor[] = [
  { key: "crypto", nameKey: "anchor.crypto", value: -1, live: true },
  { key: "gold", nameKey: "anchor.gold", value: 31.13e12 },
  { key: "us_equity", nameKey: "anchor.usEquity", value: 64.26e12 },
  { key: "sp500", nameKey: "anchor.sp500", value: 52.95e12 },
  { key: "m2", nameKey: "anchor.m2", value: 23.22e12 },
  { key: "apple", nameKey: "anchor.apple", value: 4.75e12 },
]
