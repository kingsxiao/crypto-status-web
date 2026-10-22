/**
 * 实时行情推送 hook — 三级容错链（Binance WS → OKX WS → CoinGecko 轮询兜底）。
 * 消息解析与降级决策纯函数在 @repo/data/realtime-source（可单测）；
 * 状态机时序（FLUSH_MS/首消息超时/gen 代际/retries）在此逐字保留。
 * 每秒批量刷新 state，避免高频推送触发渲染风暴。
 */

/**
 * 实时行情推送 — 三级容错链：
 *   1. Binance 合并 WebSocket 流（miniTicker，约 1s 推送）
 *   2. OKX 公共 WebSocket（tickers 频道）
 *   3. CoinGecko 轮询（20s，兜底）
 *
 * 每秒批量刷新 state，避免高频推送触发渲染风暴。
 */

import { useEffect, useRef, useState } from "react"

import { fetchJSON } from "@repo/data/http"
import {
  decideOnClose,
  FLUSH_MS,
  FIRST_MSG_TIMEOUT_MS,
  liveStatusFor,
  parseBinanceMiniTicker,
  parseBinanceRestTicker,
  parseOkxTickers,
  type FeedStatus,
  type LiveTicker,
} from "@repo/data/realtime-source"

export type { FeedStatus, LiveTicker } from "@repo/data/realtime-source"

export function useRealtime(symbols: Record<string, { binance: string; okx: string }>) {
  const [tickers, setTickers] = useState<Record<string, LiveTicker>>({})
  const [status, setStatus] = useState<FeedStatus>({ mode: "connecting" })

  const latest = useRef<Record<string, LiveTicker>>({})
  const dirty = useRef(false)

  // 节流批量刷新
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirty.current) return
      dirty.current = false
      setTickers({ ...latest.current })
    }, FLUSH_MS)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const ids = Object.keys(symbols)
    if (ids.length === 0) return
    let disposed = false
    let ws: WebSocket | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null
    let firstMsgTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let stage = 0 // 0 binance / 1 okx / 2 polling
    let retries = 0
    // 连接代际：每次进入新阶段递增。旧连接的 onclose / 首消息超时回调
    // 据此失效 —— 否则 8s 超时主动 close 后，旧 onclose 又会再调度一次
    // 重连，产生并行连接且覆盖 ws 引用导致旧连接泄漏。
    let gen = 0
    const byBinance = new Map(ids.map((id) => [symbols[id].binance, id]))
    const byOkx = new Map(ids.map((id) => [symbols[id].okx, id]))

    const gotMessage = () => {
      if (firstMsgTimer) {
        clearTimeout(firstMsgTimer)
        firstMsgTimer = null
      }
    }

    const push = (id: string, t: LiveTicker) => {
      latest.current[id] = t
      dirty.current = true
    }

    /* ---------------- 兜底：Binance REST 轮询 ---------------- */
    let polling = false // 同步防重入：pollTimer 要等首次 poll 完成才赋值，期间可能被重复进入
    const startPolling = async () => {
      if (disposed || pollTimer || polling) return
      polling = true
      stage = 2
      setStatus({ mode: "polling" })
      const poll = async () => {
        if (disposed) return
        try {
          const pairs = ids.map((id) => symbols[id].binance)
          const url =
            `https://api.binance.com/api/v3/ticker/24hr?symbols=` +
            encodeURIComponent(JSON.stringify(pairs))
          const data = await fetchJSON<{
            symbol: string
            lastPrice: string
            priceChangePercent: string
            highPrice: string
            lowPrice: string
            quoteVolume: string
          }[]>(url, 10_000)
          const bySymbol = new Map(ids.map((id) => [symbols[id].binance, id]))
          for (const d of data) {
            const parsed = parseBinanceRestTicker(d, bySymbol)
            if (!parsed) continue
            push(parsed.id, parsed.ticker)
          }
        } catch {
          /* 忽略单次失败 */
        }
      }
      await poll()
      if (disposed) return
      pollTimer = setInterval(poll, 20_000)
    }

    /* ---------------- WebSocket 阶段 ---------------- */
    const startStage = () => {
      if (disposed) return
      if (stage > 1) {
        // 进入轮询前递增代际并清掉挂起的重连：否则旧 socket 的 onclose
        // （gen 未变、retries 刚被清零）仍会再调度一次 startStage →
        // startPolling，与首次轮询并发产生双 interval 且其一泄漏
        ++gen
        if (reconnectTimer) {
          clearTimeout(reconnectTimer)
          reconnectTimer = null
        }
        startPolling()
        return
      }
      const myGen = ++gen
      const source = stage === 0 ? "binance" : "okx"
      setStatus({ mode: "connecting" })
      try {
        ws =
          source === "binance"
            ? new WebSocket(
                `wss://stream.binance.com:9443/stream?streams=` +
                  ids.map((id) => symbols[id].binance.toLowerCase() + "@miniTicker").join("/")
              )
            : new WebSocket("wss://ws.okx.com:8443/ws/v5/public")
      } catch {
        stage++
        startStage()
        return
      }

      // 8 秒内未收到任何消息 → 判定不可用，进入下一级
      firstMsgTimer = setTimeout(() => {
        if (disposed || gen !== myGen) return
        try { ws?.close() } catch { /* noop */ }
        stage++
        retries = 0
        startStage()
      }, FIRST_MSG_TIMEOUT_MS)

      ws.onopen = () => {
        if (source === "okx") {
          ws?.send(
            JSON.stringify({
              op: "subscribe",
              args: ids.map((id) => ({ channel: "tickers", instId: symbols[id].okx })),
            })
          )
        }
      }

      ws.onmessage = (ev) => {
        gotMessage()
        // 状态不变时保持原引用，避免每条消息都触发 context 消费者重渲染
        if (stage <= 1) {
          setStatus((prev) => liveStatusFor(prev, source))
        }
        try {
          const msg = JSON.parse(ev.data as string)
          if (source === "binance") {
            const parsed = parseBinanceMiniTicker(msg, byBinance)
            if (parsed) push(parsed.id, parsed.ticker)
          } else if (source === "okx") {
            for (const p of parseOkxTickers(msg, byOkx)) push(p.id, p.ticker)
          }
        } catch {
          /* 非 JSON 心跳等 */
        }
      }

      ws.onerror = () => {
        /* onclose 紧随其后统一处理 */
      }

      ws.onclose = () => {
        if (disposed || gen !== myGen) return
        // 活跃中断开：先原源重试 3 次，再降级（决策纯函数在 @repo/data）
        const decision = decideOnClose(retries)
        if (decision.kind === "retry-same") {
          retries++
          reconnectTimer = setTimeout(startStage, decision.delayMs)
        } else {
          stage++
          retries = 0
          startStage()
        }
      }
    }

    startStage()

    return () => {
      disposed = true
      if (firstMsgTimer) clearTimeout(firstMsgTimer)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollTimer) clearInterval(pollTimer)
      try { ws?.close() } catch { /* noop */ }
    }
  }, [symbols])

  return { tickers, status }
}
