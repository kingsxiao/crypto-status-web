/**
 * 预警触发引擎 — 挂在 App 根部的无头组件。
 *
 * 实时行情（useLive）每秒批量刷新时遍历 active 规则：
 *   命中 → 写库（转 triggered）→ 页内 toast → 浏览器通知（已授权时）
 *        → 提示音（Web Audio，开关持久化）→ 移动端振动。
 *
 * 只在本页打开期间工作 —— 纯前端静态站的固有限制，页面文案已如实披露。
 */

import { useEffect, useRef } from "react"

import { useLive } from "@/context/MarketDataContext"
import { t } from "@/i18n"
import { ALERTS_CHANGE_EVENT, isTriggered, readAlerts, readSound, markTriggered, type AlertRule } from "@/lib/alerts"
import { alertBeep } from "@/lib/beep"
import { pushToast } from "@/components/ui/toast"
import { formatPrice } from "@/lib/format"

function fireAlert(
  coinId: string,
  symbol: string,
  kind: "above" | "below",
  target: number,
  price: number
) {
  const title = t("al.toast.title", { symbol: symbol.toUpperCase() })
  const desc = t("al.toast.desc", {
    kind: t(kind === "above" ? "al.kind.above" : "al.kind.below"),
    price: formatPrice(price),
    target: formatPrice(target),
  })

  // 1) 页内 toast（点击跳转预警页）
  pushToast({ title, desc, to: "/alerts" })

  // 2) 浏览器通知（已授权时）；点击聚焦并跳预警页
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, {
        body: desc,
        tag: coinId,
      })
      n.onclick = () => {
        window.focus()
        location.hash = "#/alerts"
      }
    } catch {
      /* 部分环境（如部分 WebView）构造失败，忽略 */
    }
  }

  // 3) 提示音 + 振动
  if (readSound()) alertBeep()
  try {
    navigator.vibrate?.([120, 60, 120])
  } catch {
    /* 不支持则跳过 */
  }
}

export function AlertEngine() {
  const tickers = useLive()

  // 规则簿镜像：挂载与库变更（页内写库派发 ALERTS_CHANGE_EVENT、跨标签 storage
  // 事件）时重读。旧实现每秒随行情刷新 JSON.parse 整个规则簿 —— 读取频率应
  // 跟着「规则变了没有」走，而不是跟着「价格变了没有」走。
  const rulesRef = useRef<AlertRule[]>([])
  useEffect(() => {
    const sync = () => {
      rulesRef.current = readAlerts()
    }
    sync()
    window.addEventListener(ALERTS_CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(ALERTS_CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  useEffect(() => {
    const rules = rulesRef.current
    if (rules.length === 0) return
    for (const rule of rules) {
      if (rule.status !== "active") continue
      const price = tickers[rule.coinId]?.price
      if (price == null) continue
      if (isTriggered(rule, price)) {
        markTriggered(rule.id, price)
        fireAlert(rule.coinId, rule.symbol, rule.kind, rule.price, price)
      }
    }
  }, [tickers])

  return null
}
