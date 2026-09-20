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
import { t, useT, type MessageKey } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { THEMES, useTheme } from "@/hooks/useTheme"

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

/** 页面清单：名称取词典 key，括注一句定位（desc 值自带顿号/逗号与句读） */
const PAGES: [MessageKey, MessageKey][] = [
  ["nav.dashboard", "about.pg.dash"],
  ["nav.markets", "about.pg.markets"],
  ["about.pg.coinName", "about.pg.coin"],
  ["nav.sentiment", "about.pg.sentiment"],
  ["nav.verdict", "about.pg.verdict"],
  ["nav.converter", "about.pg.converter"],
  ["nav.portfolio", "about.pg.portfolio"],
  ["nav.alerts", "about.pg.alerts"],
  ["nav.events", "about.pg.events"],
  ["nav.about", "about.pg.about"],
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

      <Card className="fade-up" style={{ animationDelay: "60ms" }}>
        <CardHeader>
          <CardHead title={t("about.what.title")} desc={t("about.what.desc")} />
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>{t("about.what.p1")}</p>
          <p>
            {t("about.what.p2a")}
            {PAGES.map(([key, desc]) => (
              <span key={key}>
                <b className="text-foreground">{t(key)}</b>
                {t(desc)}
              </span>
            ))}
          </p>
        </CardContent>
      </Card>

      <Card className="fade-up" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardHead title={t("about.features.title")} desc={t("about.features.desc")} />
        </CardHeader>
        <CardContent className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
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

      <Card className="fade-up" style={{ animationDelay: "180ms" }}>
        <CardHeader>
          <CardHead title={t("about.stack.title")} />
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5">
          {STACK.map((s) => (
            <span
              key={s}
              className="rounded border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </CardContent>
      </Card>

      <p className="fade-up text-center text-[10px] leading-relaxed text-muted-foreground" style={{ animationDelay: "240ms" }}>
        {t("about.disclaimer")}
      </p>
    </main>
  )
}
