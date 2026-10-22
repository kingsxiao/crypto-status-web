/**
 * 实时行情源常量与纯函数 — 从 realtime.ts 拆出（零 react）：
 *  - TRADE_SYMBOLS / LiveTicker / FeedStatus：web 与 RN 共享的源数据契约
 *  - 消息解析纯函数（Binance miniTicker / OKX tickers / Binance REST 轮询）
 *  - 状态机决策纯函数（live 状态引用稳定性 / 断线降级）
 * 状态机时序参数（FLUSH_MS=1000 / 8s 首消息超时 / gen 代际 / retries=3）
 * 保留在 @repo/react/useRealtime 的 hook 内逐字不动，此处只放可单测的纯逻辑。
 */

export interface LiveTicker {
  price: number
  changePct: number | null
  high: number | null
  low: number | null
  quoteVolume: number | null
  ts: number
}

export type FeedStatus =
  | { mode: "connecting" }
  | { mode: "live"; source: "binance" | "okx" }
  | { mode: "polling" }

/** coinId → 交易所交易对 */
export const TRADE_SYMBOLS: Record<string, { binance: string; okx: string }> = {
  bitcoin: { binance: "BTCUSDT", okx: "BTC-USDT" },
  ethereum: { binance: "ETHUSDT", okx: "ETH-USDT" },
  binancecoin: { binance: "BNBUSDT", okx: "BNB-USDT" },
  solana: { binance: "SOLUSDT", okx: "SOL-USDT" },
  ripple: { binance: "XRPUSDT", okx: "XRP-USDT" },
  cardano: { binance: "ADAUSDT", okx: "ADA-USDT" },
  dogecoin: { binance: "DOGEUSDT", okx: "DOGE-USDT" },
  "avalanche-2": { binance: "AVAXUSDT", okx: "AVAX-USDT" },
  chainlink: { binance: "LINKUSDT", okx: "LINK-USDT" },
  tron: { binance: "TRXUSDT", okx: "TRX-USDT" },
}

/** 每秒批量刷新间隔（状态机参数，hook 使用） */
export const FLUSH_MS = 1000

/** 首消息超时：8s 内无任何消息判定该源不可用进入下一级 */
export const FIRST_MSG_TIMEOUT_MS = 8000

/* ------------------------------ 消息解析（纯） ------------------------------ */

export interface ParsedTick {
  id: string
  ticker: LiveTicker
}

/** 涨跌幅：开盘价缺失/为 0 时无法计算（null） */
function pctFrom(close: number, open: number): number | null {
  return open ? ((close - open) / open) * 100 : null
}

/** 真值转数字：undefined/空串/0 与原实现一致判 null（h/l/q 高低价量不会合法取 0） */
const truthyNum = (v: unknown): number | null => (v ? Number(v) : null)

/**
 * Binance 合并流 miniTicker 消息解析。
 * 返回 null 表示非本流消息（无 data.s 或币种不在监听列表）。
 */
export function parseBinanceMiniTicker(
  msg: unknown,
  byBinance: Map<string, string>,
): ParsedTick | null {
  const m = msg as { data?: { s?: unknown; c?: unknown; o?: unknown; h?: unknown; l?: unknown; q?: unknown; E?: unknown } } | null
  if (!m?.data?.s) return null
  const id = byBinance.get(String(m.data.s))
  if (!id) return null
  const c = Number(m.data.c)
  const o = Number(m.data.o)
  return {
    id,
    ticker: {
      price: c,
      changePct: pctFrom(c, o),
      high: truthyNum(m.data.h),
      low: truthyNum(m.data.l),
      quoteVolume: truthyNum(m.data.q),
      ts: Number(m.data.E) || Date.now(),
    },
  }
}

/**
 * OKX tickers 频道消息解析（一条消息可含多个推送）。
 * 非 tickers 频道或空 data 返回 []。
 */
export function parseOkxTickers(
  msg: unknown,
  byOkx: Map<string, string>,
): ParsedTick[] {
  const m = msg as
    | { arg?: { channel?: unknown }; data?: Array<{ instId?: unknown; last?: unknown; open24h?: unknown; high24h?: unknown; low24h?: unknown; volCcy24h?: unknown; ts?: unknown }> }
    | null
  if (m?.arg?.channel !== "tickers" || !Array.isArray(m.data)) return []
  const out: ParsedTick[] = []
  for (const d of m.data) {
    const id = byOkx.get(d.instId as string)
    if (!id) continue
    const last = Number(d.last)
    const open = Number(d.open24h)
    out.push({
      id,
      ticker: {
        price: last,
        changePct: pctFrom(last, open),
        high: truthyNum(d.high24h),
        low: truthyNum(d.low24h),
        quoteVolume: truthyNum(d.volCcy24h),
        ts: Number(d.ts) || Date.now(),
      },
    })
  }
  return out
}

/** Binance REST 24hr 轮询响应行解析（兜底通道） */
export function parseBinanceRestTicker(
  d: { symbol: unknown; lastPrice: unknown; priceChangePercent: unknown; highPrice: unknown; lowPrice: unknown; quoteVolume: unknown },
  bySymbol: Map<string, string>,
  now = Date.now(),
): ParsedTick | null {
  const id = bySymbol.get(String(d.symbol))
  if (!id) return null
  return {
    id,
    ticker: {
      price: Number(d.lastPrice),
      changePct: d.priceChangePercent ? Number(d.priceChangePercent) : null,
      high: d.highPrice ? Number(d.highPrice) : null,
      low: d.lowPrice ? Number(d.lowPrice) : null,
      quoteVolume: d.quoteVolume ? Number(d.quoteVolume) : null,
      ts: now,
    },
  }
}

/* ------------------------------ 状态机决策（纯） ------------------------------ */

/**
 * live 状态引用稳定性：状态不变时保持原引用（prev），避免每条消息都触发
 * context 消费者重渲染。
 */
export function liveStatusFor(
  prev: FeedStatus,
  source: "binance" | "okx",
): FeedStatus {
  return prev.mode === "live" && prev.source === source
    ? prev
    : { mode: "live", source }
}

/** 断线决策：活跃中断开先原源重试（至多 3 次，1.5s×次数退避），再降级 */
export type ReconnectDecision =
  | { kind: "retry-same"; delayMs: number }
  | { kind: "downgrade" }

export function decideOnClose(retries: number): ReconnectDecision {
  if (retries < 3) {
    return { kind: "retry-same", delayMs: 1500 * (retries + 1) }
  }
  return { kind: "downgrade" }
}
