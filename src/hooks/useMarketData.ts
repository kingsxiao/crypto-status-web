import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { t } from "@/i18n"
import { fetchSnapshot, type Snapshot } from "@/lib/api"

const REFRESH_MS = 90_000

export function useMarketData() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  // 请求代际（与 VerdictPage 的 loadGenRef 同一模式）：90s 轮询与手动刷新并发时，
  // 慢的旧响应若在新请求之后返回，代际已过期 → 整个丢弃（含 finally 的收尾
  // 状态），避免旧快照与旧 lastUpdated 覆盖新数据
  const loadGenRef = useRef(0)

  const load = useCallback(async (manual = false) => {
    const gen = ++loadGenRef.current
    if (manual) setRefreshing(true)
    try {
      const snap = await fetchSnapshot()
      if (gen !== loadGenRef.current) return
      // 部分数据源失败（如限流）时沿用上一份快照的对应部分，页面不至于退化
      setSnapshot((prev) => {
        if (!prev) return snap
        return {
          ...snap,
          coins: snap.coins.length ? snap.coins : prev.coins,
          global: snap.global.total_market_cap_usd ? snap.global : prev.global,
          fng: snap.fng.length ? snap.fng : prev.fng,
          btcChart: snap.btcChart.prices.length > 210 ? snap.btcChart : prev.btcChart,
        }
      })
      setError(null)
      setLastUpdated(Date.now())
    } catch (e) {
      if (gen !== loadGenRef.current) return
      setError(e instanceof Error ? e.message : t("common.loadFail"))
    } finally {
      // 过期代际不碰收尾状态（loading/refreshing 归在飞的新请求所有）
      if (gen === loadGenRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [])

  useEffect(() => {
    load()
    timer.current = setInterval(() => load(), REFRESH_MS)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [load])

  // 返回值 memo 化：Provider 因高频实时数据重渲染时保持引用稳定，
  // 避免下游 context 消费者被无意义地牵着重渲染
  const refresh = useCallback(() => load(true), [load])

  return useMemo(
    () => ({ snapshot, error, loading, refreshing, lastUpdated, refresh }),
    [snapshot, error, loading, refreshing, lastUpdated, refresh]
  )
}
