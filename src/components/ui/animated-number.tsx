import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export interface AnimatedNumberProps {
  /** 当前值；DOM 文本恒渲染 format(value) 终值 */
  value: number
  /** 格式化（默认 String）；一切价格/百分比/得分读数必须保持 tabular 数字 */
  format?: (v: number) => string
  /** 挂载时是否播一次入场动效（默认否：首屏读数直接呈现） */
  animateOnMount?: boolean
  className?: string
}

/**
 * 计数/读数动效（基础层唯一实现）—— final-text 模式：
 *
 *  - DOM 文本恒为终值：value 变化时只叠一次性视觉动效（整体 translateY ±4px
 *    + fade，配 index.css 的 .num-rise / .num-fall），不生成第二份可读文本。
 *    屏幕阅读器与 e2e 文本断言读到的都是且只是当前值；
 *  - 方向携带信息：值升 → 自下而上入场（num-rise），值降 → 自上而下（num-fall）；
 *  - prefers-reduced-motion：CSS 全局 kill（index.css 文件末尾）使动画即时完成，
 *    直接呈现终值；
 *  - ⚠️ 禁止在用 key 重挂的父容器内依赖 value-change 动效：重挂即组件重建，
 *    prev 参照归零，动画永不触发（分区 CoinDetail 头部价格即属此类——那里用
 *    LivePrice 的 state 型 flash 或 key 型 flash，不得套 AnimatedNumber）。
 */
export function AnimatedNumber({ value, format, animateOnMount = false, className }: AnimatedNumberProps) {
  const prev = useRef<number | null>(null)
  const [dir, setDir] = useState<"rise" | "fall" | null>(null)

  useEffect(() => {
    const p = prev.current
    prev.current = value
    if (p === value) return
    if (p == null) {
      if (animateOnMount) setDir("rise")
      return
    }
    setDir(value > p ? "rise" : "fall")
    const t = setTimeout(() => setDir(null), 700)
    return () => clearTimeout(t)
  }, [value, animateOnMount])

  return (
    <span
      /* 方向态变化时重挂内层 span：涨↔跌 切换必重启动画；同向连续变动合并为
         一次动效（setState 命中 Object.is bailout，dir 不变、key 不变不重挂，
         动效在 700ms 窗口内持续有效），静默后归位。若需每次都闪，须另行
         给 key 掺单调序列号，勿依赖此处 */
      key={dir ?? "static"}
      className={cn(
        "tabular",
        dir === "rise" && "num-rise",
        dir === "fall" && "num-fall",
        className
      )}
    >
      {format ? format(value) : String(value)}
    </span>
  )
}
