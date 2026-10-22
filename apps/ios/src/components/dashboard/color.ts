/**
 * token 色透明度派生 — rnColor() 产物（rgb()/hsl()/hex）加 alpha 通道。
 * 输入一律来自 useAppTheme().c(key)（或 fngShade 等 oklch 原串经 rnColor），
 * 本文件不含任何色值事实源，只做字符串格式变换。
 */
export function alpha(color: string, a: number): string {
  const v = Math.min(1, Math.max(0, a))
  if (color.startsWith("#")) {
    let hex = color.slice(1)
    if (hex.length === 3) hex = hex.split("").map((ch) => ch + ch).join("")
    if (hex.length === 6) return `#${hex}${Math.round(v * 255).toString(16).padStart(2, "0")}`
    return color
  }
  const rgb = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/)
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${v})`
  const hsl = color.match(/^hsla?\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%(?:,\s*[\d.]+)?\)$/)
  if (hsl) return `hsla(${hsl[1]}, ${hsl[2]}%, ${hsl[3]}%, ${v})`
  return color
}
