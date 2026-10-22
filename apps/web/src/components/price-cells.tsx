/**
 * 行情表格共用单元格：实时闪动价格、涨跌幅、资产标识。
 */

import { useEffect, useRef, useState } from "react"

import type { Coin } from "@repo/data/api"
import { formatPct, formatPrice } from "@repo/core/format"
import { cn } from "@/lib/utils"

/**
 * 价格变动时闪动一次：背景色 24% 涂层渐隐 + 涨跌着色。
 *
 * 机制说明（两种 flash，不可混用）：
 *  - 本组件是 **state 型 flash**：组件不重挂，靠内部 state 挂/摘类，
 *    适用于长生命周期容器（行情表 / 持仓表单元格）；
 *  - CoinDetail 头部价格是 **key 重挂型 flash**（CoinDetail.tsx 以
 *    key={flash} 重挂触发动画）——该处父容器本身随换币 key 重挂，
 *    value-change 类动效（含 AnimatedNumber）在那里永不触发，不得套用。
 */
export function LivePrice({ price, className }: { price: number; className?: string }) {
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
        "type-num inline-block rounded px-1.5 py-0.5",
        flash === "up" && "flash-up text-up",
        flash === "down" && "flash-down text-down",
        className
      )}
    >
      ${formatPrice(price)}
    </span>
  )
}

export function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground">—</span>
  // 近零涨跌（稳定币 ±0.0x%）降级为弱化色：保留符号但不再全强度染红绿，
  // 避免稀释真实涨跌信号
  const nearZero = Math.abs(v) < 0.05
  return (
    <span className={cn("type-num", nearZero ? "text-muted-foreground" : v >= 0 ? "text-up" : "text-down")}>
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
