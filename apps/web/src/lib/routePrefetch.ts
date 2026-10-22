/**
 * 路由级 chunk 预取：导航 hover/focus、币种行 hover 时提前拉取目标页面的 JS，
 * 点击时 chunk 已在模块缓存中，路由切换无网络等待。
 * 与 App.tsx 的 React.lazy 引用同一模块，import() 缓存命中不会重复下载；
 * 同一路径只触发一次，失败静默（点击时 lazy 会自行重试）。
 */

const routes: { match: (to: string) => boolean; load: () => Promise<unknown> }[] = [
  { match: (to) => to.startsWith("/coin/"), load: () => import("@/pages/CoinPage") },
  { match: (to) => to === "/markets", load: () => import("@/pages/MarketsPage") },
  { match: (to) => to === "/sentiment", load: () => import("@/pages/SentimentPage") },
  { match: (to) => to === "/verdict", load: () => import("@/pages/VerdictPage") },
  { match: (to) => to === "/converter", load: () => import("@/pages/ConverterPage") },
  { match: (to) => to === "/portfolio", load: () => import("@/pages/PortfolioPage") },
  { match: (to) => to === "/alerts", load: () => import("@/pages/AlertsPage") },
  { match: (to) => to === "/events", load: () => import("@/pages/EventsPage") },
  { match: (to) => to === "/about", load: () => import("@/pages/AboutPage") },
]

const requested = new Set<() => Promise<unknown>>()

export function prefetchRoute(to: string) {
  const route = routes.find((r) => r.match(to))
  if (!route || requested.has(route.load)) return
  requested.add(route.load)
  route.load().catch(() => requested.delete(route.load))
}

/** 空闲时预取主路径页面（总览 → 行情/情绪/判断）。CoinPage 较大，留给行 hover 按需预取。 */
export function prefetchOnIdle() {
  const run = () => {
    prefetchRoute("/markets")
    prefetchRoute("/sentiment")
    prefetchRoute("/verdict")
    prefetchRoute("/portfolio")
    prefetchRoute("/alerts")
    prefetchRoute("/events")
  }
  if ("requestIdleCallback" in window) {
    requestIdleCallback(run, { timeout: 3000 })
  } else {
    setTimeout(run, 2000)
  }
}
