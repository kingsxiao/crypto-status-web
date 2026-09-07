/**
 * 数据层共用 HTTP 工具 —— 带超时的 JSON GET。
 * 超时 abort、非 2xx 抛错（错误信息附 URL 便于定位限流/不可用源）。
 */

export async function fetchJSON<T>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

/** 宽松数字转换：非有限值（缺失/空串/NaN）统一为 null，避免 NaN 渗入图表与指标 */
export function toNum(v: string | number | undefined | null): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
