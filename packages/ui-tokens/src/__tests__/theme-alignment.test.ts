import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { THEME_COLORS } from "@repo/core/theme"

import { cssTokens, fontStacks, RADIUS_BASE, radius } from "../theme"

/**
 * RN 色板对齐测试 — apps/web/src/index.css 是唯一事实源：
 * 改 index.css 任何主题 token 必跑本测试（反向：改 theme.ts 也然）。
 */

const css = readFileSync(
  fileURLToPath(new URL("../../../../apps/web/src/index.css", import.meta.url)),
  "utf8",
)

/** 抓取某选择器块内的全部 --token: value 声明 */
function tokensOf(selector: string): Record<string, string> {
  const m = css.match(
    new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\}`),
  )
  if (!m) throw new Error(`index.css 未找到 ${selector} 块`)
  const out: Record<string, string> = {}
  for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    out[k] = v.trim()
  }
  return out
}

/** 主题块的公共 token 名（theme.ts 的 ThemeCssTokens 键集） */
const TOKEN_KEYS = Object.keys(cssTokens.mono)

describe("三主题 token 与 index.css 逐字对齐", () => {
  const cases: Array<[string, keyof typeof cssTokens]> = [
    [":root,\n.dark", "mono"],
    ['html[data-theme="blue"]', "blue"],
    ['html[data-theme="violet"]', "violet"],
  ]

  for (const [selector, theme] of cases) {
    it(`${theme} 全部主题内 token 逐字一致`, () => {
      const cssTokensOf = tokensOf(selector)
      const rn = cssTokens[theme] as unknown as Record<string, string>
      // 涨跌功能色只在 :root 声明（blue/violet 块内无此声明，共享性另测）
      const skip = theme === "mono" ? [] : ["up", "down", "up-foreground", "down-foreground"]
      for (const key of TOKEN_KEYS) {
        if (skip.includes(key)) continue
        expect(rn[key], `theme.${theme}.${key}`).toBe(cssTokensOf[key])
      }
    })
  }

  it("涨跌功能色三主题共享（index.css 只在 :root 声明一份）", () => {
    const root = tokensOf(":root,\n.dark")
    for (const theme of ["blue", "violet"] as const) {
      const block = tokensOf(`html[data-theme="${theme}"]`)
      expect(block.up).toBeUndefined()
      expect(block.down).toBeUndefined()
      expect(cssTokens[theme].up).toBe(root.up)
      expect(cssTokens[theme].down).toBe(root.down)
    }
  })

  it("chart-1..5 每主题各自一套：mono 与 blue/violet 不同（琥珀/紫/蓝/青/橙 vs shadcn 图表色）", () => {
    expect(cssTokens.mono["chart-1"]).not.toBe(cssTokens.blue["chart-1"])
    expect(cssTokens.mono["chart-2"]).not.toBe(cssTokens.blue["chart-2"])
    expect(cssTokens.blue["chart-1"]).toBe(cssTokens.violet["chart-1"])
  })
})

describe("radius 派生档与 @theme inline calc 规则一致", () => {
  it("--radius: 0.625rem = 10px 起算", () => {
    expect(tokensOf(":root,\n.dark").radius).toBe("0.625rem")
    expect(RADIUS_BASE).toBe(10)
  })

  it("sm/md/lg/xl = r-4/r-2/r/r+4（对齐 --radius-sm..xl 的 calc 派生）", () => {
    expect(radius).toEqual({ sm: 6, md: 8, lg: 10, xl: 14 })
    const inline = css.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? ""
    expect(inline).toContain("--radius-sm: calc(var(--radius) - 4px)")
    expect(inline).toContain("--radius-md: calc(var(--radius) - 2px)")
    expect(inline).toContain("--radius-lg: var(--radius)")
    expect(inline).toContain("--radius-xl: calc(var(--radius) + 4px)")
  })
})

describe("字体栈与 web 端一致", () => {
  it("首字体 Inter / JetBrains Mono（Google Fonts 与 expo-font 同名）", () => {
    expect(fontStacks.sans[0]).toBe("Inter")
    expect(fontStacks.mono[0]).toBe("JetBrains Mono")
    const cssFonts = css.match(/--font-sans:\s*([^;]+);/)?.[1] ?? ""
    expect(cssFonts.startsWith('"Inter"')).toBe(true)
    const cssMono = css.match(/--font-mono:\s*([^;]+);/)?.[1] ?? ""
    expect(cssMono.startsWith('"JetBrains Mono"')).toBe(true)
  })
})

describe("状态栏色转述 core THEME_COLORS（不另立事实源）", () => {
  it("三主题一一对应", () => {
    expect(THEME_COLORS.mono).toBe("#171717")
    expect(THEME_COLORS.blue).toBe("#020817")
    expect(THEME_COLORS.violet).toBe("#030712")
  })
})
