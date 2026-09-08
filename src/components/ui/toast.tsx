/**
 * 轻量 toast — 模块级 store + useSyncExternalStore（与 i18n/theme 同一套单例模式）。
 * 右下角堆叠，自动消退；带 `to` 的条目可点击跳转（Host 须挂在 Router 内）。
 * 目前只服务预警触发通知，刻意保持极简，不引入依赖。
 */

import { useSyncExternalStore } from "react"
import { useNavigate } from "react-router-dom"
import { BellRing, X } from "lucide-react"

import { cn } from "@/lib/utils"

export interface ToastItem {
  id: number
  title: string
  desc?: string
  /** 跳转目标（react-router 路径）；点击即导航 */
  to?: string
  ttlMs?: number
}

let items: ToastItem[] = []
const listeners = new Set<() => void>()
let nextId = 1

function emit() {
  listeners.forEach((fn) => fn())
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function pushToast(t: Omit<ToastItem, "id">): number {
  const id = nextId++
  items = [...items.slice(-3), { ...t, id }] // 最多同屏 4 条
  emit()
  const ttl = t.ttlMs ?? 9000
  setTimeout(() => dismissToast(id), ttl)
  return id
}

export function dismissToast(id: number) {
  if (!items.some((x) => x.id === id)) return
  items = items.filter((x) => x.id !== id)
  emit()
}

function ToastRow({ item }: { item: ToastItem }) {
  const navigate = useNavigate()
  return (
    <div
      role="status"
      className={cn(
        "fade-up pointer-events-auto flex w-[min(92vw,340px)] items-start gap-2.5 rounded-lg border border-border bg-popover/95 p-3.5 shadow-xl backdrop-blur-md",
        item.to && "cursor-pointer transition-colors hover:border-primary/50"
      )}
      onClick={() => {
        if (item.to) {
          dismissToast(item.id)
          navigate(item.to)
        }
      }}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/10 text-primary">
        <BellRing className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug font-semibold">{item.title}</p>
        {item.desc && (
          <p className="mt-0.5 font-mono text-[11px] leading-snug text-muted-foreground">{item.desc}</p>
        )}
      </div>
      <button
        aria-label="dismiss"
        className="shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
        onClick={(e) => {
          e.stopPropagation()
          dismissToast(item.id)
        }}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}

export function ToastHost() {
  const snapshot = useSyncExternalStore(subscribe, () => items)
  if (snapshot.length === 0) return null
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col items-end gap-2"
    >
      {snapshot.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  )
}
