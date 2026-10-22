import { useCallback, useEffect, useState } from "react"

import { dispatchDomainChange, subscribeDomainChange } from "@repo/core/eventPort"
import { STORAGE_KEYS, storageGet, storageSet } from "@repo/core/storageBus"

/**
 * 自选币种 — storageBus 持久化，同步走双通道端口（自定义变更事件 +
 * 跨标签 storage 事件；原生侧为进程内事件桥）。
 */

const STORAGE_KEY = STORAGE_KEYS.favorites

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
  dispatchDomainChange("favorites")
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(read)

  useEffect(() => subscribeDomainChange("favorites", () => setFavorites(read())), [])

  const toggle = useCallback((id: string) => {
    const cur = read()
    write(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }, [])

  const has = useCallback((id: string) => favorites.includes(id), [favorites])

  return { favorites, toggle, has }
}
