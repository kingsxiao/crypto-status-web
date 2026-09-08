/**
 * 预警触发引擎 — 挂在 App 根部的无头组件。
 *
 * 实时行情（useLive）每秒批量刷新时遍历 active 规则：
 *   命中 → 写库（转 triggered）→ 页内 toast → 浏览器通知（已授权时）
 *        → 提示音（Web Audio，开关持久化）→ 移动端振动。
 *
 * 只在本页打开期间工作 —— 纯前端静态站的固有限制，页面文案已如实披露。
 */

import { useEffect } from "react"

import { useLive } from "@/context/MarketDataContext"
import { t } from "@/i18n"
import { isTriggered, readAlerts, readSound, markTriggered } from "@/lib/alerts"
import { pushToast } from "@/components/ui/toast"
import { formatPrice } from "@/lib/format"

/** 双音短促提示；AudioContext 在无用户手势时可能被拒绝，静默降级 */
function beep() {
  try {
    const ctx = new AudioContext()
    const play = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + dur + 0.02)
    }
    play(880, 0, 0.16)
    play(1174.7, 0.2, 0.22)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    /* 自动播放策略拦截等场景直接放弃 */
  }
}

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
  if (readSound()) beep()
  try {
    navigator.vibrate?.([120, 60, 120])
  } catch {
    /* 不支持则跳过 */
  }
}

export function AlertEngine() {
  const tickers = useLive()

  useEffect(() => {
    // 直接读库而非闭包 state：规则编辑与引擎检查解耦，避免 effect 依赖抖动
    const rules = readAlerts()
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
