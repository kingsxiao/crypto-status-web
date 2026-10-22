import { t } from "@repo/core/i18n"
import { STANCE_KEY, type Verdict } from "@repo/core/crossAsset"

/**
 * 五档市场立场的徽标样式。
 * 文案经 STANCE_KEY 按当前语言取自词典（单一事实源），VerdictCard 与
 * VerdictHistoryCard 共用；独立成模块以便组件文件保持纯组件导出。
 * dot：每档的微型指示点类（涨跌色只染点，不染容器），供列表行等窄场景使用。
 */
export const stanceStyle: Record<
  Verdict["stance"],
  { text: () => string; cls: string; dot: string }
> = {
  risk_on: {
    text: () => t(STANCE_KEY.risk_on),
    cls: "border-transparent bg-up text-up-foreground",
    dot: "bg-up",
  },
  cautiously_risk_on: {
    text: () => t(STANCE_KEY.cautiously_risk_on),
    cls: "border-up text-up",
    dot: "bg-up/60",
  },
  neutral: { text: () => t(STANCE_KEY.neutral), cls: "text-muted-foreground", dot: "bg-muted-foreground/50" },
  cautiously_risk_off: {
    text: () => t(STANCE_KEY.cautiously_risk_off),
    cls: "border-down text-down",
    dot: "bg-down/60",
  },
  risk_off: {
    text: () => t(STANCE_KEY.risk_off),
    cls: "border-transparent bg-down text-down-foreground",
    dot: "bg-down",
  },
}
