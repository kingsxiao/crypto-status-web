/**
 * zh/en 字典对齐守卫（当前 662/662 已对齐，本测试把现状固定下来）。
 *
 * 通用断言而非固定 key 清单：后续新增 key 自动纳入守卫 ——
 * 漏译 / 占位符 `{x}` 集合不一致都会在这里被拦下，
 * 否则 t() 运行时会静默把 `{name}` 原样渲染给用户。
 */
import { describe, expect, it } from "vitest"

import { en } from "@/i18n/en"
import { zh } from "@/i18n/zh"

/** 提取文案中的全部 {x} 插值占位符名（t() 按 `{` + 名 + `}` 全量替换） */
function placeholders(s: string): Set<string> {
  return new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))
}

describe("i18n zh/en 字典对齐", () => {
  it("en 覆盖 zh 的全部 key（无漏译）", () => {
    const enKeys = new Set(Object.keys(en))
    const missing = Object.keys(zh).filter((k) => !enKeys.has(k))
    expect(missing).toEqual([])
  })

  it("en 不含 zh 之外的 key（无死键）", () => {
    const zhKeys = new Set(Object.keys(zh))
    const extra = Object.keys(en).filter((k) => !zhKeys.has(k))
    expect(extra).toEqual([])
  })

  it("每个 key 的 {x} 占位符集合两语言一致", () => {
    const mismatched: string[] = []
    for (const [key, zhVal] of Object.entries(zh)) {
      const enVal = en[key as keyof typeof en]
      if (typeof enVal !== "string") continue // 漏译已由上一条用例拦截
      const a = placeholders(zhVal)
      const b = placeholders(enVal)
      if (a.size !== b.size || [...a].some((x) => !b.has(x))) {
        mismatched.push(`${key}: zh={${[...a]}} en={${[...b]}}`)
      }
    }
    expect(mismatched).toEqual([])
  })
})
