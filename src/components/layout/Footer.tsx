import { NavLink } from "react-router-dom"

import { NAV_ITEMS } from "@/components/layout/nav"
import { useT } from "@/i18n"
import { THEMES, useTheme } from "@/hooks/useTheme"

export function Footer() {
  const { theme } = useTheme()
  const t = useT()
  const themeLabel = THEMES.find((th) => th.id === theme)?.en ?? "MONO"

  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          CRYPTO STATUS · {themeLabel} EDITION
        </span>
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label={t("footer.nav")}>
          {NAV_ITEMS.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {t(item.key)}
              {i < NAV_ITEMS.length - 1 && <span className="ml-4 text-border">/</span>}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 sm:px-6">
        <p className="mx-auto max-w-3xl text-center text-[11px] leading-relaxed text-muted-foreground sm:mx-0 sm:text-left">
          {t("footer.disclaimer")}
        </p>
      </div>
    </footer>
  )
}
