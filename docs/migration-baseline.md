# Monorepo 迁移基线存档（2026-10-21）

## 单测双口径基线

- 迁移前（根仓单段输出，本会话实测）：`Test Files 25 passed (25)` / `Tests 217 passed (217)`
- workspaces 化后（根 `npm run test` = `npm run test --workspaces --if-present`，分段输出）：
  当前 `@repo/web` 段：`Test Files 25 passed (25)` / `Tests 217 passed (217)`

### 双锁核对命令（跨段求和，需每次迁移步跑）

```sh
npm run test 2>&1 | awk '/Test Files/ {f+=$3} /^ *Tests/ {t+=$2} END {print "SUM files=" f " tests=" t}'
```

锁定判据：`files ≥ 25 且 tests ≥ 217`（迁移只会新增包内测试，不得减少）。
该 awk 已在当前单段输出上校准（阶段 0：files=25 tests=217）。

## vite build 产物清单基线（workspaces 化后）

- 产物总文件数：100（含 .gz/.br 预压缩副本，`find apps/web/dist -type f | wc -l`）
- 页面 chunk：AboutPage/AlertsPage/CoinPage/ConverterPage/EventsPage/MarketsPage/
  OpinionBoard/PortfolioPage/SentimentPage/SettingsPage/VerdictPage + 入口 index-*
- PWA：sw.js、workbox-*.js、manifest.webmanifest、registerSW.js、三图标
- 命令：`npm run build`（= workspaces 聚合 → `@repo/web` 的 `tsc -b && vite build`）

## deploy.yml 路径基线

- dist 产物：`apps/web/dist`（:48 strip / :59 upload）
- e2e：`npm ci` 留根（:76），playwright 走 `working-directory: apps/web`（:83），
  报告路径 `apps/web/playwright-report/`（:90）
