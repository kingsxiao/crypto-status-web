/**
 * 持仓 CSV 导入导出 — 纯展示层 IO(表结构 id,symbol,amount,cost)。
 * 与 lib/backup 的 JSON 备份互补:CSV 面向表格工具(EditSheet/Excel),
 * 仅覆盖持仓一域;symbol 列只为人类可读,导入以 id 为准(缺失时忽略该行)。
 */

import type { Holding } from "@/lib/portfolio"

const CSV_HEADERS = ["id", "symbol", "amount", "cost"] as const

/** 数值直接 String():toFixed 会把大数量截成固定位,反而不利于往返 */
function rowLine(h: Holding, symbol: string): string {
  return [h.id, symbol, String(h.amount), h.cost != null ? String(h.cost) : ""].join(",")
}

/** 触发浏览器下载(a.download 先例见 lib/backup.ts 的 downloadBackup) */
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

export interface CsvHolding {
  id: string
  amount: number
  cost: number | null
  addedAt: number
}

export interface ParseCsvResult {
  /** 可直接 upsert 的行(文件内同 id 重复行取后者,与编辑合并语义一致) */
  rows: CsvHolding[]
  /** 被忽略的数据行数(缺 id / amount 非法等) */
  skipped: number
}

/** 单元格拆分:本表字段均为 id/代码/数字,不含引号转义与逗号内嵌 */
function splitCsvLine(line: string): string[] {
  return line.split(",").map((c) => c.trim())
}

/**
 * 宽容解析:表头列序任意(按表头名定位列),缺 id/amount 列的整体判废;
 * 数据行逐条校验,坏行计数跳过;cost 空/非法视为未记录(null)。
 */
export function parseHoldingsCsv(text: string): ParseCsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { rows: [], skipped: 0 }

  // BOM 容错:Excel 另存的 UTF-8 CSV 首格可能带 \uFEFF
  const header = splitCsvLine(lines[0].replace(/^\uFEFF/, "")).map((h) => h.toLowerCase())
  const colId = header.indexOf("id")
  const colAmount = header.indexOf("amount")
  const colCost = header.indexOf("cost")
  const dataLines = lines.slice(1)
  if (colId < 0 || colAmount < 0) return { rows: [], skipped: dataLines.length }

  const byId = new Map<string, CsvHolding>()
  let skipped = 0
  for (const line of dataLines) {
    const cells = splitCsvLine(line)
    const id = cells[colId] ?? ""
    const amount = Number(cells[colAmount])
    if (!id || !Number.isFinite(amount) || amount <= 0) {
      skipped++
      continue
    }
    const costRaw = colCost >= 0 ? cells[colCost] : ""
    const cost = costRaw != null && costRaw !== "" ? Number(costRaw) : NaN
    byId.set(id, {
      id,
      amount,
      cost: Number.isFinite(cost) && cost > 0 ? cost : null,
      addedAt: Date.now(),
    })
  }
  return { rows: [...byId.values()], skipped }
}
