/**
 * 行情表格共用单元格：实时闪动价格、涨跌幅。
 */

import { useEffect, useRef, useState } from "react"

import { formatPct, formatPrice } from "@/lib/format"
import { cn } from "@/lib/utils"

/** 价格变动时闪动一次：背景色 24% 涂层渐隐 + 涨跌着色 */
export function LivePrice({ price }: { price: number }) {
  const prev = useRef<number | null>(null)
  const [flash, setFlash] = useState<"up" | "down" | null>(null)

  useEffect(() => {
    const p = prev.current
    prev.current = price
    if (p != null && p !== price) {
      setFlash(price > p ? "up" : "down")
      const t = setTimeout(() => setFlash(null), 900)
      return () => clearTimeout(t)
    }
  }, [price])

  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 font-mono font-semibold tabular",
        flash === "up" && "flash-up text-up",
        flash === "down" && "flash-down text-down"
      )}
    >
      ${formatPrice(price)}
    </span>
  )
}

export function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  return (
    <span className={cn("tabular font-mono", v >= 0 ? "text-up" : "text-down")}>
      {formatPct(v)}
    </span>
  )
}
