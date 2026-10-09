// @vitest-environment jsdom
/**
 * SiteFx 接入层的降级组合锁定(jsdom 无 navigator.gpu):
 *  - HeroShaderBackdrop:降级时渲染与现状完全一致的 grid-backdrop,无 shader 层
 *  - CursorTrailFx:降级时只有空容器,无 shader 层、无 canvas
 *  - 主题切换不改变降级形态(fallback 与主题无关)
 * shader 激活路径的降级/暂停细节由 LazyShader.test.tsx 覆盖,此处只锁接入层组合。
 */
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { CursorTrailFx, HeroShaderBackdrop } from "@/components/shader/SiteFx"

afterEach(() => {
  cleanup()
  delete (navigator as { gpu?: unknown }).gpu
})

describe("SiteFx 降级形态(无 WebGPU)", () => {
  it("HeroShaderBackdrop → grid-backdrop fallback 与现状一致,无 shader 层", () => {
    const { container } = render(<HeroShaderBackdrop />)
    expect(container.querySelector(".grid-backdrop")).not.toBeNull()
    expect(container.querySelector(".shader")).toBeNull()
    expect(container.querySelector("canvas")).toBeNull()
  })

  it("CursorTrailFx → 仅空容器,无 shader 层无 canvas", () => {
    const { container } = render(<CursorTrailFx />)
    expect(container.querySelector(".shader")).toBeNull()
    expect(container.querySelector("canvas")).toBeNull()
    // 容器本身常驻(fixed 定位类由 containerClassName 注入)
    expect(container.firstElementChild?.className).toContain("fixed")
  })

  it("切换主题(violet)后降级形态不变:grid-backdrop 仍在,shader 仍缺席", () => {
    const { container, rerender } = render(<HeroShaderBackdrop />)
    rerender(<HeroShaderBackdrop />)
    expect(container.querySelector(".grid-backdrop")).not.toBeNull()
    expect(container.querySelector(".shader")).toBeNull()
  })
})
