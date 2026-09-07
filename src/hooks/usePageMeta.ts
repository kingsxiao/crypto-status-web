import { useEffect } from "react"

import { useT } from "@/i18n"

/** 每个页面设置文档标题（也顺便刷新 SPA 元信息）；订阅语言切换即时更新 */
export function usePageMeta({ title }: { title: string }) {
  useT()
  useEffect(() => {
    document.title = title
  }, [title])
}
