/**
 * native 运行时注册单点 — 只许 apps/* import（eslint 包边界矩阵锁定）：
 *   - AsyncStorage 注册为 storageBus 异步后端（九键全量水合）
 *   - 进程内事件桥注册为双通道端口的 native 侧通道
 *   - 返回水合 promise：HydrationGate 等它 resolve 后才渲染业务树
 * 装完自检：事件桥非 no-op（registerEventBridge 内 probe + 此处复核）。
 */

import AsyncStorage from "@react-native-async-storage/async-storage"

import { eventBridgeRegistered, registerEventBridge } from "@repo/core/eventPort"
import { registerStorageBackend } from "@repo/core/storageBus"

type Listener = () => void

/** 进程内事件桥：域变更 → 本进程所有订阅者（RN 无跨标签场景） */
function createInProcessBridge() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    post(event: string) {
      listeners.get(event)?.forEach((fn) => fn())
    },
    on(event: string, fn: Listener) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(fn)
      return () => {
        set!.delete(fn)
      }
    },
  }
}

let installed: Promise<void> | null = null

/**
 * 单点注册（幂等）：应用入口 storage-bootstrap 首位调用。
 * dev 参数透传 DEV 断言开关（__DEV__ 全局）。
 */
export function installNativeRuntime(opts?: { dev?: boolean }): Promise<void> {
  if (installed) return installed
  registerEventBridge(createInProcessBridge())
  // 自检：桥必须已注册且非 no-op（registerEventBridge 内部 probe 已验证
  // on() 返回退订函数；此处复核注册态，坏桥直接大声失败）
  if (!eventBridgeRegistered()) {
    throw new Error("[platform] 事件桥注册失败：native 域同步将失效")
  }
  installed = registerStorageBackend(
    {
      getItem: (k) => AsyncStorage.getItem(k),
      setItem: (k, v) => AsyncStorage.setItem(k, v),
    },
    { dev: opts?.dev },
  )
  return installed
}
