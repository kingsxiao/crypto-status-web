// @vitest-environment node
import { describe, expect, it } from "vitest"

import { toNum } from "../http"

describe("toNum 宽松转换", () => {
  it("合法数值字符串与数字原样返回", () => {
    expect(toNum("5")).toBe(5)
    expect(toNum("5.5")).toBe(5.5)
    expect(toNum(7)).toBe(7)
  })
  it("空串/undefined/null/非数字 → null（不得渗出 NaN）", () => {
    expect(toNum("")).toBeNull()
    expect(toNum(undefined)).toBeNull()
    expect(toNum(null)).toBeNull()
    expect(toNum("abc")).toBeNull()
  })
})

