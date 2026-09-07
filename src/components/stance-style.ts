import { t } from "@/i18n"
import { STANCE_KEY, type Verdict } from "@/lib/crossAsset"

/**
 * 五档市场立场的徽标样式。
 * 文案经 STANCE_KEY 按当前语言取自词典（单一事实源），VerdictCard 与
 * VerdictHistoryCard 共用；独立成模块以便组件文件保持纯组件导出。
 */
export const stanceStyle: Record<Verdict["stance"], { text: () => string; cls: string }> = {
  risk_on: {
    text: () => t(STANCE_KEY.risk_on),
    cls: "border-transparent bg-up text-up-foreground",
  },
  cautiously_risk_on: {
    text: () => t(STANCE_KEY.cautiously_risk_on),
    cls: "border-up text-up",
  },
  neutral: { text: () => t(STANCE_KEY.neutral), cls: "text-muted-foreground" },
  cautiously_risk_off: {
    text: () => t(STANCE_KEY.cautiously_risk_off),
    cls: "border-down text-down",
  },
  risk_off: {
    text: () => t(STANCE_KEY.risk_off),
    cls: "border-transparent bg-down text-down-foreground",
  },
}
