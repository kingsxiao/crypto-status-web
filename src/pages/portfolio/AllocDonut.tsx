/** 配置环形图:SVG 圆环按占比分段(dasharray 直接用百分比)。
 *
 *  - 挂载弧生长:dasharray 从 0 过渡到终值(一次性 0.8s CSS 过渡,
 *    非 JS 逐帧);prefers-reduced-motion / 无 matchMedia 时短路为静态终态;
 *  - 分段 hover 与图例联动:高亮段加粗、其余段降不透明度,
 *    环心读数由调用处按 activeKey 切换为该资产的占比与市值。
 */

import { memo, useEffect, useState } from "react"

import { t } from "@/i18n"

export interface DonutSlice {
  key: string
  pct: number
  color: string
}

/** memo:slices 引用稳定时(见 PortfolioPage 的 useMemo)跳过秒级推送带来的重算 */
export const AllocDonut = memo(function AllocDonut({
  slices,
  activeKey = null,
  onSliceHover,
}: {
  slices: DonutSlice[]
  /** 联动高亮分段(slices 的 key);null = 无高亮 */
  activeKey?: string | null
  /** 分段 hover 进出回调(null = 离开) */
  onSliceHover?: (key: string | null) => void
}) {
  const r = 15.9155 // 周长恰为 100,dasharray 直接用百分比
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    // 无 matchMedia 的环境视同 reduce:跳过生长,静态呈现终态
    if (typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGrown(true)
      return
    }
    let done = false
    // 双 rAF:确保首帧以 0 长度提交后再切终值,transition 才会播放
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!done) setGrown(true)
      })
    })
    return () => {
      done = true
      cancelAnimationFrame(raf)
    }
  }, [])

  // 预计算每段起点(累计百分比),避免渲染期变量重赋值
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
      <svg
        viewBox="0 0 42 42"
        className="size-44 sm:size-52"
        role="img"
        aria-label={t("pf.alloc.title")}
        onPointerLeave={() => onSliceHover?.(null)}
      >
        <circle cx="21" cy="21" r={r} fill="none" stroke="var(--secondary)" strokeWidth="5" />
        {segments.map((s) => {
          const len = Math.max(s.pct - (segments.length > 1 ? 0.7 : 0), 0.3)
          const dim = activeKey != null && activeKey !== s.key
          return (
            <circle
              key={s.key}
              cx="21"
              cy="21"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={activeKey === s.key ? 6.6 : s.pct >= 99.5 ? 5 : 5.8}
              strokeDasharray={grown ? `${len} ${100 - len}` : `0 ${100}`}
              strokeDashoffset={-s.start}
              transform="rotate(-90 21 21)"
              style={{
                transition:
                  "stroke-dasharray 0.8s var(--ease-soft), stroke-width 0.16s var(--ease-soft), stroke-opacity 0.16s var(--ease-soft)",
                strokeOpacity: dim ? 0.3 : 1,
              }}
              onPointerEnter={() => onSliceHover?.(s.key)}
            />
          )
        })}
      </svg>
    </div>
  )
})
