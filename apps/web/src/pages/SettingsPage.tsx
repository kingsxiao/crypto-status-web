/**
 * 设置页 — 本地数据管理:四域(持仓/预警/自选/事件提醒)一键导出 JSON
 * 备份、导入还原与各域数据概览(记录数 + localStorage 占用)。
 * 数据唯一存于 localStorage,本页是唯一的「带走 / 找回」入口。
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
import { SectionLabel } from "@/components/layout/SectionLabel"
import { AnimatedNumber } from "@/components/ui/animated-number"
import { pushToast } from "@/components/ui/toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { StatStrip, type StatItem } from "@/components/ui/stat"
import { t } from "@repo/core/i18n"
import { useT } from "@repo/react/i18n"
import { usePageMeta } from "@/hooks/usePageMeta"
import { useFavorites } from "@repo/react/useFavorites"
import { useAlerts } from "@repo/react/useAlerts"
import { importBackup } from "@repo/core/backup"
import { downloadBackup } from "@/lib/backupDownload"
import { useEventReminders } from "@repo/react/useEventReminders"
import { usePortfolio } from "@repo/react/usePortfolio"
import { STORAGE_KEYS, storageGet } from "@repo/core/storageBus"
import { cn } from "@/lib/utils"

/** 各域 localStorage 占用:库内字符串长度(即 JSON.stringify 的字符数) */
function bytesOf(key: string): number {
  return storageGet(key)?.length ?? 0
}

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${n} B`
}

export function SettingsPage() {
  useT()
  usePageMeta({ title: t("meta.settings"), description: t("page.settings.desc") })
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  // 各域概览:直接消费各域 hook,导入派发的变更事件会即时反映到这里
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
      // 结构非法:库未被动过,提示后继续用现有数据
      setError(t(result.error === "parse" ? "set.importFail.parse" : "set.importFail.shape"))
    }
    // 允许重复选择同一文件再次导入
    if (fileRef.current) fileRef.current.value = ""
  }

  /** 记录数读数:导入/删除后数值变化经 AnimatedNumber 播一次 rise */
  const countValue = (n: number) => (
    <AnimatedNumber value={n} format={(v) => t("set.count", { n: v })} />
  )

  const storageSub = (key: string) => `${t("set.storage")} ${fmtBytes(bytesOf(key))}`

  const items: StatItem[] = [
    {
      icon: Star,
      label: t("set.dom.favorites"),
      value: countValue(favorites.length),
      sub: storageSub(STORAGE_KEYS.favorites),
    },
    {
      icon: Wallet,
      label: t("set.dom.portfolio"),
      value: countValue(holdings.length),
      sub: storageSub(STORAGE_KEYS.portfolio),
    },
    {
      icon: BellRing,
      label: t("set.dom.alerts"),
      value: countValue(alerts.length),
      sub: `${t("set.dom.alertsSub", { active: activeAlerts, triggered: triggeredAlerts })} · ${storageSub(STORAGE_KEYS.alerts)}`,
    },
    {
      icon: CalendarClock,
      label: t("set.dom.reminders"),
      value: countValue(Object.keys(reminders).length),
      sub: storageSub(STORAGE_KEYS.eventReminders),
    },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 2xl:max-w-[1280px] 2xl:px-10 space-y-4 px-4 pb-20 pt-6 sm:px-6">
      <PageHeader en="Settings" title={t("page.settings.title")} description={t("page.settings.desc")} />

      {/* 备份与还原 */}
      <Card>
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
              {/* 隐藏文件选择器:按钮触发,保持动作区视觉统一 */}
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

      {/* 各域数据概览:记录数(变化时弹跳)+ 本地占用 */}
      <section className="space-y-3">
        <SectionLabel>{t("set.overview.title")}</SectionLabel>
        <StatStrip items={items} />
      </section>

      <p className="flex items-center justify-center gap-1.5 text-center font-mono text-[10px] text-muted-foreground">
        <ShieldCheck className="size-3 shrink-0" />
        {t("set.note")}
      </p>
    </main>
  )
}
