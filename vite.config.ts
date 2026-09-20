/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"
import { compression } from "vite-plugin-compression2"
import { visualizer } from "rollup-plugin-visualizer"
import { VitePWA } from "vite-plugin-pwa"

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages 部署在 https://kingsxiao.github.io/crypto-status-web/ 子路径下，
  // CI 构建（GITHUB_ACTIONS=true）自动带上该前缀；本地 dev/preview 仍走根路径，
  // scripts/gzip-serve.mjs 无需感知子路径。
  base: process.env.GITHUB_ACTIONS ? "/crypto-status-web/" : "/",
  plugins: [
    react(),
    tailwindcss(),
    // PWA：预缓存应用壳（构建产物），可安装 + 弱网兜底。
    // 行情 API 一律不缓存（避免陈旧价格误导）；币种图标走 SWR 纯静态资源。
    // manifest 的 start_url/scope 由插件按 base 自动带前缀。
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "CRYPTO STATUS · 加密货币市场状态",
        short_name: "CRYPTO STATUS",
        description: "实时价格、牛熊周期、多空信号与市场情绪的加密货币市场状态仪表盘",
        lang: "zh-CN",
        theme_color: "#171717",
        background_color: "#0a0a0a",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        // 预缓存只装应用壳 —— index.html 直接引用的入口 JS/CSS/react-vendor
        // 加图标与清单（懒加载页面 chunk 一律不进安装清单）。此前默认
        // globPatterns 把全部页面 chunk 也算进 SW 安装量（32 entries /
        // 705 KiB），首访安装与首屏行情 API 抢带宽；收窄后页面 chunk 首访
        // 经下方 assets 的 SWR 规则按需落缓存，二访起同样离线可用。
        globPatterns: [
          "index.html",
          "registerSW.js",
          "manifest.webmanifest",
          "assets/index-*.js",
          "assets/index-*.css",
          "assets/react-vendor-*.js",
          "icon-192.png",
          "icon-512.png",
          "apple-touch-icon.png",
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/coin-images\.coingecko\.com\//,
            handler: "CacheFirst",
            options: {
              cacheName: "coin-images",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 应用自身静态资源（预缓存之外的页面/共享 chunk 等）：
            // SWR 先回缓存再看网络，二次访问起页面切换即时渲染且离线可用
            urlPattern: /\/assets\/.+\.(js|css|png|svg|woff2?)$/,
            handler: "StaleWhileRevalidate",
            options: { cacheName: "app-assets" },
          },
        ],
      },
    }),
    // 预压缩产物：.gz 供 nginx gzip_static / 静态托管直接下发（省去运行时压缩），
    // .br 是 Brotli，比 gzip 再小 ~15%，现代浏览器都支持。
    compression({
      algorithms: ["gzip", "brotli"],
      exclude: [/\.map$/, /\.br$/, /\.gz$/, /^sw\.js$/, /workbox/],
    }),
    // ANALYZE=1 npm run build 时输出 dist/stats.html 体积构成报告
    process.env.ANALYZE
      ? visualizer({ filename: "dist/stats.html", template: "treemap", gzipSize: true })
      : (false as unknown as Plugin),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    // 现代浏览器均已原生支持 modulepreload，legacy polyfill（~1.5KB）不再需要
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // vendor 单独成 chunk：页面迭代时 vendor 缓存不失效。
        // 必须用函数形式按模块 id 归组 —— 对象形式的包名解析不带头部
        // production 条件，会把 react-router 的 development 构建拉进产物。
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return "react-vendor"
          }
          // 其余 node_modules 保持 rollup 默认分配：只被某个懒加载页面用的
          // 依赖留在该页面 chunk，不会像统一 vendor 拆分那样被拖进首屏。
        },
      },
    },
  },
  test: {
    environment: "node",
    // .tsx 组件测试经文件首行 @vitest-environment jsdom pragma 切环境
    // （realtime.test.ts 先例），全局保持 node 以覆盖纯逻辑模块
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
