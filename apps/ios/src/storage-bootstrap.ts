/**
 * native 运行时单点注册 — installNativeRuntime：
 *   AsyncStorage 后端（九键全量水合）+ 进程内事件桥。
 * 本模块不得 import 任何业务模块（保持入口首位语义）。
 */

declare const __DEV__: boolean

import { installNativeRuntime } from "@repo/platform/native"

export const storageReady: Promise<void> = installNativeRuntime({
  dev: typeof __DEV__ === "boolean" ? __DEV__ : false,
})
