import { useCallback, useEffect, useRef, useState } from "react"

/** 武装态自动复位的等待窗口（ms）：留给用户反应「再点一次确认」 */
const CONFIRM_RESET_MS = 2600

/**
 * 两步破坏性确认（预警/持仓页共用）：第一次点击武装，2.6s 内再点确认执行。
 *
 * 用法：每个确认入口各起一个实例（同一实例共用定时器，
 * 先武装的一方会被后武装的一方顶掉复位窗口）：
 *   const del = useTwoStepConfirm<string>()
 *   onClick={() => { if (del.confirm(id)) remove(id) }}
 *   武装态样式判断：del.armed === id
 */
export function useTwoStepConfirm<K = string>() {
  const [armed, setArmed] = useState<K | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载时清掉待执行的复位 timer
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  /** 点一次武装并返回 false；武装态下再点同 key 返回 true（应执行删除） */
  const confirm = useCallback(
    (key: K): boolean => {
      if (armed === key) {
        setArmed(null)
        if (timer.current) {
          clearTimeout(timer.current)
          timer.current = null
        }
        return true
      }
      setArmed(key)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setArmed((cur) => (cur === key ? null : cur)), CONFIRM_RESET_MS)
      return false
    },
    [armed]
  )

  /** 立即解除武装（执行完删除等场景） */
  const reset = useCallback(() => {
    setArmed(null)
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  return { armed, confirm, reset }
}
