/**
 * 自选币种 — localStorage 持久化，同页多组件通过自定义事件同步。
 */

import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "crypto-status:favorites"
const EVENT = "crypto-status:favorites-change"

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* 隐私模式等场景静默失败 */
  }
  window.dispatchEvent(new CustomEvent(EVENT))
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(read)

  useEffect(() => {
    const sync = () => setFavorites(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  const toggle = useCallback((id: string) => {
    const cur = read()
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }, [])

  const has = useCallback((id: string) => favorites.includes(id), [favorites])

  return { favorites, toggle, has }
}
