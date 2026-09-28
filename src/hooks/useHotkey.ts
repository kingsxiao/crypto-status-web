import { useEffect, useRef } from "react"

/**
 * 快捷键基础设施（基础层唯一实现，行情页 '/' 与币种页图表快捷键
 * M/B/F/R/K/数字 共用同一豁免判定，不得各自实现）。
 */

/** 输入态豁免判定：事件目标是 input / textarea / contenteditable 时为 true */
export function isTypingTarget(e: KeyboardEvent): boolean {
  const el = e.target
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
}

export interface UseHotkeyOptions {
  /** 输入框内是否仍然触发（默认 false：输入态豁免） */
  allowInInputs?: boolean
}

/**
 * 全局单键快捷键：按 `key`（不区分大小写）触发 handler。
 * 默认在输入态（input/textarea/contenteditable）与带 Ctrl/Meta/Alt 修饰时豁免，
 * 不拦截浏览器原生组合键。handler 走 ref，调用处可安全传内联函数。
 */
export function useHotkey(
  key: string,
  handler: (e: KeyboardEvent) => void,
  { allowInInputs = false }: UseHotkeyOptions = {}
) {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    const want = key.toLowerCase()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== want) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (!allowInInputs && isTypingTarget(e)) return
      handlerRef.current(e)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [key, allowInInputs])
}

/**
 * 「/」聚焦搜索框：行情页等列表页的通用入口。
 * 输入态按下不抢焦点（正在输入 '/' 的用户不受打扰），并阻止 '/' 落入输入框。
 */
export function useSlashFocus(ref: React.RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/") return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingTarget(e)) return
      e.preventDefault()
      ref.current?.focus()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [ref])
}
