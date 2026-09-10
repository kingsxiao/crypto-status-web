import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { storageGet, storageSet, STORAGE_KEYS } from "@/lib/storage"

/** 最小 localStorage 桩：够 storageGet/storageSet 用 */
function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal(
    "localStorage",
    {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => void (store[k] = v),
      removeItem: (k: string) => void delete store[k],
    } as unknown as Storage,
  )
  return store
}

let store: Record<string, string>

beforeEach(() => {
  store = {}
  stubLocalStorage(store)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("storageGet / storageSet", () => {
  it("常规读写", () => {
    expect(storageGet(STORAGE_KEYS.alerts)).toBeNull()
    storageSet(STORAGE_KEYS.alerts, "[{}]")
    expect(storageGet(STORAGE_KEYS.alerts)).toBe("[{}]")
  })

  it("无 localStorage 全局（SSR/旧测试环境）安全返回 null", () => {
    vi.unstubAllGlobals()
    expect(storageGet(STORAGE_KEYS.theme)).toBeNull()
    expect(() => storageSet(STORAGE_KEYS.theme, "mono")).not.toThrow()
  })
})

describe("旧键迁移", () => {
  it("crypto-status-theme → crypto-status:theme：读时搬运并清旧键", () => {
    store["crypto-status-theme"] = "blue"
    expect(storageGet(STORAGE_KEYS.theme)).toBe("blue")
    expect(store[STORAGE_KEYS.theme]).toBe("blue")
    expect("crypto-status-theme" in store).toBe(false)
    // 二次读取直接命中新键
    expect(storageGet(STORAGE_KEYS.theme)).toBe("blue")
  })

  it("crypto-status-locale → crypto-status:locale", () => {
    store["crypto-status-locale"] = "en"
    expect(storageGet(STORAGE_KEYS.locale)).toBe("en")
    expect("crypto-status-locale" in store).toBe(false)
  })

  it("新键已有值时不看旧键（避免旧值回灌）", () => {
    store["crypto-status-theme"] = "blue"
    store[STORAGE_KEYS.theme] = "violet"
    expect(storageGet(STORAGE_KEYS.theme)).toBe("violet")
    expect(store[STORAGE_KEYS.theme]).toBe("violet")
  })
})
