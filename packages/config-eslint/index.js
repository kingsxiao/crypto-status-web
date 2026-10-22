import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

/**
 * 共享 eslint 基座（flat config）：
 *  - ignores 与包边界矩阵在全仓唯一维护，根 `eslint .` 单次跑全仓
 *  - apps/web 的 src/context、src/components/ui 豁免沿用原 eslint.config.js
 */

// .zcode/.v2c/.video_agent：本地工具草稿目录，非项目源码，lint 与 git 均应忽略
export const ignores = [
  "**/dist",
  ".playwright-mcp",
  "coverage",
  ".zcode",
  ".v2c",
  ".video_agent",
]

/* ------------------------------ 包边界矩阵 ------------------------------ */

/** packages 一律不得 import apps（依赖方向：apps → packages 单向） */
const BAN_APPS = {
  group: ["@repo/web", "@repo/ios"],
  message: "packages 不得 import apps —— 依赖方向唯一：apps → packages",
}

/** core 是纯 TS 零外部依赖层：禁 react / data / react / platform */
const CORE_BANS = [
  BAN_APPS,
  {
    group: ["react", "react-dom", "@repo/data", "@repo/react", "@repo/platform"],
    message: "@repo/core 为纯 TS 零外部依赖层，不得依赖 react / data / react / platform",
  },
]

/** data / react 不得触碰 native 运行时注册层 */
const DATA_REACT_BANS = [
  BAN_APPS,
  {
    group: ["@repo/platform"],
    message: "只有 apps/* 允许 import @repo/platform（native 运行时注册单点）",
  },
]

/** 平台无关约束：禁 Vite 注入的 import.meta.env（key 一律由应用入口 configureCG 注入） */
const BAN_IMPORT_META_ENV = {
  "no-restricted-properties": [
    "error",
    { object: "import.meta", property: "env", message: "packages 不得读 import.meta.env —— 环境注入由 apps 入口完成" },
  ],
}

/** 平台无关约束：data/react/ui-tokens 禁裸 window/document（平台副作用一律走 core 端口） */
const BAN_WINDOW_DOCUMENT = {
  "no-restricted-globals": [
    "error",
    "window",
    { name: "document", message: "禁裸 document —— 平台副作用一律走 core 端口" },
  ],
}

export default tseslint.config(
  { ignores },

  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // 挂载期数据加载（load 前 setLoading/清 error）是 React 官方文档示范的
      // fetch-on-mount 模式，该规则会误伤，故关闭；级联渲染风险由代码评审把关。
      "react-hooks/set-state-in-effect": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
    },
  },

  /* ---- apps/web 内的既有豁免（原 eslint.config.js 语义） ---- */
  // shadcn/ui 生成代码：cva 变体对象与组件同文件导出是官方约定
  {
    files: ["apps/web/src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  // Context 文件：Provider 组件与配套消费 hooks 同文件是 React 官方推荐结构
  // （迁 monorepo 后位于 @repo/react）
  {
    files: [
      "apps/web/src/context/**",
      "packages/react/src/MarketDataContext.tsx",
      "apps/ios/src/lib/theme.tsx",
    ],
    rules: { "react-refresh/only-export-components": "off" },
  },

  /* ---- 包边界矩阵（§4.3） ---- */
  {
    files: ["packages/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: CORE_BANS }],
      ...BAN_IMPORT_META_ENV,
    },
  },
  {
    files: ["packages/data/**/*.{ts,tsx}", "packages/react/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: DATA_REACT_BANS }],
      ...BAN_IMPORT_META_ENV,
      ...BAN_WINDOW_DOCUMENT,
    },
  },
  {
    files: ["packages/platform/**/*.{ts,tsx}", "packages/ui-tokens/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [BAN_APPS] }],
      ...BAN_IMPORT_META_ENV,
    },
  },
)
