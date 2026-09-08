import { useEffect, useState } from "react"

/**
 * 当前时间心跳：默认 1s 一跳，驱动事件倒计时与状态切换。
 * 页面隐藏（切标签页/最小化）时暂停，回前台立即对齐一次，省电也不漏秒。
 */
export function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const start = () => {
      if (timer != null) return
      setNow(Date.now())
      timer = setInterval(() => setNow(Date.now()), intervalMs)
    }
    const stop = () => {
      if (timer != null) {
        clearInterval(timer)
        timer = undefined
      }
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    start()
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      stop()
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [intervalMs])

  return now
}
