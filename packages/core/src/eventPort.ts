/**
 * 双通道域变更事件端口 — 各域 hook 的同步机制唯一出口：
 *  - 通道一：自定义变更事件（页内写库后派发，同页多组件即时同步）
 *  - 通道二：window "storage" 事件（跨标签页同步）
 * 缺一即 web 跨标签同步静默回归——subscribeDomainChange 同时挂两监听。
 *
 * native（无 window）：走进程内事件桥（@repo/platform 的 installNativeRuntime
 * 单点注册）；桥未注册时订阅为 no-op，由 installNativeRuntime 自检兜底告警。
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
 * 订阅某域变更（双通道）：自定义事件 + window storage 事件（跨标签）；
 * native 下经进程内桥。返回合并退订函数。
 */
export function subscribeDomainChange(key: DomainKey, listener: () => void): () => void {
  const event = DOMAIN_CHANGE_EVENTS[key]
  const offs: Array<() => void> = []
  if (typeof window !== "undefined") {
    window.addEventListener(event, listener)
    window.addEventListener("storage", listener)
    offs.push(
      () => window.removeEventListener(event, listener),
      () => window.removeEventListener("storage", listener),
    )
  }
  if (bridge) offs.push(bridge.on(event, listener))
  return () => offs.forEach((off) => off())
}

/** 派发某域变更：web 抛 CustomEvent（跨标签由 storage 事件天然承担）；native 走桥 */
export function dispatchDomainChange(key: DomainKey): void {
  const event = DOMAIN_CHANGE_EVENTS[key]
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(event))
    return
  }
  bridge?.post(event)
}
