/**
 * 行情表格共用单元格：实时闪动价格、涨跌幅、资产标识。
 */

import { useEffect, useRef, useState } from "react"

import type { Coin } from "@/lib/api"
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

/** 资产标识单元格：图标 + 名称 + 代码，行情页与总览页表格共用同一排版 */
export function AssetCell({ coin }: { coin: Coin }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src={coin.image}
        alt=""
        className="size-7 rounded-full border bg-background object-cover grayscale contrast-125"
        loading="lazy"
        decoding="async"
        width={28}
        height={28}
      />
      <div className="flex flex-col">
        <span className="text-sm font-semibold leading-tight">{coin.name}</span>
        <span className="font-mono text-[10px] uppercase leading-tight text-muted-foreground">
          {coin.symbol}
        </span>
      </div>
    </div>
  )
}
