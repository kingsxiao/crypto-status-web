/**
 * 设置页 — 本地数据管理：四域（持仓/预警/自选/事件提醒）一键导出 JSON
 * 备份、导入还原与各域数据概览。数据唯一存于 localStorage，本页是
 * 唯一的「带走 / 找回」入口。
 */

import { useRef, useState } from "react"
import {
  BellRing,
  CalendarClock,
  Download,
  ShieldCheck,
  Star,
  Upload,
  Wallet,
} from "lucide-react"

import { PageHeader } from "@/components/layout/PageHeader"
import { pushToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { t, useT } from "@/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { useFavorites } from "@/hooks/useFavorites"
import { useAlerts } from "@/lib/alerts"
import { downloadBackup, importBackup } from "@/lib/backup"
import { useEventReminders } from "@/lib/eventReminders"
import { usePortfolio } from "@/lib/portfolio"
import { cn } from "@/lib/utils"

export function SettingsPage() {
  useT()
  usePageMeta({ title: t("meta.settings"), description: t("page.settings.desc") })
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  // 各域概览：直接消费各域 hook，导入派发的变更事件会即时反映到这里
  const { favorites } = useFavorites()
  const { holdings } = usePortfolio()
  const { alerts } = useAlerts()
  const { reminders } = useEventReminders()
  const activeAlerts = alerts.filter((a) => a.status === "active").length
  const triggeredAlerts = alerts.length - activeAlerts

  const onExport = () => {
    setError(null)
    downloadBackup()
  }

  const onPickFile = () => {
    setError(null)
    fileRef.current?.click()
  }

  const onFileChange = async (file: File | undefined) => {
    if (!file) return
    const text = await file.text()
    const result = importBackup(text)
    if (result.ok) {
      setError(null)
      pushToast({
        title: t("set.importOk"),
        desc: t("set.importOkDesc", {
          fav: result.counts.favorites,
          pf: result.counts.portfolio,
          al: result.counts.alerts,
          ev: result.counts.eventReminders,
        }),
        ttlMs: 6000,
      })
    } else {
      // 结构非法：库未被动过，提示后继续用现有数据
      setError(t(result.error === "parse" ? "set.importFail.parse" : "set.importFail.shape"))
    }
    // 允许重复选择同一文件再次导入
    if (fileRef.current) fileRef.current.value = ""
  }

  const domains = [
    { icon: Star, label: t("set.dom.favorites"), value: t("set.count", { n: favorites.length }) },
    { icon: Wallet, label: t("set.dom.portfolio"), value: t("set.count", { n: holdings.length }) },
    {
      icon: BellRing,
      label: t("set.dom.alerts"),
      value: t("set.count", { n: alerts.length }),
      sub: t("set.dom.alertsSub", { active: activeAlerts, triggered: triggeredAlerts }),
    },
    {
      icon: CalendarClock,
      label: t("set.dom.reminders"),
      value: t("set.count", { n: Object.keys(reminders).length }),
    },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="Settings" title={t("page.settings.title")} description={t("page.settings.desc")} />

      {/* 备份与还原 */}
      <Card className="fade-up">
        <CardHeader>
          <CardHead
            title={
              <span className="flex items-center gap-2.5">
                <IconChip className="border-primary/30 bg-primary/10 text-primary">
                  <Download />
                </IconChip>
                {t("set.backup.title")}
              </span>
            }
            desc={t("set.backup.desc")}
          />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/30 p-4">
              <Button className="gap-1.5" onClick={onExport}>
                <Download className="size-4" /> {t("set.export")}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("set.exportHint")}</p>
            </div>
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-secondary/30 p-4">
              <Button variant="outline" className="gap-1.5" onClick={onPickFile}>
                <Upload className="size-4" /> {t("set.import")}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("set.importHint")}</p>
              {/* 隐藏文件选择器：按钮触发，保持动作区视觉统一 */}
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                aria-label={t("set.fileSr")}
                className="hidden"
                onChange={(e) => void onFileChange(e.target.files?.[0])}
              />
            </div>
          </div>
          {error && <p className={cn("font-mono text-[11px] text-down")}>{error}</p>}
        </CardContent>
      </Card>

      {/* 各域数据概览 */}
      <Card className="fade-up py-0" style={{ animationDelay: "60ms" }}>
        <CardHeader>
          <CardHead title={t("set.overview.title")} desc={t("set.overview.desc")} />
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 md:divide-x md:divide-border/60 md:py-0">
          {domains.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="flex flex-col gap-1.5 px-5 py-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="size-3.5" />
                <span className="font-mono text-[10px] font-semibold tracking-[0.18em] uppercase">{label}</span>
              </div>
              <span className="font-mono text-xl font-bold tabular">{value}</span>
              {sub && <span className="font-mono text-[10px] text-muted-foreground tabular">{sub}</span>}
            </div>
          ))}
        </CardContent>
      </Card>

      <p
        className="fade-up flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-muted-foreground"
        style={{ animationDelay: "120ms" }}
      >
        <ShieldCheck className="size-3 shrink-0" />
        {t("set.note")}
      </p>
    </main>
  )
}
