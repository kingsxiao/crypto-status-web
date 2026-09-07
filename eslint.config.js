import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["dist", ".playwright-mcp", "coverage"] },
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
  {
    // shadcn/ui 生成代码：cva 变体对象与组件同文件导出是官方约定
    files: ["src/components/ui/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Context 文件：Provider 组件与配套消费 hooks 同文件是 React 官方推荐结构
    files: ["src/context/**"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
)
