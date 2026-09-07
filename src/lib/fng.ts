/**
 * 恐惧贪婪指数（FNG）共用展示口径：分类中文映射、区间配色与情绪条渐变。
 * SentimentCard（总览）与 SentimentPage 共用，避免两处漂移。
 */

export const FNG_ZH: Record<string, string> = {
  "Extreme Fear": "极度恐惧",
  Fear: "恐惧",
  Neutral: "中性",
  Greed: "贪婪",
  "Extreme Greed": "极度贪婪",
}

export function fngZh(classification: string): string {
  return FNG_ZH[classification] ?? classification
}

/** 恐惧(0)红 → 中性黄 → 贪婪(100)绿 的区间配色（功能色，不随主题变） */
export function fngShade(v: number): string {
  if (v <= 25) return "oklch(0.62 0.21 27)"
  if (v <= 45) return "oklch(0.72 0.16 45)"
  if (v < 55) return "oklch(0.82 0.14 90)"
  if (v < 75) return "oklch(0.79 0.14 140)"
  return "oklch(0.78 0.17 152)"
}

/** 0-100 情绪条的固定渐变背景 */
export const FNG_GRADIENT =
  "linear-gradient(90deg, oklch(0.62 0.21 27), oklch(0.75 0.16 60), oklch(0.85 0.15 95), oklch(0.8 0.15 145), oklch(0.78 0.17 152))"
