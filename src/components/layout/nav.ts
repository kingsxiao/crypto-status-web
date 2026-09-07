import { ArrowLeftRight, Gauge, Info, LayoutDashboard, Scale, Table2 } from "lucide-react"

/** 主导航项：Header 桌面/移动菜单与 Footer 共用 */
export const NAV_ITEMS = [
  { to: "/", label: "总览", en: "DASHBOARD", icon: LayoutDashboard },
  { to: "/markets", label: "行情", en: "MARKETS", icon: Table2 },
  { to: "/sentiment", label: "情绪", en: "SENTIMENT", icon: Gauge },
  { to: "/verdict", label: "判断", en: "VERDICT", icon: Scale },
  { to: "/converter", label: "换算", en: "CONVERTER", icon: ArrowLeftRight },
  { to: "/about", label: "关于", en: "ABOUT", icon: Info },
] as const
