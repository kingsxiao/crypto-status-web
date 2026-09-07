import { STANCE_LABEL, type Verdict } from "@/lib/crossAsset"

/**
 * 五档市场立场的徽标样式与文案。
 * 文案取自 crossAsset 的 STANCE_LABEL（单一事实源），VerdictCard 与
 * VerdictHistoryCard 共用；独立成模块以便组件文件保持纯组件导出。
 */
export const stanceStyle: Record<Verdict["stance"], { text: string; cls: string }> = {
  risk_on: {
    text: STANCE_LABEL.risk_on,
    cls: "border-transparent bg-up text-up-foreground",
  },
  cautiously_risk_on: {
    text: STANCE_LABEL.cautiously_risk_on,
    cls: "border-up text-up",
  },
  neutral: { text: STANCE_LABEL.neutral, cls: "text-muted-foreground" },
  cautiously_risk_off: {
    text: STANCE_LABEL.cautiously_risk_off,
    cls: "border-down text-down",
  },
  risk_off: {
    text: STANCE_LABEL.risk_off,
    cls: "border-transparent bg-down text-down-foreground",
  },
}
