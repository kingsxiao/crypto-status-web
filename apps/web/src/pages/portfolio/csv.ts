/**
 * 持仓 CSV 导出（web 平台 DOM 专属）— 纯解析 parseHoldingsCsv 在 @repo/core/csv。
 */

import type { Holding } from "@repo/core/portfolio"

const CSV_HEADERS = ["id", "symbol", "amount", "cost"] as const

/** 数值直接 String():toFixed 会把大数量截成固定位,反而不利于往返 */
function rowLine(h: Holding, symbol: string): string {
  return [h.id, symbol, String(h.amount), h.cost != null ? String(h.cost) : ""].join(",")
}

/** 触发浏览器下载(a.download 先例见 lib/backupDownload.ts) */
export function exportHoldingsCsv(holdings: Holding[], symbolOf: (id: string) => string): void {
  const lines = [CSV_HEADERS.join(","), ...holdings.map((h) => rowLine(h, symbolOf(h.id)))]
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `crypto-status-portfolio-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  // 立即 revoke 在个别浏览器会截断尚未开始的下载,让出一拍再回收
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
