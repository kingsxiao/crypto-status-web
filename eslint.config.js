import config from "@repo/config-eslint"

// 全仓唯一 eslint 配置：根 `npm run lint`（eslint .）一次跑 apps + packages，
// ignores 与包边界矩阵见 @repo/config-eslint。
export default config
