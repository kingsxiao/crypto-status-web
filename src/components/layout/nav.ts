import {
  ArrowLeftRight,
  BellRing,
  CalendarClock,
  Gauge,
  Info,
  LayoutDashboard,
  Scale,
  Table2,
  Wallet,
} from "lucide-react"

/** 主导航项：Header 桌面/移动菜单与 Footer 共用；label 经词典按语言取词 */
export const NAV_ITEMS = [
  { to: "/", key: "nav.dashboard", en: "DASHBOARD", icon: LayoutDashboard },
  { to: "/markets", key: "nav.markets", en: "MARKETS", icon: Table2 },
  { to: "/sentiment", key: "nav.sentiment", en: "SENTIMENT", icon: Gauge },
  { to: "/verdict", key: "nav.verdict", en: "VERDICT", icon: Scale },
  { to: "/events", key: "nav.events", en: "EVENTS", icon: CalendarClock },
  { to: "/converter", key: "nav.converter", en: "CONVERTER", icon: ArrowLeftRight },
  { to: "/portfolio", key: "nav.portfolio", en: "PORTFOLIO", icon: Wallet },
  { to: "/alerts", key: "nav.alerts", en: "ALERTS", icon: BellRing },
  { to: "/about", key: "nav.about", en: "ABOUT", icon: Info },
] as const
