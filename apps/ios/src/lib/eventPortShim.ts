/**
 * eventPort 的 iOS 垫片（metro.config.js resolveRequest 重定向目标）：
 * packages/core/src/eventPort.ts 的 `typeof window !== "undefined"` 守卫在
 * RN 失效——window === global 恒为真，而 window.addEventListener 不存在，
 * 四域 hook（useFavorites/useAlerts/usePortfolio/useEventReminders）订阅即
 * TypeError「undefined is not a function」，六个页面组全部红屏。
 *
 * 本垫片按 core 原文件头注释的设计改为能力检测：
 *  - 真浏览器（addEventListener 可用）→ 双通道 web 行为，与原版逐字等价
 *  - native → 跳过 window 分支，仅走进程内事件桥（installNativeRuntime
 *    在入口 storage-bootstrap 注册；桥未注册时订阅为 no-op，语义同原设计）
 *
 * 维护约定：导出名单必须与 core 原版保持一致（新增导出需双侧同步）。
 */

/** 四域变更事件名单点（backup 导入后按此逐域派发唤醒重读） */
export const DOMAIN_CHANGE_EVENTS = {
  favorites: "crypto-status:favorites-change",
  alerts: "crypto-status:alerts-change",
  portfolio: "crypto-status:portfolio-change",
  eventReminders: "crypto-status:event-reminders-change",
} as const

export type DomainKey = keyof typeof DOMAIN_CHANGE_EVENTS

/** 进程内事件桥（native 注入；web 用不到） */
export interface EventBridge {
  post(event: string): void
  on(event: string, listener: () => void): () => void
}

let bridge: EventBridge | null = null

/**
 * 注册进程内事件桥（native 单点：installNativeRuntime 调用）。
 * 返回前自检桥非 no-op（on 返回的退订函数必须可用），坏桥 DEV 告警。
 */
export function registerEventBridge(b: EventBridge): void {
  const probe = () => {}
  const off = b.on("crypto-status:bridge-probe", probe)
  if (typeof off !== "function") {
    console.warn("[eventPort] 注册的事件桥 on() 未返回退订函数（no-op 桥），native 同步将失效")
  } else {
    off()
  }
  bridge = b
}

/** 事件桥是否已注册（installNativeRuntime 自检 / DEV 诊断用） */
export function eventBridgeRegistered(): boolean {
  return bridge != null
}

/**
 * web 双通道可用性：能力检测而非存在性检测——RN 中 window===global 恒存在
 * 但无 DOM 事件 API（这正是 core 原版守卫放行后崩溃的根因）。
 */
const domEventTarget: Window | null =
  typeof window !== "undefined" &&
  typeof window.addEventListener === "function" &&
  typeof window.removeEventListener === "function"
    ? window
    : null

/**
 * 订阅某域变更（web 双通道）：自定义事件 + window storage 事件（跨标签）；
 * native 下经进程内桥。返回合并退订函数。
 */
export function subscribeDomainChange(key: DomainKey, listener: () => void): () => void {
  const event = DOMAIN_CHANGE_EVENTS[key]
  const offs: Array<() => void> = []
  if (domEventTarget) {
    domEventTarget.addEventListener(event, listener)
    domEventTarget.addEventListener("storage", listener)
    offs.push(
      () => domEventTarget.removeEventListener(event, listener),
      () => domEventTarget.removeEventListener("storage", listener),
    )
  }
  if (bridge) offs.push(bridge.on(event, listener))
  return () => offs.forEach((off) => off())
}

/** 派发某域变更：web 抛 CustomEvent（跨标签由 storage 事件天然承担）；native 走桥 */
export function dispatchDomainChange(key: DomainKey): void {
  const event = DOMAIN_CHANGE_EVENTS[key]
  if (domEventTarget && typeof CustomEvent === "function") {
    domEventTarget.dispatchEvent(new CustomEvent(event))
    return
  }
  bridge?.post(event)
}
