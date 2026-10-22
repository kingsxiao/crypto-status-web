/**
 * RN 色值转换 — ui-tokens 的 CSS 原串 → RN 可消费色值：
 *   - #hex / rgb()/rgba()/hsl()/hsla()：RN 原生支持，直通
 *   - oklch(L C H)：OKLab → 线性 sRGB → gamma，程序化转换
 *     （mono 主题黑白灰与 chart 色均为此格式；数值口径与浏览器一致）
 * 唯一事实源仍是 ui-tokens/index.css；本文件只做格式转换，不含任何色值。
 */

export function rnColor(css: string): string {
  const v = css.trim()
  if (v.startsWith("#") || /^(rgba?|hsla?)\(/.test(v)) return v
  const m = v.match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/)
  if (!m) return v
  const L = Number(m[1])
  const C = Number(m[2])
  const H = (Number(m[3]) * Math.PI) / 180

  // OKLab → OKLCH 已给定 → LMS'
  const l_ = L + 0.3963377774 * C * Math.cos(H) + 0.2158037573 * C * Math.sin(H)
  const m_ = L - 0.1055613458 * C * Math.cos(H) - 0.0638541728 * C * Math.sin(H)
  const s_ = L - 0.0894841775 * C * Math.cos(H) - 1.291485548 * C * Math.sin(H)
  const l = l_ ** 3
  const mm = m_ ** 3
  const ss = s_ ** 3

  // OKLab → linear sRGB（Björn Ottosson 矩阵）
  let r = 4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss
  let g = -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss
  let b = -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss

  // linear → sRGB gamma
  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055
  const to255 = (x: number) =>
    Math.round(Math.min(1, Math.max(0, gamma(x))) * 255)
  r = to255(r)
  g = to255(g)
  b = to255(b)
  return `rgb(${r}, ${g}, ${b})`
}
