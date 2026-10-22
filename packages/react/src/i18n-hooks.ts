import { useSyncExternalStore } from "react"

import { getLocale, setLocale, subscribeLocale, t, type Locale } from "@repo/core/i18n"

/**
 * core/i18n 的 react 绑定（core 保持零 react 依赖）：
 * 订阅语言切换的 store 与取词 hook 在此层组装。
 */

export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void } {
  const locale = useSyncExternalStore(subscribeLocale, getLocale)
  return { locale, setLocale }
}

/** 订阅语言切换并返回 t（组件内取词统一入口） */
export function useT() {
  useLocale()
  return t
}
