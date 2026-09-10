export function formatPrice(v: number | null | undefined): string {
  if (v == null) return "—"
  const abs = Math.abs(v)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** 美元大额：$2.41T 风格 */
export function formatUsdCompact(v: number | null | undefined): string {
  if (v == null || v === 0) return "—"
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toFixed(0)}`
}

/** 表单数字解析：容忍逗号小数点与首尾空白，非法输入返回 NaN（由调用方判 Number.isFinite） */
export function parseNum(s: string): number {
  return parseFloat(s.trim().replace(",", "."))
}

/** 数量格式化（持仓/换算器共用）：非有限值 →「—」，大数千分位，小数最多 8 位有效 */
export function formatAmount(v: number): string {
  if (!Number.isFinite(v)) return "—"
  if (v === 0) return "0"
  if (v >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 8 })
  return v.toPrecision(4).replace(/\.?0+$/, "")
}

export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return "—"
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`
}

/** 盯盘标签页标题：BTC $67,123.45 ▲1.20%（跌 ▼，无涨跌幅只显示价格）；无价格返回空串 */
export function formatWatchTitle(
  symbol: string,
  price: number | null | undefined,
  changePct: number | null | undefined,
): string {
  if (price == null) return ""
  const pct =
    changePct == null
      ? ""
      : ` ${changePct >= 0 ? "▲" : "▼"}${Math.abs(changePct).toFixed(2)}%`
  return `${symbol.toUpperCase()} $${formatPrice(price)}${pct}`
}

export function formatTime(ts: number | null): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}
