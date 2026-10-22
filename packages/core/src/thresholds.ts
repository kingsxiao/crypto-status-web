/**
 * 信号引擎分档阈值 — 「综合分 → 结论档位」口径的唯一出处。
 *
 * 技术面与跨资产两套引擎的强/弱分界有意不同，勿互相“对齐”：
 *  - 技术面（indicators.analyze / coinAnalysis，[-2,+2] 指标加权 → ±100）
 *    强档 ±40：单一币种的技术结构信号相对干净；
 *  - 跨资产（crossAsset，[-1,+1] 指标加权 → ±100）强档 ±45：多源指标
 *    噪声更大，收窄强档避免轻易给出 risk_on / risk_off。
 *
 * 复盘判定（grade）另用更保守的 composite ±8：弱信号按中性计，
 * 不参与命中率的对错统计。
 */

/** 技术面综合分五档分界：|composite| ≥ strong → 强多/强空，≥ weak → 多/空 */
export const TECH_TIERS = { strong: 40, weak: 15 } as const

/** 跨资产立场五档分界 */
export const CROSS_TIERS = { strong: 45, weak: 15 } as const

/** 复盘分界：|composite| 超过该值才算方向性预测；隔日市值变化超该值（%）才算实际涨/跌 */
export const GRADE_TIERS = { predictedComposite: 8, actualDayPct: 0.5 } as const
