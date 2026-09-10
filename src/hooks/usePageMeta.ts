import { useEffect } from "react"

import { useT } from "@/i18n"

/** head 里按 name/property 找（或创建）meta 标签并更新 content */
function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) {
    el = document.createElement("meta")
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute("content", content)
}

/**
 * 每个页面设置文档标题与描述（也顺便刷新 SPA 元信息）；订阅语言切换即时更新。
 * description 同时写入 <meta name="description"> 与 og:description ——
 * 纯 CSR 站点爬虫只能看到壳，这些标签主要改善分享卡片与快照摘要。
 */
export function usePageMeta({ title, description }: { title: string; description?: string }) {
  useT()
  useEffect(() => {
    document.title = title
    if (description == null) return
    upsertMeta("name", "description", description)
    upsertMeta("property", "og:title", title)
    upsertMeta("property", "og:description", description)
  }, [title, description])
}
