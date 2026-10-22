import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ALL_STORAGE_KEYS,
  registerStorageBackend,
  storageGet,
  storageHydrated,
  storageSet,
  STORAGE_KEYS,
  __resetStorageBusForTests,
} from "../storageBus"

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

/* ------------------------- 异步后端语义（native 路径） ------------------------- */

/**
 * 受控假时序 AsyncStorage 桩：getItem 挂起，由测试手动放行——精确复现
 * 「注册 → 九键水合读在途 → 业务树误写 → 水合完成」的时序窗口。
 */
function deferredBackend(persisted: Record<string, string>) {
  const pending: Array<{ key: string; resolve: (v: string | null) => void }> = []
  const backend = {
    getItem(key: string) {
      return new Promise<string | null>((resolve) => {
        pending.push({ key, resolve })
      })
    },
    setItem(key: string, value: string) {
      persisted[key] = value
      return Promise.resolve()
    },
  }
  /** 模拟 AsyncStorage 返回：放行全部在途读 */
  const flushReads = () => {
    pending.splice(0).forEach(({ key, resolve }) =>
      resolve(key in persisted ? persisted[key] : null),
    )
  }
  return { backend, flushReads }
}

describe("异步后端（registerStorageBackend）", () => {
  beforeEach(() => {
    __resetStorageBusForTests()
  })

  it("注册后九键全量水合入缓存；读走缓存", async () => {
    vi.unstubAllGlobals() // native：无 localStorage 全局
    const persisted: Record<string, string> = { [STORAGE_KEYS.theme]: "blue" }
    const { backend, flushReads } = deferredBackend(persisted)
    const ready = registerStorageBackend(backend)
    // 水合未完成：读缓存为空
    expect(storageGet(STORAGE_KEYS.theme)).toBeNull()
    flushReads()
    await ready
    // 水合完成：命中持久化值
    expect(storageGet(STORAGE_KEYS.theme)).toBe("blue")
  })

  it("水合前写入缓冲；持久化已存在该键则丢弃（防覆写丢数据）", async () => {
    vi.unstubAllGlobals()
    const persisted: Record<string, string> = {
      [STORAGE_KEYS.verdictHistory]: '[{"date":"2026-10-01"}]',
    }
    const { backend, flushReads } = deferredBackend(persisted)
    // 注册前写入（模块初始化窗口，如 i18n initLocale 首访落盘）先缓冲
    storageSet(STORAGE_KEYS.locale, "zh")
    // 注册后、未水合：基于空读的读-改-写（upsertToday/saveHistory 风险场景）
    const ready = registerStorageBackend(backend)
    storageSet(STORAGE_KEYS.verdictHistory, "[]")
    flushReads()
    await ready
    // locale 持久化不存在 → 首启创建，正常落盘
    expect(storageGet(STORAGE_KEYS.locale)).toBe("zh")
    expect(persisted[STORAGE_KEYS.locale]).toBe("zh")
    // verdictHistory 持久化已存在 → 空读产物被丢弃（判断史首启不丢）
    expect(storageGet(STORAGE_KEYS.verdictHistory)).toBe('[{"date":"2026-10-01"}]')
    expect(persisted[STORAGE_KEYS.verdictHistory]).toBe('[{"date":"2026-10-01"}]')
  })

  it("水合后写入：更新缓存并 fire-and-forget 落盘", async () => {
    vi.unstubAllGlobals()
    const persisted: Record<string, string> = {}
    const { backend, flushReads } = deferredBackend(persisted)
    const ready = registerStorageBackend(backend)
    flushReads()
    await ready
    expect(storageHydrated()).toBe(true)
    storageSet(STORAGE_KEYS.favorites, '["bitcoin"]')
    expect(storageGet(STORAGE_KEYS.favorites)).toBe('["bitcoin"]')
    await Promise.resolve()
    expect(persisted[STORAGE_KEYS.favorites]).toBe('["bitcoin"]')
  })

  it("水合范围覆盖九键全集", async () => {
    vi.unstubAllGlobals()
    const requested: string[] = []
    const backend = {
      getItem(key: string) {
        requested.push(key)
        return Promise.resolve(null)
      },
      setItem() {
        return Promise.resolve()
      },
    }
    const ready = registerStorageBackend(backend)
    await ready
    expect([...requested].sort()).toEqual([...ALL_STORAGE_KEYS].sort())
  })
})
