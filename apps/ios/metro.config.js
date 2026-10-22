const path = require("path")
const { getDefaultConfig } = require("expo/metro-config")

// 仅默认配置 + eventPort 垫片重定向（仍禁手写 watchFolders）；@repo/* 经 npm
// workspaces 符号链接由默认 resolver 的 node_modules 语义自然可达。
const config = getDefaultConfig(__dirname)

// eventPort iOS 垫片重定向（修六页 Render Error「undefined is not a function」）：
// core 原版的 `typeof window !== "undefined"` 守卫在 RN 放行（window === global
// 恒真），window.addEventListener 却不存在 → 四域 hook 订阅即抛 TypeError。
// native 平台把 eventPort 的解析结果重定向到本应用垫片（能力检测：浏览器双
// 通道 / native 进程内桥，即 core 文件头注释的设计）；web 平台不重定向，继续
// 用 core 原版。注意 metro 委托自定义 resolver 时会把 context.resolveRequest
// 替换为内置 resolver（metro-resolver/src/resolve.js），故下方调用无递归。
const eventPortShimPath = path.resolve(__dirname, "src/lib/eventPortShim.ts")
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolution = context.resolveRequest(context, moduleName, platform)
  if (
    platform !== "web" &&
    resolution != null &&
    resolution.type === "sourceFile" &&
    /[\\/]eventPort\.tsx?$/.test(resolution.filePath)
  ) {
    return { type: "sourceFile", filePath: eventPortShimPath }
  }
  return resolution
}

module.exports = config
