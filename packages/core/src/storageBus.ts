/**
 * localStorage 集中治理（storageBus）：
 *  - 全站键名的唯一出处（统一 crypto-status: 前缀，九键）
 *  - 读写一律走 safe 访问器：SSR / 测试环境（无 localStorage 全局）与
 *    隐私模式（配额拒绝）都安全降级，模块层无需各自 try-catch
 *  - 历史遗留的两个连字符键（theme / locale）首次读取时自动迁移到新键
 *  - 异步后端语义（RN/AsyncStorage）：注册后九键全量水合入内存缓存；
 *    水合完成前写入进 pendingWrites 缓冲，水合后回放——持久化已存在该键
 *    则丢弃该写（写入基于空读，回放会整体覆写丢数据）；读一律走缓存；
 *    落盘 fire-and-forget；assertStorageReady 供 DEV 断言水合完成。
 *
 * web 端不注册后端：读写直达 localStorage，与迁移前行为逐字一致。
 */

export const STORAGE_KEYS = {
  favorites: "crypto-status:favorites",
  alerts: "crypto-status:alerts",
  alertSound: "crypto-status:alert-sound",
  portfolio: "crypto-status:portfolio",
  verdictHistory: "crypto-status:verdict-history-v1",
  eventReminders: "crypto-status:event-reminders",
  chartPrefs: "crypto-status:chart-prefs",
  theme: "crypto-status:theme",
  locale: "crypto-status:locale",
} as const

/** 九键全集（异步后端注册时的水合范围） */
export const ALL_STORAGE_KEYS: readonly string[] = Object.values(STORAGE_KEYS)

/** 旧命名 → 新键（仅 theme / locale 两个历史连字符键需要迁移） */
const LEGACY_TO_NEW: Record<string, string> = {
  "crypto-status-theme": STORAGE_KEYS.theme,
  "crypto-status-locale": STORAGE_KEYS.locale,
}

/* ------------------------- web 同步后端（默认路径） ------------------------- */

function webStorageGet(key: string): string | null {
  if (typeof localStorage === "undefined") return null
  try {
    const cur = localStorage.getItem(key)
    if (cur != null) return cur
    const legacy = Object.entries(LEGACY_TO_NEW).find(([, newKey]) => newKey === key)?.[0]
    if (!legacy) return null
    const oldVal = localStorage.getItem(legacy)
    if (oldVal == null) return null
    // 首次读到旧键：搬运到新键并清掉旧键，避免双份漂移
    localStorage.setItem(key, oldVal)
    localStorage.removeItem(legacy)
    return oldVal
  } catch {
    return null
  }
}

function webStorageSet(key: string, value: string): void {
  if (typeof localStorage === "undefined") return
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 隐私模式 / 配额满等场景静默失败 */
  }
}

/* --------------------------- 异步后端（native） --------------------------- */

/** AsyncStorage 形后端（RN 由 installNativeRuntime 注入 @react-native-async-storage/async-storage） */
export interface AsyncStorageBackend {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

interface PendingWrite {
  key: string
  value: string
}

let asyncBackend: AsyncStorageBackend | null = null
let hydrated = false
let hydrationPromise: Promise<void> | null = null
let devMode = false
/** 水合完成前的写入缓冲（注册前 + 注册后未水合两段都会进这里） */
const pendingWrites: PendingWrite[] = []
/** 水合后的内存缓存（读走缓存；web 不经此路径） */
const memCache = new Map<string, string>()

const noop = () => {}

/**
 * 注册异步存储后端并启动九键全量水合（native 单点：@repo/platform 的
 * installNativeRuntime 调用，应用代码不得直接调用）。返回水合完成 promise，
 * 供 HydrationGate 等待。
 */
export function registerStorageBackend(
  backend: AsyncStorageBackend,
  opts?: { dev?: boolean },
): Promise<void> {
  if (asyncBackend) return hydrationPromise ?? Promise.resolve()
  asyncBackend = backend
  devMode = opts?.dev ?? false
  hydrationPromise = (async () => {
    const entries = await Promise.all(
      ALL_STORAGE_KEYS.map(async (k) => [k, await backend.getItem(k)] as const),
    )
    for (const [k, v] of entries) if (v != null) memCache.set(k, v)
    hydrated = true
    // 回放水合前缓冲写：持久化已存在该键则丢弃（写入基于空读，回放会覆写
    // 丢数据——upsertToday/saveHistory 整体覆写族的最大风险点）；键不存在
    // 则视为首启创建，正常落盘
    for (const w of pendingWrites) {
      if (memCache.has(w.key)) continue
      memCache.set(w.key, w.value)
      void backend.setItem(w.key, w.value).catch(noop)
    }
    pendingWrites.length = 0
  })()
  return hydrationPromise
}

/** 水合是否完成（web 恒 true：无异步后端即无未水合窗口） */
export function storageHydrated(): boolean {
  return asyncBackend == null || hydrated
}

/** 水合 promise（未注册异步后端时为 null）——HydrationGate / 校正逻辑等待用 */
export function storageReady(): Promise<void> | null {
  return hydrationPromise
}

/**
 * DEV 断言：native 上水合完成前的读-改-写族（upsertToday/saveHistory/
 * favorites 等）有覆写丢数据风险——pendingWrites 会兜底缓冲，但这类调用
 * 仍属时序违规，DEV 下大声告警提示补 HydrationGate 前置。
 */
export function assertStorageReady(): void {
  if (devMode && asyncBackend && !hydrated) {
    console.warn(
      "[storageBus] 写入发生在水合完成前（已进 pendingWrites 缓冲）。" +
        "业务树应置于 HydrationGate 之后，读-改-写族调用前确认 storageReady()。",
    )
  }
}

/* ------------------------------ 统一读写出口 ------------------------------ */

export function storageGet(key: string): string | null {
  if (asyncBackend) return memCache.has(key) ? memCache.get(key)! : null // 读走缓存
  return webStorageGet(key)
}

export function storageSet(key: string, value: string): void {
  if (asyncBackend) {
    assertStorageReady()
    memCache.set(key, value)
    if (!hydrated) {
      pendingWrites.push({ key, value })
      return
    }
    void asyncBackend.setItem(key, value).catch(noop) // fire-and-forget 落盘
    return
  }
  if (typeof localStorage === "undefined" && hydrationPromise === null) {
    // native 注册前（bootstrap 首位 import 之前的模块初始化窗口）：
    // 缓冲待水合裁决，绝不静默丢弃
    pendingWrites.push({ key, value })
    return
  }
  webStorageSet(key, value)
}

/** 仅测试用：重置异步后端模块态（应用代码严禁调用） */
export function __resetStorageBusForTests(): void {
  asyncBackend = null
  hydrated = false
  hydrationPromise = null
  devMode = false
  pendingWrites.length = 0
  memCache.clear()
}
