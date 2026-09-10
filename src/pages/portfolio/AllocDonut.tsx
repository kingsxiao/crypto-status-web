/** 配置环形图：SVG 圆环按占比分段（dasharray 直接用百分比） */

import { t } from "@/i18n"

export function AllocDonut({ slices }: { slices: { key: string; pct: number; color: string }[] }) {
  const r = 15.9155 // 周长恰为 100，dasharray 直接用百分比
  // 预计算每段起点（累计百分比），避免渲染期变量重赋值
  const segments = slices.reduce<{ key: string; pct: number; color: string; start: number }[]>(
    (acc, s) => {
      const prev = acc[acc.length - 1]
      acc.push({ ...s, start: prev ? prev.start + prev.pct : 0 })
      return acc
    },
    []
  )
  return (
    <div className="relative mx-auto w-fit">
      <svg viewBox="0 0 42 42" className="size-44 sm:size-52" role="img" aria-label={t("pf.alloc.title")}>
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--secondary)" strokeWidth="5" />
        {segments.map((s) => {
          const len = Math.max(s.pct - (segments.length > 1 ? 0.7 : 0), 0.3)
          return (
            <circle
              key={s.key}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={s.pct >= 99.5 ? 5 : 5.8}
              strokeDasharray={`${len} ${100 - len}`}
              strokeDashoffset={-s.start}
              transform="rotate(-90 21 21)"
            />
          )
        })}
      </svg>
    </div>
  )
}
