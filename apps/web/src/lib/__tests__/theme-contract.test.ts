// @vitest-environment node
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { THEME_COLORS, THEMES } from "@repo/core/theme"

/**
 * 三契约对齐测试 — 改 index.css / core THEME_COLORS / index.html 首帧内联脚本
 * 任何一处必跑本测试（状态栏色三主题映射唯一事实源 = core THEME_COLORS）：
 *   契约一：index.css 各主题 --background ↔ THEME_COLORS（hex 近似）
 *   契约二：index.html 首帧内联脚本的裸写键名与三主题色值 ↔ THEME_COLORS
 *   契约三：index.html 初始 meta theme-color = THEME_COLORS.mono
 */

const webRoot = fileURLToPath(new URL("../../..", import.meta.url))
const html = readFileSync(`${webRoot}/index.html`, "utf8")
const css = readFileSync(`${webRoot}/src/index.css`, "utf8")

/** hsl(度 数% 数%) → #rrggbb（与浏览器取整口径一致：Math.round 后 clamp） */
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100)
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l / 100 - c / 2
  let rgb: [number, number, number]
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const [r, g, b] = rgb
  const to = (v: number) =>
    Math.min(255, Math.max(0, Math.round((v + m) * 255)))
      .toString(16)
      .padStart(2, "0")
  return `#${to(r)}${to(g)}${to(b)}`
}

/** 从 CSS 抓某主题块内 --background 声明值 */
function backgroundOf(selector: string): string {
  const m = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\}`))
  if (!m) throw new Error(`index.css 未找到 ${selector} 主题块`)
  const bg = m[1].match(/--background:\s*([^;]+);/)
  if (!bg) throw new Error(`${selector} 块内未找到 --background`)
  return bg[1].trim()
}

describe("契约一：index.css 各主题 --background ↔ core THEME_COLORS", () => {
  it("mono（:root）oklch(0.09 0 0) 的 hex 近似 = #171717", () => {
    expect(backgroundOf(":root,\n.dark")).toBe("oklch(0.09 0 0)")
    // oklch L=0.09 的中性灰 ≈ 23/255 = 0x17（黑通道一致）
    expect(THEME_COLORS.mono).toBe("#171717")
  })

  it("blue hsl(222.2 84% 4.9%) → THEME_COLORS.blue", () => {
    expect(backgroundOf('html[data-theme="blue"]')).toBe("hsl(222.2 84% 4.9%)")
    expect(hslToHex(222.2, 84, 4.9)).toBe(THEME_COLORS.blue)
    expect(THEME_COLORS.blue).toBe("#020817")
  })

  it("violet hsl(224 71.4% 4.1%) → THEME_COLORS.violet", () => {
    expect(backgroundOf('html[data-theme="violet"]')).toBe("hsl(224 71.4% 4.1%)")
    expect(hslToHex(224, 71.4, 4.1)).toBe(THEME_COLORS.violet)
    expect(THEME_COLORS.violet).toBe("#030712")
  })

  it("三主题 id 与 index.css 主题块一一对应", () => {
    for (const t of THEMES) {
      if (t.id === "mono") continue
      expect(css).toContain(`html[data-theme="${t.id}"]`)
    }
  })
})

describe("契约二：index.html 首帧内联脚本 ↔ THEME_COLORS / 键名", () => {
  it("裸写键名兼容新旧两个存储键（storageBus 旧键迁移口径）", () => {
    expect(html).toContain('localStorage.getItem("crypto-status:theme")')
    expect(html).toContain('localStorage.getItem("crypto-status-theme")')
  })

  it("内联脚本三主题色值与 THEME_COLORS 逐字一致", () => {
    // 脚本内裸写三元：blue → #020817 / violet → #030712 / 其余 → #171717
    expect(html).toContain(`t === "blue" ? "${THEME_COLORS.blue}"`)
    expect(html).toContain(`t === "violet" ? "${THEME_COLORS.violet}"`)
    expect(html).toContain(`: "${THEME_COLORS.mono}"`)
  })

  it("接受的主题枚举与 THEMES 一致（mono/blue/violet）", () => {
    expect(html).toContain('t === "blue" || t === "violet" || t === "mono"')
  })
})

describe("契约三：初始 meta theme-color = mono 状态栏色", () => {
  it("index.html 初始值即 THEME_COLORS.mono", () => {
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLORS.mono}" />`)
  })
})
