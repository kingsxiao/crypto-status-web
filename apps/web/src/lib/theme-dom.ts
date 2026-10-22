/**
 * web 端主题 DOM 订阅者 — core 主题 store 的平台副作用：
 *   - html[data-theme] 写入 + 250ms theme-anim 平滑过渡（index.css）
 *   - <meta name="theme-color"> 同步 PWA 状态栏/移动端顶栏颜色
 * main.tsx 引入一次即完成订阅（首帧主题由 index.html 内联脚本负责，
 * 与迁移前行为一致：冷启动不加过渡类）。
 */

import { getTheme, subscribeTheme, THEME_COLORS, type ThemeId } from "@repo/core/theme"

export function applyThemeDom(t: ThemeId) {
  const root = document.documentElement
  // 主题平滑过渡：临时挂 html.theme-anim（index.css 对 background-color /
  // border-color / color / fill / stroke 开 250ms 过渡），300ms 后移除。
  // 窗口内会临时覆盖 .card-hover 等元素的 transition-property，属已知可接受行为。
  root.classList.add("theme-anim")
  root.dataset.theme = t
  window.setTimeout(() => root.classList.remove("theme-anim"), 300)
  // 同步 PWA/移动端顶栏颜色（index.html 初始 #171717）
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[t])
}

subscribeTheme(() => applyThemeDom(getTheme()))
