import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { usePageMeta } from "@/hooks/usePageMeta"
import { THEMES, useTheme } from "@/hooks/useTheme"

const FEATURES = [
  ["多级容错实时行情", "WebSocket 实时推送，三级降级容错，断线自动重连"],
  ["技术信号推导", "基于 BTC 日线的 MA200/RSI/MACD 等指标合成信号与牛熊状态判定"],
  ["K 线分析", "多周期蜡烛图，叠加 MA/BOLL，副图 RSI/MACD/KDJ"],
  ["行情排序筛选", "按价格、涨跌幅、市值等多列排序，支持搜索与稳定币过滤"],
  ["自选关注", "星标收藏币种，保存在本地浏览器，跨页面同步"],
  ["实时换算器", "基于实时价格的币种 ↔ 美元双向金额换算"],
]

const STACK = ["React 19", "TypeScript", "Vite 7", "Tailwind CSS 4", "React Router 7", "Radix UI", "原生 SVG 图表"]

export function AboutPage() {
  usePageMeta({ title: "关于 · CRYPTO STATUS" })
  const { theme } = useTheme()
  const themeLabel = THEMES.find((t) => t.id === theme)?.en ?? "MONO"

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="About"
        title="关于"
        description={<>CRYPTO STATUS · {themeLabel} EDITION · v2.0</>}
      />

      <Card className="fade-up" style={{ animationDelay: "60ms" }}>
        <CardHeader>
          <CardTitle className="text-base">这是什么</CardTitle>
          <CardDescription>一个纯前端的加密货币市场状态看板</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            CRYPTO STATUS 在一块极简的画布上呈现加密市场的实时行情、技术信号、牛熊状态与情绪指数。
            内置石墨黑白、电光蓝、暗夜紫三套主题色，可随时在右上角切换。
            所有数据直接从浏览器请求公开 API，无后端、无埋点、不收集任何用户数据；自选列表仅保存在你的浏览器 localStorage 中。
          </p>
          <p>
            项目分五个页面：<b className="text-foreground">总览</b>（信号/牛熊/情绪/全球概览）、
            <b className="text-foreground">行情</b>（全币种排序筛选与自选）、
            <b className="text-foreground">情绪</b>（恐惧贪婪指数历史与分布）、
            <b className="text-foreground">换算</b>（实时价格双向换算）与本页。
          </p>
        </CardContent>
      </Card>

      <Card className="fade-up" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardTitle className="text-base">功能特性</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {FEATURES.map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <div className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
              <div>
                <div className="text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{desc}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="fade-up" style={{ animationDelay: "180ms" }}>
        <CardHeader>
          <CardTitle className="text-base">技术栈</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {STACK.map((t) => (
            <span
              key={t}
              className="rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </CardContent>
      </Card>

      <p className="fade-up text-center text-[10px] leading-relaxed text-muted-foreground" style={{ animationDelay: "240ms" }}>
        免责声明：本站所有数据来自第三方公开接口，可能存在延迟、缺失或错误；页面内容仅供参考，不构成任何投资建议。
        数字货币风险极高，请谨慎决策。
      </p>
    </main>
  )
}
