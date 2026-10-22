/**
 * 预警触发引擎 — 挂在 App 根部的无头组件。
 *
 * 实时行情（useLive）每秒批量刷新、或快照（90s 轮询）到达时遍历 active 规则：
 *   实时价缺失的币（不在 TRADE_SYMBOLS 内，如存量稳定币规则）回退快照价；
 *   命中 → 写库（转 triggered）→ 页内 toast → 浏览器通知（已授权时）
 *        → 提示音（Web Audio，开关持久化）→ 移动端振动。
 *
 * 只在本页打开期间工作 —— 纯前端静态站的固有限制，页面文案已如实披露。
 */

import { useEffect, useMemo, useRef } from "react"

import { useLive, useMarket } from "@repo/react/MarketData"
import { t } from "@repo/core/i18n"
import { ALERTS_CHANGE_EVENT, isTriggered, readAlerts, readSound, markTriggered, type AlertRule } from "@repo/core/alerts"
import { alertBeep } from "@/lib/beep"
import { pushToast } from "@/components/ui/toast"
import { formatPrice } from "@repo/core/format"

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
  const { snapshot } = useMarket()

  // 快照价映射：实时推送只覆盖 TRADE_SYMBOLS 内的币，下拉历史口径更宽（曾含
  // tether/usd-coin 等稳定币），这些币的存量规则此前拿不到价、永远不触发 ——
  // 用快照 current_price 兜底后恢复可触发。
  const snapshotPrices = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of snapshot?.coins ?? []) m.set(c.id, c.current_price)
    return m
  }, [snapshot])

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

  // 依赖必须同时含 tickers 与 snapshotPrices：WebSocket 与降级轮询全不可达时
  // tickers 恒为初始空对象（effect 只在挂载时跑一次，彼时快照未到），若不
  // 依赖快照，快照回退永远不被评估 —— 规则照样静默失效。
  useEffect(() => {
    const rules = rulesRef.current
    if (rules.length === 0) return
    for (const rule of rules) {
      if (rule.status !== "active") continue
      const price = tickers[rule.coinId]?.price ?? snapshotPrices.get(rule.coinId)
      if (price == null) continue
      if (isTriggered(rule, price)) {
        markTriggered(rule.id, price)
        fireAlert(rule.coinId, rule.symbol, rule.kind, rule.price, price)
      }
    }
  }, [tickers, snapshotPrices])

  return null
}
