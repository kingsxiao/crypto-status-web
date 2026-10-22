import { useCallback, useLayoutEffect, useState } from "react"

/**
 * 滚动显现（基础层唯一实现）：配 index.css 的 .reveal / .reveal.is-visible。
 *
 * 渐进增强契约：
 *  - 初始隐藏态（.reveal）由本 hook 在挂载时挂类（useLayoutEffect，先于绘制，
 *    无闪现）——JSX 里不写 .reveal，无 JS / 测试环境（无 IntersectionObserver）
 *    内容照常可见；
 *  - 进入视口后挂 .is-visible 并断开观察（一次性显现，不重复触发）；
 *  - prefers-reduced-motion 下直接短路：不挂初始态，内容静态呈现终态。
 *
 * 容器节点必须经回调 ref 持有并作为 effect 依赖：异步数据页首帧常处骨架态
 * （snapshot 为 null），<main> 在数据到达后才挂载——若用静态 ref 且 effect
 * 仅依赖 [selector]，首帧读到 ref.current === null 直接返回，此后不再执行，
 * 观察器永远建不起来。回调 ref 把节点 null→元素的挂载时序变化写进 state
 * 触发 effect 重跑；容器内后到/筛选切换新增的 [data-reveal] 子树由
 * MutationObserver 增量接入（增量扫描，WeakSet 去重）。
 *
 * 用法：
 * ```tsx
 * const ref = useReveal<HTMLDivElement>()
 * <section ref={ref}>
 *   <div data-reveal>…</div>   // 滚到视口时显现
 * </section>
 * ```
 * 默认观察容器内全部 `[data-reveal]` 元素；容器自身要显现时给容器也加 data-reveal。
 */
export function useReveal<T extends HTMLElement>(selector = "[data-reveal]") {
  const [root, setRoot] = useState<T | null>(null)
  const ref = useCallback((el: T | null) => setRoot(el), [])

  useLayoutEffect(() => {
    if (!root) return
    // 无观察器（旧环境/测试）或用户要求减少动效：不挂初始态，内容直接可见
    if (typeof IntersectionObserver === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible")
            io.unobserve(entry.target)
          }
        }
      },
      // 触发线略高于视口底：滚动到达前一点开始显现，观感更连贯
      { rootMargin: "0px 0px -10% 0px" }
    )

    const seen = new WeakSet<HTMLElement>()
    const scan = () => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(selector))) {
        if (seen.has(el)) continue
        seen.add(el)
        el.classList.add("reveal")
        io.observe(el)
      }
    }
    scan()
    const mo = new MutationObserver(scan)
    mo.observe(root, { childList: true, subtree: true })

    return () => {
      io.disconnect()
      mo.disconnect()
    }
  }, [root, selector])

  return ref
}
