import { useEffect } from "react"

/** 每个页面设置文档标题（也顺便刷新 SPA 元信息） */
export function usePageMeta({ title }: { title: string }) {
  useEffect(() => {
    document.title = title
  }, [title])
}
