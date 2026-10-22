/**
 * 持仓 CSV 解析 — 纯函数（web/iOS 共享）。表结构 id,symbol,amount,cost；
 * symbol 列只为人类可读,导入以 id 为准(缺失时忽略该行)。
 */


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
