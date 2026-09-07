import { Suspense, lazy, useEffect } from "react"
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom"

import { BackToTop } from "@/components/layout/BackToTop"
import { Footer } from "@/components/layout/Footer"
import { Header } from "@/components/layout/Header"
import {
  ChartSkeleton,
  SkeletonCard,
  SkHeader,
  SkPageHeader,
  SkProgress,
  StatStripSkeleton,
} from "@/components/loading"
import { Skeleton } from "@/components/ui/skeleton"
import { MarketDataProvider } from "@/context/MarketDataContext"
import { prefetchOnIdle } from "@/lib/routePrefetch"
import { DashboardPage } from "@/pages/DashboardPage"

// 总览页是落地页保持同步加载（首屏直达）；其余页面按路由懒加载
const MarketsPage = lazy(() => import("@/pages/MarketsPage").then((m) => ({ default: m.MarketsPage })))
const CoinPage = lazy(() => import("@/pages/CoinPage").then((m) => ({ default: m.CoinPage })))
const SentimentPage = lazy(() => import("@/pages/SentimentPage").then((m) => ({ default: m.SentimentPage })))
const VerdictPage = lazy(() => import("@/pages/VerdictPage").then((m) => ({ default: m.VerdictPage })))
const ConverterPage = lazy(() => import("@/pages/ConverterPage").then((m) => ({ default: m.ConverterPage })))
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })))

/** 路由切换后回到页面顶部；首屏渲染完成后空闲预取常用路由 chunk */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])
  useEffect(() => {
    prefetchOnIdle()
  }, [])
  return null
}

/** 懒加载页面占位：与各页骨架屏风格一致（页头 + 卡片网格 + 表格剪影） */
function RouteFallback() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-20 pt-6 sm:px-6">
      <SkPageHeader title="w-36" desc="w-64" />
      <div className="grid gap-4 lg:grid-cols-12">
        <SkeletonCard className="min-h-[360px] lg:col-span-5">
          <SkHeader title="w-20" />
          <div className="flex flex-1 flex-col justify-center gap-4">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <SkProgress fill="64%" />
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-full rounded-full bg-secondary/60" />
              <Skeleton className="h-2.5 w-4/5 rounded-full bg-secondary/60" />
            </div>
          </div>
        </SkeletonCard>
        <SkeletonCard className="min-h-[360px] lg:col-span-4">
          <SkHeader title="w-16" />
          <ChartSkeleton className="flex-1" bars={20} />
        </SkeletonCard>
        <SkeletonCard className="min-h-[360px] lg:col-span-3">
          <SkHeader title="w-16" />
          <div className="flex flex-1 flex-col gap-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-full rounded-full bg-secondary/60" />
            ))}
          </div>
        </SkeletonCard>
      </div>
      <StatStripSkeleton />
    </main>
  )
}

export default function App() {
  return (
    <HashRouter>
      <MarketDataProvider>
        <div className="relative flex min-h-screen flex-col bg-background">
          {/* 顶部网格背景 */}
          <div className="grid-backdrop pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />

          <Header />
          <ScrollToTop />

          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/markets" element={<MarketsPage />} />
              <Route path="/coin/:id" element={<CoinPage />} />
              <Route path="/sentiment" element={<SentimentPage />} />
              <Route path="/verdict" element={<VerdictPage />} />
              <Route path="/converter" element={<ConverterPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>

          <Footer />
          <BackToTop />
        </div>
      </MarketDataProvider>
    </HashRouter>
  )
}
