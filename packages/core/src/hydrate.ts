/**
 * 水合后状态校正 — storageBus 把九键载入缓存后，模块级单例 store
 * （locale / theme）可能仍持有注册前检测出的默认值，此入口统一校正：
 *   - locale：initLocale 在注册前跑（读缓存为空 → 检测语言），持久化真值
 *     入缓存后以持久化为准（不存在则维持检测值——首启语义）
 *   - theme：getTheme 惰性缓存同理，重读持久化值并广播订阅者
 * HydrationGate 在 storageReady() resolve 后调用一次。
 */

import { hydratePersistedLocale } from "./i18n"
import { storageHydrated } from "./storageBus"
import { hydratePersistedTheme } from "./theme"

/** 水合后校正入口（HydrationGate 调用）。未注册异步后端（web）时为 no-op。 */
export function hydratePersistedState(): void {
  if (!storageHydrated()) return
  hydratePersistedLocale()
  hydratePersistedTheme()
}
