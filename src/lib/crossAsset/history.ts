/**
 * 判断历史与复盘 — 判断落库 localStorage，次日自动打分。
 * 复盘口径见 gradeRecord：优先用两次记录的绝对市值差（真·隔日变化）。
 */

import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"
import { GRADE_TIERS } from "@/lib/thresholds"

import type { Stance, Verdict, VerdictHeadline } from "./verdict"

export interface VerdictRecord {
  date: string
  stance: Stance
  composite: number
  mcapChg24h: number
  /** 记录时的加密总市值绝对值（美元）；旧版存档无此字段 */
  mcapAbs?: number
  /** 旧版存档为纯文本串，新版为结构化标题（渲染层经 headlineText 组词） */
  headline: VerdictHeadline | string
}

export type Grade = "pending" | "correct" | "wrong" | "partial"

const HISTORY_KEY = STORAGE_KEYS.verdictHistory
const MAX_RECORDS = 60

export function loadHistory(): VerdictRecord[] {
  const raw = storageGet(HISTORY_KEY)
  try {
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? (arr as VerdictRecord[]) : []
  } catch {
    return []
  }
}

function saveHistory(list: VerdictRecord[]) {
  storageSet(HISTORY_KEY, JSON.stringify(list.slice(-MAX_RECORDS)))
}

/**
 * 写入/覆盖今日记录，返回更新后的列表（按日期升序）。
 * 落库时机收敛：90s 轮询每次重算都会得到微小漂移的 composite，全量覆盖
 * 既放大写盘、也让「当日终值」取决于最后一次访问时刻。因此仅当今日
 * 尚无记录，或立场翻转、综合分漂移超过 GRADE_TIERS.predictedComposite
 * （值得记录的信号变化）时才写 —— 复盘口径稳定为「当日首次访问时的预测」。
 */
export function upsertToday(v: Verdict): VerdictRecord[] {
  const list = loadHistory()
  const existing = list.find((r) => r.date === v.date)
  if (
    existing &&
    existing.stance === v.stance &&
    Math.abs(existing.composite - v.composite) < GRADE_TIERS.predictedComposite
  ) {
    return list
  }
  const next = existing ? list.filter((r) => r.date !== v.date) : list
  next.push({
    date: v.date,
    stance: v.stance,
    composite: v.composite,
    mcapChg24h: v.mcapChg24h,
    mcapAbs: v.mcapAbs,
    headline: v.headline,
  })
  next.sort((a, b) => (a.date < b.date ? -1 : 1))
  saveHistory(next)
  return next
}

/**
 * 复盘打分：以「次日记录时的总市值相对当日记录时的变化」验证当日立场方向。
 *   立场 composite 超过 ±GRADE_TIERS.predictedComposite 视为看涨/看跌，之间视为中性；
 *   实际变化超 ±GRADE_TIERS.actualDayPct 计为涨/跌，否则横盘 → partial。
 * 优先用两次记录的绝对市值差（真·隔日变化）；旧档无绝对市值时退回
 * 次日记录的 24h 滚动变化（近似口径，含当日白盘时段的波动）。
 */
export function gradeRecord(cur: VerdictRecord, next: VerdictRecord | null): Grade {
  if (!next) return "pending"
  const predicted =
    cur.composite > GRADE_TIERS.predictedComposite ? "up"
    : cur.composite < -GRADE_TIERS.predictedComposite ? "down"
    : "flat"
  const dayPct =
    cur.mcapAbs && next.mcapAbs
      ? ((next.mcapAbs - cur.mcapAbs) / cur.mcapAbs) * 100
      : next.mcapChg24h
  const actual =
    dayPct > GRADE_TIERS.actualDayPct ? "up"
    : dayPct < -GRADE_TIERS.actualDayPct ? "down"
    : "flat"
  if (predicted === actual) return "correct"
  if (predicted === "flat" || actual === "flat") return "partial"
  return "wrong"
}

export function gradeStats(list: VerdictRecord[]) {
  let correct = 0
  let wrong = 0
  let partial = 0
  for (let i = 0; i < list.length - 1; i++) {
    const g = gradeRecord(list[i], list[i + 1])
    if (g === "correct") correct++
    else if (g === "wrong") wrong++
    else partial++
  }
  const total = correct + wrong
  return { correct, wrong, partial, total, hitRate: total ? correct / total : null }
}
