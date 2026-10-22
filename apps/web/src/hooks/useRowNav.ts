import { useCallback, useEffect, useRef, useState } from "react"

/**
 * 表格键盘行导航（基础层唯一实现，各表不得手搓）。
 *
 * 用法约定：
 * 1. 行元素加 `data-row-nav-row` 属性并设 `tabIndex={0}`（不可点行两者都不加）；
 * 2. 容器（通常是 `<tbody>`）展开返回的 `onKeyDown`；
 * 3. 行本身的 onClick 照常保留 —— 鼠标与键盘共用同一跳转逻辑。
 *
 * ```tsx
 * const nav = useRowNav({ count: rows.length, onActivate: (i) => navigate(`/coin/${rows[i].id}`) })
 * <tbody onKeyDown={nav.onKeyDown}>
 *   {rows.map((c, i) => (
 *     <TableRow key={c.id} data-row-nav-row tabIndex={0}
 *       className={cn("row-link", i === nav.activeIndex && "bg-secondary/60")}
 *       onClick={() => navigate(`/coin/${c.id}`)} />
 *   ))}
 * </tbody>
 * ```
 *
 * 键位：↑/↓ 移动（钳位不循环）、Home/End 首尾、Enter/Space 激活当前行。
 * 焦点落在行内控件（按钮/输入框）时不劫持按键，交还控件原生行为。
 */
export interface UseRowNavOptions {
  /** 可导航行总数（钳位上界，应与标记了 data-row-nav-row 的行数一致） */
  count: number
  /** Enter/Space 激活回调，参数为当前行索引 */
  onActivate: (index: number) => void
}

export interface RowNav {
  /** 当前活动行索引（-1 = 未定位），供调用处做视觉高亮 */
  activeIndex: number
  setActiveIndex: (index: number) => void
  /** 挂到行容器（tbody / 包裹 div）的 keydown 处理器 */
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void
}

const ROW_ATTR = "data-row-nav-row"

export function useRowNav({ count, onActivate }: UseRowNavOptions): RowNav {
  const [activeIndex, setActiveIndex] = useState(-1)
  // 回调走 ref：避免调用处内联箭头函数导致 keydown 处理器每帧重绑
  const onActivateRef = useRef(onActivate)
  useEffect(() => {
    onActivateRef.current = onActivate
  }, [onActivate])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // 带修饰键的组合交给浏览器快捷键
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const rows = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(`[${ROW_ATTR}]`))
      if (rows.length === 0) return
      const target = e.target instanceof HTMLElement ? e.target : null
      const idx = target ? rows.indexOf(target) : -1
      if (idx < 0) return // 焦点在行内控件上：不劫持其原生按键
      const max = Math.min(rows.length - 1, Math.max(count - 1, 0))

      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp": {
          e.preventDefault()
          const dir = e.key === "ArrowDown" ? 1 : -1
          const next = Math.max(0, Math.min(max, idx + dir))
          rows[next].focus()
          setActiveIndex(next)
          break
        }
        case "Home": {
          e.preventDefault()
          rows[0].focus()
          setActiveIndex(0)
          break
        }
        case "End": {
          e.preventDefault()
          rows[max].focus()
          setActiveIndex(max)
          break
        }
        case "Enter":
        case " ": {
          e.preventDefault()
          setActiveIndex(idx)
          onActivateRef.current(idx)
          break
        }
      }
    },
    [count]
  )

  return { activeIndex, setActiveIndex, onKeyDown }
}
