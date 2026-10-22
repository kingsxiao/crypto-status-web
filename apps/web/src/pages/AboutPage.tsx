import { NavLink } from "react-router-dom"
import {
  ArrowUpDown,
  BellRing,
  CalendarClock,
  CandlestickChart,
  Repeat,
  Scale,
  Sigma,
  Star,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { t, type MessageKey } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { THEMES, useTheme } from "@repo/react/theme"

const FEATURES: [MessageKey, MessageKey, LucideIcon][] = [
  ["about.f1.title", "about.f1.desc", Zap],
  ["about.f2.title", "about.f2.desc", Sigma],
  ["about.f3.title", "about.f3.desc", CandlestickChart],
  ["about.f4.title", "about.f4.desc", ArrowUpDown],
  ["about.f5.title", "about.f5.desc", Star],
  ["about.f6.title", "about.f6.desc", Repeat],
  ["about.f7.title", "about.f7.desc", Wallet],
  ["about.f8.title", "about.f8.desc", BellRing],
  ["about.f9.title", "about.f9.desc", CalendarClock],
  ["about.f10.title", "about.f10.desc", Scale],
]

/** 页面清单：名称取词典 key，括注一句定位（desc 值自带顿号/逗号与句读），
 * 第三项为路由链接；「币种详情」路由需具体 id，固定指演示对象 bitcoin */
const PAGES: [MessageKey, MessageKey, string][] = [
  ["nav.dashboard", "about.pg.dash", "/"],
  ["nav.markets", "about.pg.markets", "/markets"],
  ["about.pg.coinName", "about.pg.coin", "/coin/bitcoin"],
  ["nav.sentiment", "about.pg.sentiment", "/sentiment"],
  ["nav.verdict", "about.pg.verdict", "/verdict"],
  ["nav.converter", "about.pg.converter", "/converter"],
  ["nav.portfolio", "about.pg.portfolio", "/portfolio"],
  ["nav.alerts", "about.pg.alerts", "/alerts"],
  ["nav.events", "about.pg.events", "/events"],
  ["nav.about", "about.pg.about", "/about"],
]

const STACK = ["React 19", "TypeScript", "Vite 7", "Tailwind CSS 4", "React Router 7", "Radix UI", "原生 SVG 图表"]

export function AboutPage() {
  useT()
  usePageMeta({ title: t("meta.about"), description: t("page.about.desc") })
  const { theme } = useTheme()
  const themeLabel = THEMES.find((th) => th.id === theme)?.en ?? "MONO"

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader
        en="About"
        title={t("page.about.title")}
        description={<>CRYPTO STATUS · {themeLabel} EDITION · v2.0</>}
      />

      <Card>
        <CardHeader>
          <CardHead title={t("about.what.title")} desc={t("about.what.desc")} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{t("about.what.p1")}</p>
          <p>
            {t("about.what.p2a")}
            {PAGES.map(([key, desc, to]) => (
              <span key={key}>
                {/* 页名升级为路由链接：虚线脚注线暗示可跳转，hover 才亮 primary */}
                <NavLink
                  to={to}
                  className="font-semibold text-foreground underline decoration-border decoration-dashed underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
                >
                  {t(key)}
                </NavLink>
                {t(desc)}
              </span>
            ))}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHead title={t("about.features.title")} desc={t("about.features.desc")} />
        </CardHeader>
        <CardContent className="stagger grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {FEATURES.map(([title, desc, Icon]) => (
            <div key={title} className="flex gap-3">
              <IconChip><Icon /></IconChip>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t(title)}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t(desc)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardHead title={t("about.stack.title")} />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {STACK.map((s) => (
            <span
              key={s}
              className="rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-muted-foreground/50 hover:text-foreground"
            >
              {s}
            </span>
          ))}
        </CardContent>
      </Card>

      <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
        {t("about.disclaimer")}
      </p>
    </main>
  )
}
