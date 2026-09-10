/**
 * 自选币种 — localStorage 持久化，同页多组件通过自定义事件同步。
 */

import { useCallback, useEffect, useState } from "react"

import { STORAGE_KEYS, storageGet, storageSet } from "@/lib/storage"

const STORAGE_KEY = STORAGE_KEYS.favorites
const EVENT = "crypto-status:favorites-change"

function read(): string[] {
  const raw = storageGet(STORAGE_KEY)
  try {
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : []
  } catch {
    return []
  }
}

function write(ids: string[]) {
  storageSet(STORAGE_KEY, JSON.stringify(ids))
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
