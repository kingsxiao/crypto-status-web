import { useEffect, useState } from "react"
import { ArrowUp } from "lucide-react"

import { t, useT } from "@/i18n"
import { cn } from "@/lib/utils"

/**
 * 长页面（总览/情绪在移动端可达 4000px+）滚动超过一屏后，
 * 右下角浮出"回到顶部"按钮；平滑滚动，尊重 reduced-motion（CSS 全局处理）。
 */
export function BackToTop() {
  useT()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  if (!show) return null

  return (
    <button
      type="button"
      aria-label={t("backToTop")}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={cn(
        "fade-up fixed right-5 bottom-5 z-40 flex size-10 items-center justify-center",
        "rounded-full border border-border bg-card/90 text-muted-foreground shadow-lg backdrop-blur",
        "transition-colors hover:border-foreground/25 hover:text-foreground"
      )}
    >
      <ArrowUp className="size-4" />
    </button>
  )
}
