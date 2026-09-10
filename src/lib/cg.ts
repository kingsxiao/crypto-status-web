/**
 * CoinGecko 统一出口 — 所有 CG 请求经此走：
 *  - 同 URL in-flight 去重：并发的相同请求共享一个 Promise，
 *    不重复消耗限流预算（快照与跨资产 top50 这类同源并发因此合并）
 *  - 429 限流自动退避：等 2s 重试一次，仍失败才把错误抛给调用方的降级路径
 *  - 可选 demo key：构建期经 VITE_CG_KEY 注入（缺省匿名请求）
 * CG 免费档只有一个共享预算（匿名 ~10-30 req/min），
 * 请求分散在各模块时无法统一治理，这里是唯一改点。
 */

import { fetchJSON } from "@/lib/http"

const CG = "https://api.coingecko.com/api/v3"
const RETRY_429_MS = 2000

function apiKey(): string | undefined {
  const k = import.meta.env.VITE_CG_KEY
  return typeof k === "string" && k.trim() ? k.trim() : undefined
}

function cgHeaders(): Record<string, string> | undefined {
  const key = apiKey()
  return key ? { "x-cg-demo-api-key": key } : undefined
}

const inflight = new Map<string, Promise<unknown>>()

function once<T>(url: string): Promise<T> {
  const headers = cgHeaders()
  return fetchJSON<T>(url, 15_000, headers).catch((e: unknown) => {
    if ((e as { status?: number } | null)?.status !== 429) throw e
    // 限流：退避后重试一次（fetchJSON 已结束，in-flight 去重不拦截串行重试）
    return new Promise((res) => setTimeout(res, RETRY_429_MS)).then(() =>
      fetchJSON<T>(url, 15_000, headers),
    )
  })
}

export function fetchCG<T>(path: string): Promise<T> {
  const url = `${CG}${path}`
  const existing = inflight.get(url)
  if (existing) return existing as Promise<T>
  const p = once<T>(url).finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}
