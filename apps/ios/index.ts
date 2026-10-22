// 自定义入口：storage-bootstrap 必须是首个 import —— ESM 静态链上任何
// 后续模块（i18n 词典、theme store 等）的初始化都发生在注册之后，
// 未水合写入由 pendingWrites 缓冲兜底（§4.4.2）。
import "./src/storage-bootstrap"

import "expo-router/entry"
