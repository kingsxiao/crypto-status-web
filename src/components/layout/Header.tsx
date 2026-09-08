import { useEffect, useRef, useState } from "react"
import { NavLink } from "react-router-dom"
import { Check, Languages, Menu, Palette, RotateCw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { NAV_ITEMS } from "@/components/layout/nav"
import { useMarket } from "@/context/MarketDataContext"
import { THEMES, useTheme } from "@/hooks/useTheme"
import { prefetchRoute } from "@/lib/routePrefetch"
import { formatTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { LOCALES, setLocale, t, useLocale, useT } from "@/i18n"
import type { FeedStatus } from "@/lib/realtime"

function feedText(s: FeedStatus, hasError: boolean): { dot: string; text: string } {
  if (hasError) return { dot: "bg-down", text: t("hdr.feed.error") }
  switch (s.mode) {
    case "live":
      return { dot: "bg-primary", text: t("hdr.feed.live") }
    case "polling":
      return { dot: "bg-primary/60", text: t("hdr.feed.polling") }
    default:
      return { dot: "bg-primary/40", text: t("hdr.feed.connecting") }
  }
}

/** 下拉浮层的共用交互：外部点击 / Escape 关闭 */
function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open, onClose])
  return ref
}

/** 主题色切换：三套预置配色，选择持久化到 localStorage */
function ThemePicker() {
  const { theme, setTheme } = useTheme()
  useT()
  const [open, setOpen] = useState(false)
  const rootRef = useDismiss(open, () => setOpen(false))

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="size-8 gap-0 p-0"
        aria-label={t("hdr.theme")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Palette className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={t("hdr.themeMenu")}
          className="fade-up absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-border bg-popover p-1 shadow-xl"
        >
          {THEMES.map((th) => {
            const active = th.id === theme
            return (
              <button
                key={th.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setTheme(th.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  active ? "bg-secondary" : "hover:bg-secondary/60"
                )}
              >
                <span
                  className="size-3.5 shrink-0 rounded-full border border-border"
                  style={{ background: th.swatch }}
                />
                <span className="flex flex-col leading-none">
                  <span className="text-xs font-semibold">{t(th.nameKey)}</span>
                  <span className="mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                    {th.en}
                  </span>
                </span>
                {active && <Check className="ml-auto size-3.5 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** 语言切换：首次访问自动检测系统语言为默认，此后以显式选择为准（localStorage 持久化） */
function LanguagePicker() {
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const rootRef = useDismiss(open, () => setOpen(false))

  return (
    <div ref={rootRef} className="relative">
      <Button
        variant="outline"
        size="sm"
        className="size-8 gap-0 p-0"
        aria-label={t("hdr.language")}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Languages className="size-4" />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={t("hdr.languageMenu")}
          className="fade-up absolute right-0 top-full z-50 mt-2 w-40 rounded-lg border border-border bg-popover p-1 shadow-xl"
        >
          {LOCALES.map((l) => {
            const active = l.id === locale
            return (
              <button
                key={l.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  setLocale(l.id)
                  setOpen(false)
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                  active ? "bg-secondary" : "hover:bg-secondary/60"
                )}
              >
                <span className="flex flex-1 flex-col leading-none">
                  <span className="text-xs font-semibold">{l.label}</span>
                  <span className="mt-1 font-mono text-[10px] tracking-[0.2em] text-muted-foreground">
                    {l.abbr}
                  </span>
                </span>
                {active && <Check className="ml-auto size-3.5 shrink-0 text-primary" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Header() {
  const { locale } = useLocale()
  const { error, refreshing, lastUpdated, refresh, feedStatus } = useMarket()
  const [menuOpen, setMenuOpen] = useState(false)
  const feed = feedText(feedStatus, !!error)
  // 英文界面下主导航的 EN 小角标与译文重复，隐藏
  const showEnTag = locale === "zh"
  // 九项导航：中文标签 1280(xl) 刚好放下；英文词长 2-3 倍，xl 会把右侧控件挤出
  // 视口（实测 1536 仍溢出 37px），英文界面桌面导航升到 2xl，区间交给汉堡菜单
  const navShow = locale === "en" ? "2xl:flex" : "xl:flex"
  const burgerShow = locale === "en" ? "2xl:hidden" : "xl:hidden"

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 2xl:max-w-[1680px] 2xl:px-10">
        <NavLink to="/" className="flex shrink-0 items-center gap-3 outline-none">
          <div className="flex size-8 items-center justify-center rounded-md border border-primary/70">
            <div className="size-2.5 rounded-full bg-primary" />
          </div>
          <div className="hidden flex-col text-left leading-none sm:flex">
            <span className="text-sm font-bold tracking-[0.18em]">CRYPTO STATUS</span>
            <span className="mt-1 text-[10px] tracking-widest text-muted-foreground">
              {t("hdr.subtitle")}
            </span>
          </div>
        </NavLink>

        {/* 桌面端导航菜单：中文 xl 起、英文 2xl 起显示；放不下的区间交给汉堡菜单 */}
        <nav className={cn("hidden items-center gap-0.5", navShow)} aria-label={t("hdr.nav")}>
          {NAV_ITEMS.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onPointerEnter={() => prefetchRoute(to)}
              onFocus={() => prefetchRoute(to)}
              className={({ isActive }) =>
                cn(
                  // px-2：九项导航在 1536(2xl) 英文界面也放得下（px-3 会溢出 37px）
                  "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )
              }
            >
              <Icon className="size-3.5" />
              <span>{t(key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* 连接状态 + 更新时间：合并为一个胶囊，减少顶栏视觉碎片 */}
          <div className="hidden items-center gap-2 rounded-full border border-border/60 bg-secondary/40 py-1 pl-2.5 pr-3 sm:flex">
            <span className={`live-dot size-1.5 rounded-full ${feed.dot}`} />
            <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{feed.text}</span>
            <span aria-hidden className="text-border">·</span>
            <span className="tabular font-mono text-[11px] whitespace-nowrap text-muted-foreground">
              {formatTime(lastUpdated)}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={refreshing}
            className="size-8 gap-0 p-0"
            aria-label={t("common.refresh")}
          >
            <RotateCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <ThemePicker />
          <LanguagePicker />

          {/* 移动端汉堡 */}
          <Button
            variant="outline"
            size="sm"
            className={cn("size-8 gap-0 p-0", burgerShow)}
            aria-label={menuOpen ? t("hdr.menu.close") : t("hdr.menu.open")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* 手动刷新时的顶部不定进度条（sticky 定位即绝对定位锚点） */}
      {refreshing && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden" aria-hidden>
          <div className="loading-bar" />
        </div>
      )}

      {/* 移动端下拉菜单 */}
      {menuOpen && (
        <nav
          className={cn("fade-up border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md", burgerShow)}
          aria-label={t("hdr.mobileNav")}
        >
          <div className="mx-auto grid w-full max-w-7xl gap-1">
            {NAV_ITEMS.map(({ to, key, en, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMenuOpen(false)}
                onPointerEnter={() => prefetchRoute(to)}
                onFocus={() => prefetchRoute(to)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  )
                }
              >
                <Icon className="size-4" />
                <span className="text-sm font-semibold">{t(key)}</span>
                {showEnTag && (
                  <span className="ml-auto font-mono text-[10px] tracking-[0.2em] opacity-50">{en}</span>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  )
}
