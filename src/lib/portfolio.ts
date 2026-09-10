/**
 * 持仓组合 — localStorage 持久化的本地持仓簿，不上传任何服务器。
 * 与 useFavorites 同一套「模块级读写 + 自定义事件」同步模式，
 * 同页多组件（页面 / 未来的总览卡）共享同一份数据。
 */

import { useCallback, useEffect, useState } from "react"

import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

/** 一条持仓：每币种一行（重复添加走编辑合并） */
export interface Holding {
  /** coin id，如 "bitcoin" */
  id: string
  /** 持有数量（> 0） */
  amount: number
  /** 该笔持仓的总成本（USD）；null = 未记录，不参与成本盈亏 */
  cost: number | null
  addedAt: number
}

const STORAGE_KEY = STORAGE_KEYS.portfolio
const EVENT = "crypto-status:portfolio-change"

function sanitizeHolding(raw: unknown): Holding | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== "string" || !r.id) return null
  const amount = Number(r.amount)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const cost = r.cost == null ? null : Number(r.cost)
  return {
    id: r.id,
    amount,
    cost: cost != null && Number.isFinite(cost) && cost > 0 ? cost : null,
    addedAt: typeof r.addedAt === "number" ? r.addedAt : Date.now(),
  }
}

function read(): Holding[] {
  const raw = storageGet(STORAGE_KEY)
  try {
    const arr = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr
      .map(sanitizeHolding)
      .filter((h): h is Holding => h !== null)
      .sort((a, b) => a.addedAt - b.addedAt)
  } catch {
    return []
  }
}

function write(list: Holding[]) {
  storageSet(STORAGE_KEY, JSON.stringify(list))
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>(read)

  useEffect(() => {
    const sync = () => setHoldings(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  /** 新增或覆盖一币种持仓（按 id 去重，编辑即覆盖） */
  const upsert = useCallback((h: Holding) => {
    const cur = read().filter((x) => x.id !== h.id)
    write([...cur, h])
  }, [])

  const remove = useCallback((id: string) => {
    write(read().filter((x) => x.id !== id))
  }, [])

  const clear = useCallback(() => write([]), [])

  return { holdings, upsert, remove, clear }
}

/* ------------------------------ 统计（纯函数） ------------------------------ */

/** 页面组装后的价格引用：实时价优先，回退快照价 */
export interface PriceRef {
  price: number
  /** 24h 涨跌幅（%），缺失则该持仓不计入 24H 盈亏 */
  chg24h: number | null
}

export interface PortfolioStats {
  /** 组合总市值（USD） */
  totalValue: number
  /** 有价格的持仓数 / 总持仓数 */
  pricedCount: number
  /** 24H 盈亏额与率（率相对 24h 前市值）；任一持仓缺 24h 数据则为 null */
  pnl24h: number | null
  pnl24hPct: number | null
  /** 记录了成本的持仓合计成本；无任何成本记录时为 null */
  totalCost: number | null
  /** 成本盈亏额与率；totalCost 为 null 时同为 null */
  costPnl: number | null
  costPnlPct: number | null
}

export function computeStats(
  holdings: Holding[],
  prices: Record<string, PriceRef>
): PortfolioStats {
  let totalValue = 0
  let pricedCount = 0
  let valueNow24h = 0 // 参与 24h 计算的部分（有 chg 的）
  let value24hAgo = 0
  let allHave24h = true
  let totalCost = 0
  let hasCost = false

  for (const h of holdings) {
    const ref = prices[h.id]
    if (ref && Number.isFinite(ref.price) && ref.price > 0) {
      totalValue += h.amount * ref.price
      pricedCount++
      if (ref.chg24h != null && Number.isFinite(ref.chg24h) && ref.chg24h > -100) {
        const v = h.amount * ref.price
        valueNow24h += v
        value24hAgo += v / (1 + ref.chg24h / 100)
      } else {
        allHave24h = false
      }
    }
    if (h.cost != null) {
      totalCost += h.cost
      hasCost = true
    }
  }

  // 24H 盈亏只在全部「有价格」的持仓都有 24h 数据时给出，避免口径混拼
  const pnl24h = allHave24h && valueNow24h > 0 ? valueNow24h - value24hAgo : null
  const pnl24hPct = pnl24h != null && value24hAgo > 0 ? (pnl24h / value24hAgo) * 100 : null
  const costPnl = hasCost ? totalValue - totalCost : null
  const costPnlPct = costPnl != null && totalCost > 0 ? (costPnl / totalCost) * 100 : null

  return {
    totalValue,
    pricedCount,
    pnl24h,
    pnl24hPct,
    totalCost: hasCost ? totalCost : null,
    costPnl,
    costPnlPct,
  }
}
