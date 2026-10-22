# 多端架构蓝图 v4 — crypto-status monorepo（Web + iOS）

> 版本：v4（2026-10-21，回应第三轮评审 6 条意见）· 分支 `feat/monorepo-ios` · 本文档是施工契约。
> 事实来源：本会话实读代码与配置 + 本会话实测（`npm run test` → Test Files 25 passed (25)、Tests 217 passed (217)；`npm view expo dist-tags --json` → latest=58.0.16、sdk-57=57.0.30；`npm view expo@57.0.30 peerDependencies --json` → 全 "*"；`curl api.expo.dev/v2/versions/latest` → `"expoGoSdkVersion":"57.0.0"`）+ 调研结论。仍未核实的外部断言见 §10-12。

---

## 0.1 评审意见 → v4 方案映射

| 评审意见 | v4 解法（落点） |
|---|---|
| 阻断·外部事实过时（npm latest 已 58，「对齐 57」推理不成立；RN/React 版本 registry 无法核实） | §9.0 重写为四判据 + 决策规则：项目 SDK = **expoGoSdkVersion 实测值**（本会话实测 57.0.0）+ 模拟器实证；dist-tags.latest=58.0.16 的漂移分支写明；「SDK 57=RN 0.86+React 19.2」撤为不预断言，施工时以 `expo install --fix` + `npm ls` 单实例实证 |
| web 回归风险·跨标签 storage 通道未入端口契约 | §4.4.3 事件端口改为**双通道契约**（自定义变更事件 + window "storage" 跨标签事件），默认实现逐字等价；步骤 14 明确「双通道一并收编」；走查加 web 双标签项 |
| 文档缺陷·§4.4.1/§4.4.3 悬挂引用 | §4.4 重组为 4.4.1/4.4.2/4.4.3 三个实存小节，树内引用全部对上 |
| 小误差·indicators.ts 行号 | 本会话 `grep -n` 复测：TECH_TIERS 在 **:9**、api type import 在 **:10**（评审称 :10/:11 与工作树不符，以 grep 输出为准）；verdict.ts:16 无争议 |
| 口径缺口·跨段求和 | §4.9 写明求和口径与核对命令模板（标注模板未在多段输出上运行，阶段 0 首跑校准） |
| 次要·ignores 与 e2e job 整体 | config-eslint 携带 `eslint.config.js:7` 全部 ignores；§6.2 给出 e2e job 逐步修法（:76 留根目录、:79/:82 working-directory 或 :82 改根脚本、:89 报告路径同步） |

---

## 1. 背景与硬约束

现状：单包 Vite + React 19 + Tailwind v4 + React Router 7 应用（GitHub Pages 子路径 + PWA），`@` 别名指向 `src/`（`vite.config.ts:88-92`），vitest node 默认环境 + `.tsx` 首行 pragma（`vite.config.ts:127-132`），基线 **25 文件 / 217 用例**（本会话 `npm run test` 实测）。

硬约束（本文全程遵守）：

1. 根 `package.json` 脚本**恰好**六条：`typecheck` / `lint` / `test` / `build` / `test:e2e` + `ios:export`——施工方硬性要求；`dev`/`preview`/`analyze`/`preview:gzip`/`test:watch` 下沉 apps/web（日常工作流一次性成本：加 `-w @repo/web` 前缀）。
2. Web 端行为（路由、页面、测试、PWA、首帧内联脚本、**跨标签 storage 同步**）迁移前后完全不变；CI 验证内容不变、调用点必改（§6.2）。
3. monorepo 工具采用调研结论（npm workspaces）；**iOS SDK 版本按 §9.0 四判据决策**（本会话实测结论：留 57），不预设。
4. screenGroups 5-7 组、key 唯一，覆盖全部页面（主导航 10 项 + `/coin/:id`，共 11 个页面文件）。
5. 目录树 ≤60 行；迁移步骤 ≤20 步、每步一行祈使句（§11）。

---

## 2. 技术选型

| 决策 | 选择 | 依据 |
|---|---|---|
| 包管理 | npm workspaces + 根 lockfile | Expo 官方一级支持；hoisted 即 Expo 测试矩阵最稳；`npm ci` 零迁移 |
| iOS 框架 | Expo（SDK 按 §9.0 决策，当前实测 57）+ expo-router | 项目 SDK 必须 = `expoGoSdkVersion` 实测值（本会话 57.0.0）；npm latest=58.0.16 的漂移处理见 §9.0 |
| UI | NativeWind v4 + react-native-reusables | Tailwind 类名直译 + shadcn 风格 RN 原语 |
| 弃选 | Capacitor / 裸 RN | WebView 壳非原生 / 无 EAS、本地构建需 CocoaPods |

---

## 3. 目标目录结构

```text
crypto-status-web/
├─ apps/
│  ├─ web/                          # @repo/web：现有 Vite 应用原样迁入（构建链不动）
│  │  ├─ index.html                 #   PWA + webfont + :39-53 首帧主题内联脚本（留守，配对齐测试）
│  │  ├─ vite.config.ts             #   alias @ 仍指本包 src/；vitest 配置原样（node+pragma）
│  │  ├─ playwright.config.ts       #   webServer: npm run build && npx vite preview:4173 --strictPort
│  │  ├─ public/  scripts/  e2e/    #   PWA 图标 / gzip-serve / 冒烟+预警触发用例
│  │  └─ src/
│  │     ├─ App.tsx  main.tsx  index.css    # 入口 + 三主题 token（唯一事实源，不动）
│  │     ├─ pages/  components/    # 11 页面 + shader/ui/layout/业务组件（纯 DOM 留守）
│  │     ├─ hooks/                 # DOM 专属：useHotkey/useRowNav/useReveal/usePageMeta/useNow
│  │     └─ lib/                   # web 专属：routePrefetch/utils(cn)/beep/backupDownload
│  │                               #   /csv 下载导出 / alerts 的 Notification 与提示音
│  └─ ios/                         # @repo/ios：Expo SDK 按 §9.0 决策（当前 57，随 expoGoSdkVersion 联动）
│     ├─ index.ts                  #   自定义入口：首位 import storage-bootstrap（§4.4.2）
│     ├─ src/storage-bootstrap.ts  #   installNativeRuntime：注册后端+事件桥+水合（单点）
│     ├─ src/HydrationGate.tsx     #   九键水合完成前不渲染业务树（§4.4.1）
│     ├─ app/                      #   expo-router：_layout + (tabs) 按 6 组 screenGroups 展开
│     ├─ src/                      #   iOS 组件/图表/expo-font/通知/备份 Share 导入适配
│     ├─ metro.config.js           #   仅 getDefaultConfig(projectRoot)，禁手写 watchFolders
│     ├─ app.json  eas.json
│     └─ package.json              #   不设 build 脚本；export=expo export --platform ios
├─ packages/
│  ├─ core/                        # 纯 TS 零外部依赖：models(领域类型)/ta/indicators/
│  │                               #   coinAnalysis/thresholds/format/events/crossAsset 引擎/
│  │                               #   i18n(词典+store)/storageBus(九键+守卫+异步后端语义)/
│  │                               #   双通道事件端口+事件名常量/backup 三函数/theme store(THEME_COLORS)
│  ├─ data/                        # http/cg(configureCG 注入 key)/api/kline/realtime-source
│  │                               #   (TRADE_SYMBOLS+解析纯函数+FeedStatus)/crossAsset(fetch,history)
│  ├─ react/                       # MarketDataContext/useMarketData/useRealtime/useFavorites/
│  │                               #   useAlerts/usePortfolio/useEventReminders/useTwoStepConfirm
│  ├─ platform/                    # native 子路径：installNativeRuntime=注册 AsyncStorage 后端
│  │                               #   +进程内事件桥；只许 apps/* import，packages 禁引
│  ├─ ui-tokens/                   # theme.ts：三主题 RN 色板（各含 chart-1..5 与状态栏色）
│  │                               #   +radius 档+字体栈；以 apps/web 的 index.css 为事实源对齐
│  ├─ config-ts/                   # tsconfig 基座：base/web/natural-esm/native
│  └─ config-eslint/               # eslint 基座 + ignores + 包边界矩阵（§4.3）
├─ package.json                    # workspaces + 恰好 6 条聚合脚本（§5）
└─ package-lock.json               # npm workspaces 单锁，npm ci 不变
```

（41 行，≤60 ✓）

---

## 4. 包边界与依赖方向

### 4.1 依赖方向图

```text
apps/web ──┐
           ├──▶ packages/react ──▶ packages/data ──▶ packages/core
apps/ios ──┤         │                                        ▲
           │         └────────(类型/纯函数)───────────────────┘
           ├──▶ packages/platform（仅 apps/* 可 import；ios 经 installNativeRuntime 单点注册）
           ├──▶ packages/ui-tokens（ios 消费）
           └──▶ config-ts / config-eslint（devDependencies）
```

### 4.2 core 的容量

`storage.ts`（52 行：九键 STORAGE_KEYS、safe 访问、旧键迁移，`src/lib/storage.ts:9-52`）整体进 core——它本身是带 `typeof localStorage` 守卫的平台降级代码。i18n 引擎随之闭合（`src/i18n/index.ts:3` 引 storageGet/Set、`:68` 模块加载即 `initLocale()`），「import 时执行一次」语义不推翻，fng.test/crossAsset.test 的 node 行为零漂移。

### 4.3 eslint 包边界矩阵（收尾冻结；config-eslint 同时携带 `eslint.config.js:7` 的 ignores——dist/.playwright-mcp/coverage/.zcode/.v2c/.video_agent——否则根 lint 误伤本地草稿目录）

| 规则 | 内容 |
|---|---|
| R1 | 任何 `packages/*` 禁 import `apps/*` |
| R2 | `core` 禁 import `react`/`data`/`@repo/platform` 及 npm 运行时依赖 |
| R3 | `data`/`react` 禁 import `@repo/platform` |
| R4 | `packages/*` 禁 `import.meta.env`；core 外禁裸 `document`/`window`（core 内仅允许带 typeof 守卫的降级点） |

### 4.4 storageBus 与事件端口

#### 4.4.1 异步后端语义 + HydrationGate（解「AsyncStorage 无同步读」）

**契约事实**：`storageGet/storageSet` 同步签名（`storage.ts:28,44`），AsyncStorage 无同步读。RN 侧 8 个非 locale 键的同步初读点：alerts `useState(read)`/`useState(readSound)`（`alerts.ts:125-126`）、useFavorites（`:13,28`）、eventReminders `useState(readReminders)`（`:100`）、portfolio `useState(read)`（`:60`）、theme getSnapshot 懒读（`useTheme.ts:44-46`）、history `loadHistory()`（`history.ts:27-35`）、chartPrefs。**最坏路径是数据丢失**：`upsertToday`（`history.ts:48-70`）空读后 `saveHistory`（`:37-38`）整体覆写，RN 首启一次访问即可清掉判断史；favorites/alerts/portfolio 的 toggle/markTriggered 同为读-改-写全量覆写族。

**v3/v4 语义（core storageBus 统一实现，web 路径零变化）**：

1. 双形态后端：默认后端 = 现 storage.ts 守卫版 localStorage 直连（web/node 同步逐字等价、不走缓存）；native 注册异步后端后切换「内存缓存模式」。
2. 注册→水合→放行：`installNativeRuntime()`（platform/native 单点，一次注册后端+事件桥）返回 `storageReady`：九键 + 两个旧连字符键全量读入内存 Map（旧键迁移语义等价执行），完成置 `hydrated=true`。
3. 读走缓存：注册后 `storageGet` 只读内存 Map（同步签名保持）；写 = 写 Map + fire-and-forget 落 AsyncStorage。
4. 挂起写合并（pendingWrites）：水合前的 `storageSet` 进缓冲不丢弃；水合完成时**仅当持久化无该键**才落盘（首访语义保持），**已存在则丢弃缓冲**（防检测值覆盖用户持久化），随后 `hydratePersistedState()` 校正 i18n/theme store。
5. HydrationGate：apps/ios 根布局在 `storageReady` resolve 前不渲染业务树（配 SplashScreen）——读-改-写函数只能渲染后触发，结构性消灭空读覆写。
6. DEV 断言：`assertStorageReady(label)`，dev 构建下域写路径在未水合异步后端上调用即 warn 报点名。

#### 4.4.2 ESM 提升时序（解「注册前首访落盘丢失」）

ESM 静态 import 先于入口模块体：入口若静态 import App/_layout，core/i18n 会在注册前被拉起，`initLocale` 首访落盘（`i18n/index.ts:61`）写进 no-op 后端丢失。三重防线：

- 防线一（顺序）：`apps/ios/index.ts` **第一条** import 是叶子模块 `src/storage-bootstrap.ts`（依赖链只有 platform/native→core 注册函数，不含 app/React 代码），体内立即 `installNativeRuntime()`；app 树经动态 import 或 HydrationGate 接入。
- 防线二（缓冲）：即使顺序失误，pendingWrites 保证注册前写入不丢、持久化优先——时序降级为体验问题而非正确性问题。
- 防线三（校正）：水合后 `hydratePersistedState()` 统一校正，冷启不重复检测重写。

#### 4.4.3 事件端口：双通道契约与防线（解「跨标签 storage 通道回归」+「事件桥漏注册」）

**现状契约是双通道**：各域 hook 同时订阅①自定义变更事件与②window `"storage"` 跨标签事件——成对出现于 `useFavorites.ts:32-33`、`alerts.ts:133-134`、`portfolio.ts:64-65`、`eventReminders.ts:104-105`；backup 导入后派发四事件（`backup.ts:158-165`）。**core 事件端口必须同等双通道**：

- `emitChange(name)`：默认实现 = `typeof window` 守卫版 `window.dispatchEvent(new CustomEvent(name))`（storage 写路径派发后另一标签页由②通道感知——web 的 storage 事件由浏览器在跨标签写入时自动触发，无需手动派发）。
- `subscribeChange(name, cb)`：默认实现 = 同时挂 `window.addEventListener(name, cb)` **与** `window.addEventListener("storage", cb)`（守卫齐全），返回统一清理函数——两通道缺一即造成 web 跨标签静默回归，迁移时**一并收编、禁止只迁自定义事件**。
- 事件名常量单点导出（修复 `backup.ts:44-45` 复刻字面量：`crypto-status:favorites-change` 等）。
- native 桥：进程内 EventEmitter 实现同接口（无跨标签概念，双通道合一）。
- 防线：`installNativeRuntime` 装完自检事件桥非 no-op（DEV 抛错）；core `emitChange` 在「异步后端模式 + 总线 no-op + __DEV__」首次 warn；走查固定项「iOS 切换收藏→另一屏列表同步」+「web 双标签页同步」双端冒烟。

### 4.5 useTheme 拆分与三契约对齐

theme store（状态+storageSet 持久化+订阅）与 `THEME_COLORS`（`useTheme.ts:25`：mono `#171717`/blue `#020817`/violet `#030712`）进 core；DOM 副作用（`useTheme.ts:51-70`）拆 web 订阅者，同步回调执行，web 行为等价。**第三份契约**：`index.html:39-53` 首帧内联脚本（裸写键名与色值，防闪白关键路径，必须留守内联）——新增三契约对齐测试（apps/web vitest 解析 index.html，断言键名 === core STORAGE_KEYS.theme/旧键映射、色值 === THEME_COLORS）；RN 状态栏色以 core THEME_COLORS 为唯一事实源。

### 4.6 realtime 拆分与验收口径

`realtime.ts:10` import react、`:41` TRADE_SYMBOLS、`:46` useRealtime；`api.ts:10` 引其常量——拆：TRADE_SYMBOLS + 类型 + 消息解析/降级决策纯函数（现内联 `ws.onmessage`，`realtime.ts:186-229`）→ `@repo/data/realtime-source`；useRealtime → `@repo/react`。验收：状态机时序与参数（FLUSH_MS=1000、8s 超时、gen/retries、引用稳定性）**逐字保留**；解析函数是**新代码必须补单测**（以现 onmessage 行为为参照做等价断言）。

### 4.7 类型环解法

`indicators.ts:10`、`verdict.ts:16` 的 `import type` 自 api（行号本会话 grep 复测：indicators 的 TECH_TIERS 在 :9、api type import 在 :10），data 侧 `history.ts:7` 反向引 GRADE_TIERS。步骤固定「models 先行」：api.ts 领域类型 → `core/models`，两引擎改引，api.ts re-export 保 web 兼容。

### 4.8 backup 去向

build/validate/import 三函数进 core（经 storageBus + 双通道事件端口派发四事件）；`downloadBackup`（`backup.ts:95-107`）留 apps/web；iOS 导出 = expo-sharing、导入 = expo-document-picker 调同一 `importBackup`，适配代码在 **apps/ios/src**（§7 settings 组归属）。

### 4.9 测试 wiring 与双锁求和口径

- 各 package 自带 vitest 配置（node + `.tsx` 首行 pragma）与 vitest devDep；`@repo/react` 加 jsdom + @testing-library/react；测试文件随模块**同步骤**移动。
- **双锁基线（本会话实测）**：`npm run test` → Test Files 25 passed (25)、Tests 217 passed (217)。
- **跨段求和口径**：根 `npm run test --workspaces --if-present` 输出按 workspace 分段，核对 = **各段 Test Files 与 Tests 计数求和**后 ≥25 且 ≥217。求和命令模板（阶段 0 首跑时按实际分段输出校准字段位——本会话只有单段基线，模板未在多段输出上运行过，如实标注）：

```bash
npm run test --workspaces --if-present 2>&1 | \
  awk '/Test Files/{f+=$3} /Tests/{t+=$2} END{print "files="f, "tests="t}'
```

- i18n alignment 测试随词典迁 core；新增：三契约对齐测试（§4.5）、realtime 解析单测（§4.6）。

### 4.10 ui-tokens 与 Tailwind v4

index.css（`@theme inline`，`:100-134`）唯一事实源且一字节不动；`ui-tokens/theme.ts` 手工对齐 RN 三主题：每主题各自完整 chart-1..5（blue `:66-70`、violet `:93-97`）、`--up/--down` 共享、radius 基值与 sm..xl 档（`:128-131`）、字体栈（`:132-134`）、状态栏色（转述 core THEME_COLORS）；对齐测试锚定关键值。

### 4.11 注入最小化

不注入 WebSocket/fetch/setInterval/AbortController（RN 全局内置，状态机逐字保留）；唯一注入 cg demo key（`cg.ts:16-19` → `configureCG`，web 入口传参）；时钟不全面注入（`buildIcs` 已有 nowMs 默认参数 `events.ts:658`；backup exportedAt 与 crossAsset fetchedAt 保持 Date.now 默认；events 外推纯锚定 lastKnown 无需时钟，已 grep 证实）。

---

## 5. 根 package.json 与脚本契约

```jsonc
{
  "name": "crypto-status-monorepo",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "build": "npm run build --workspaces --if-present",
    "test:e2e": "npm run test:e2e -w @repo/web",
    "ios:export": "npm run export -w @repo/ios"
  }
}
```

- 六条是**施工方硬性要求**（不另作论证）；日常工作流：`npm run dev -w @repo/web`（或 cd apps/web），一次性习惯成本。
- **build 语义**：apps/ios 与 packages/* 均不设 build → 根 `build` 实际仅 apps/web 的 `tsc -b && vite build`，与现状一致。
- **test:e2e 的 cwd**：`-w @repo/web` 在 workspace 目录执行，webServer `npm run build && npx vite preview --port 4173 --strictPort`（`playwright.config.ts:24`）语义不变。
- apps/ios：`start`/`ios`/`export`(expo export --platform ios)/`typecheck`/`lint`；无 build。

---

## 6. Web 行为不变性契约

### 6.1 内容不变清单

| 项 | 不变内容 | 出处 |
|---|---|---|
| 路由 | 11 条路由 + 兜底、HashRouter、懒加载 | `src/App.tsx:104,115-127` |
| 页面 | 11 个页面文件（仅 import 改 `@repo/*`） | `src/pages/*` |
| 单测 | 25 文件/217 用例双锁（跨段求和）、node+pragma、对齐校验随迁 | §4.9 |
| E2E | 冒烟+预警触发全 mock、webServer 命令不变 | `playwright.config.ts`、`e2e/` |
| PWA/构建 | manifest/预缓存/SWR/chunk 隔离/vendor/预压缩/base 原样 | `vite.config.ts:15-126` |
| 首帧脚本 | index.html:39-53 内联脚本留守 + 三契约对齐测试锁死 | §4.5 |
| **跨标签同步** | 自定义事件 + window "storage" 双通道语义逐字等价（四处成对订阅） | §4.4.3 |
| 运行时 | i18n/theme import 时初始化、旧键迁移、事件同步逐字等价 | `i18n/index.ts:57-68`、`storage.ts:27-52` |

每步迁移后：`npm run typecheck && npm run lint && npm run test`（双锁求和核对）；阶段收尾：`npm run build`（产物清单比对）+ `npm run test:e2e`。

### 6.2 CI 必改清单（deploy.yml，行号本会话 grep/sed 实测）

| 调用点 | 现状 | 迁移后 |
|---|---|---|
| `:37` lint、`:40` test | 根=本包 | 根=聚合（覆盖只增不减，调用点可不改） |
| `:43` build | 构建 web | 语义不变（§5），产物路径变 |
| `:48` `find dist …` | dist | `apps/web/dist` |
| `:59` Pages artifact `path: dist` | dist | `apps/web/dist`（不改则部署空产物） |
| e2e job `:76` `npm ci` | 根目录 | **必须留在根目录**（workspaces 需根 lockfile 安装） |
| e2e job `:79` install chromium、`:82` `npx playwright test` | 根目录起，找不到 apps/web 的 config | 两步加 `working-directory: apps/web`，**或** `:82` 改为根 `npm run test:e2e`（`:79` 可留根）——勿只改 :82 一行 |
| e2e job `:89` artifact `path: playwright-report/` | 根目录 | 与 :82 的运行目录一致（`apps/web/playwright-report` 或保持根，取决于上一步选择） |

另增设 ios job：`npm ci`（根）+ `npx expo-doctor` + `npm run ios:export`（working-directory: apps/ios）。

---

## 7. iOS 端结构与页面分组（screenGroups）

导航：expo-router **Tabs 五席**（总览/行情/信号/工具/持仓）+ Stack（coin 详情、事件、预警、设置、关于）。

| key | 标题 | 移植页面（迁移后路径） | 共享依赖 |
|---|---|---|---|
| `dashboard` | 总览仪表盘 | `apps/web/src/pages/DashboardPage.tsx` | `@repo/core`（indicators/coinAnalysis/format/models）、`@repo/react`（MarketDataProvider/useMarketData/useLive/useRealtime）、`@repo/data`（api/realtime-source） |
| `markets` | 行情与币种详情 | `apps/web/src/pages/MarketsPage.tsx`、`apps/web/src/pages/CoinPage.tsx` | `@repo/core`（ta/models/format/storageBus-chartPrefs）、`@repo/data`（kline/realtime-source）、`@repo/react`（useLive/useFavorites） |
| `signal` | 信号与情绪 | `apps/web/src/pages/SentimentPage.tsx`、`apps/web/src/pages/VerdictPage.tsx` | `@repo/core`（crossAsset verdict/anchors/i18n-LMsg）、`@repo/data`（crossAsset fetch/history）、`@repo/react`（MarketDataProvider） |
| `tools` | 换算器与事件日历 | `apps/web/src/pages/ConverterPage.tsx`、`apps/web/src/pages/EventsPage.tsx` | `@repo/core`（events/buildIcs/format/storageBus）、`@repo/react`（useEventReminders） |
| `portfolio` | 持仓管理 | `apps/web/src/pages/PortfolioPage.tsx` | `@repo/core`（computeStats/parseHoldingsCsv/storageBus）、`@repo/react`（usePortfolio/useFavorites）、`@repo/data`（api 行情） |
| `settings` | 预警与设置 | `apps/web/src/pages/AlertsPage.tsx`、`apps/web/src/pages/SettingsPage.tsx`、`apps/web/src/pages/AboutPage.tsx` | `@repo/core`（isTriggered/distancePct/backup 三函数/theme store+THEME_COLORS/i18n）、`@repo/react`（useAlerts/useTheme）、`@repo/ui-tokens`（主题色板）；备份 Share 导出导入适配在 **apps/ios/src**（expo-sharing/DocumentPicker 接 core importBackup） |

6 组、key 唯一、覆盖全部 11 个页面文件（10 导航项 + coin 详情）。

**设计系统要点**：三主题 token 唯一事实源 = `apps/web/src/index.css`（`@theme inline` `:100-134`；mono background `oklch(0.09 0 0)`/primary `oklch(0.985 0 0)`/`--radius 0.625rem`；blue/violet 为 shadcn dark 原值）；**状态栏色三主题映射唯一事实源 = core 的 THEME_COLORS**（`useTheme.ts:25`），web 端 `index.html:39-53` 首帧内联脚本与 RN 状态栏均以此为对齐目标，三契约由对齐测试锁定；RN 三主题各自完整 chart-1..5（`index.css:66-70`/`:93-97`），`--up/--down` 全主题共享；radius sm..xl 档；字体 Inter + JetBrains Mono（web 经 Google Fonts `index.html:24-28`，iOS 用 expo-font 打包同名字体、失败回退系统 SF/等宽）；卡片层级 card/border/muted + 1px hairline；图表 react-native-svg 自绘、按当前主题取 chart 色板、保留 `ta.ts` 暖机期 null 口径。

---

## 8. 多端演进路径

- **阶段 0 · monorepo 化**：workspaces + apps/web 迁入 + deploy.yml 调整 + 基线存档（双锁 25/217 + 产物清单）。验收：根六脚本全绿、一次真机 Pages 部署成功。
- **阶段 1 · 抽包**：core（storageBus+双通道端口 → models → i18n → 纯逻辑 → backup/theme store）→ data（realtime 拆分 → 取数层）→ react → ui-tokens；每步迁入即切 import 删源。
- **阶段 2 · iOS MVP**：按 §9.0 决策 SDK → 模板 + bootstrap/HydrationGate + 壳 → dashboard→markets→signal→tools→portfolio→settings 逐组移植。
- **阶段 3 · 原生能力与发布**：本地通知、系统提示音、expo-updates OTA、EAS 云构建 → TestFlight；可选 Turborepo；Android 由 Expo 覆盖。
- **CI**：web job（现管线 + 路径修正）+ ios job（doctor + export）。

---

## 9. 本地开发与验证命令

### 9.0 施工前置：SDK 决策四判据（本会话 2026-10-21 实测记录在案）

```bash
npm view expo dist-tags --json
# 本会话实测：latest=58.0.16、sdk-57=57.0.30（57 稳定线存在）
curl -s https://api.expo.dev/v2/versions/latest | grep -o '"expoGoSdkVersion":"[^"]*"'
# 本会话实测："expoGoSdkVersion":"57.0.0"（Expo Go 当前支持的 SDK）
curl -sIL "https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.tar.gz" | head -n5
# 通过判据：HTTP 200/302 可循环到最终 200
```

**决策规则**：

1. **项目 SDK = `expoGoSdkVersion` 实测值**（Expo Go 只支持该 SDK），而非 npm dist-tags.latest——当前 57.0.0 + sdk-57=57.0.30 稳定 → **结论：SDK 57**。dist-tags.latest（58.0.16）≠ expoGoSdkVersion（57.0.0）的漂移说明 58 已上 npm 而 Expo Go 仍 57，不据此升级。
2. **模拟器实证兜底**：装对应 tarball + openurl 打开项目，无 `Project is incompatible` 才算冻结（经验证的事实优先于推理）。
3. **漂移分支**：复跑时若 expoGoSdkVersion 已变（如 58）→ Expo Go 政策下项目必须跟升，步骤 16 起全文版本号同步；且按调研 changelog，58 下 Xcode27/UIKit scene 默认开启，省一个 opt-in。
4. **RN/React 具体版本不预断言**（`npm view expo@57.0.30 peerDependencies` 全 "*"，registry 无法核实）：施工时以 `npx expo install --fix` 锁定 + `npm ls react react-native` 确认单实例为准。

**离线回退**：以本文档记录的本会话实测值为准并标注「未复验」，恢复网络后 48h 内补验；矛盾则停工复评。

### 9.1 日常命令

```bash
npm install                          # 根目录一次装全仓
npm run dev -w @repo/web             # Vite dev（5173 不变）
cd apps/ios && npx expo start        # Metro 从 app 目录启动
npm run typecheck && npm run lint && npm run test   # 每步关卡（双锁跨段求和，§4.9）
npm run build && npm run test:e2e    # 阶段收尾（产物清单比对 + Playwright）
npm run ios:export                   # expo export --platform ios
```

### 9.2 模拟器验证（零 CocoaPods/零 watchman）

```bash
# 路径 A：cd apps/ios && npx expo start --ios
# 路径 B（脚本化）：
xcrun simctl list devices | grep Booted
tar -xzf /tmp/expo-go.tar.gz -C /tmp/expo-go-extracted   # tarball 版本随 §9.0 决策
xcrun simctl install booted "$(find /tmp/expo-go-extracted -maxdepth 2 -name '*.app' | head -n1)"
cd apps/ios && nohup npx expo start --port 8081 > /tmp/metro-ios.log 2>&1 &
xcrun simctl openurl booted "exp://127.0.0.1:8081"
xcrun simctl io booted screenshot ~/Desktop/crypto-ios.png
```

走查固定项：① 六组页面渲染；② iOS 切换收藏 → 另一屏列表同步（事件桥冒烟）；③ **web 双标签页同步**（storage 通道回归项）；④ 冷启语言/主题恢复（水合链路）；⑤ 判断史首启不丢（history 覆写防线）。

---

## 10. 风险清单

1. **双副本窗口**：每步「迁入即切 import、当步删源」+ 双锁求和核对是唯一防线。
2. **RN 未水合覆写丢数据**：upsertToday（`history.ts:48-70`）与读-改-写族——防线四层（§4.4.1）+ 走查项 ⑤。
3. **ESM 注册时序**：initLocale 首访落盘（`i18n/index.ts:61`）——三重防线（§4.4.2）。
4. **事件桥/双通道静默失效**：漏注册或只迁自定义事件丢 storage 通道——单点 installNativeRuntime + DEV 自检 + 走查项 ②③；storage 通道丢失是 **web 回归**，iOS 侧问题反而不存在（无跨标签）。
5. **三契约漂移**：index.css / THEME_COLORS / index.html:39-53 内联脚本——对齐测试锁死。
6. **测试假绿**：双锁 ≥25 文件且 ≥217 用例，**跨段求和口径**（§4.9）；模板命令需阶段 0 校准。
7. **realtime 拆分**：TRADE_SYMBOLS 先落 data；解析函数新代码补单测；状态机参数逐字保留。
8. **类型环**：models 先行（`indicators.ts:10`、`verdict.ts:16`，行号本会话 grep 复测）。
9. **CI 部署错产物**：deploy.yml `:48/:59` 路径 + e2e job 逐步修法（§6.2，`:76` 必须留根目录）；阶段 0 真机部署为关卡。
10. **token 受控双源**：index.css（不动）与 ui-tokens/theme.ts 靠对齐测试；状态栏色以 core THEME_COLORS 为准。
11. **字体与每主题 chart 色板**：iOS 需 expo-font 打包 Inter/JetBrains Mono；chart-1..5 每主题一套。
12. **外部生态断言（部分已实测、部分未核实）**：已实测——dist-tags（latest=58.0.16/sdk-57=57.0.30）、expoGoSdkVersion=57.0.0、expo@57.0.30 peers 全 "*"；仍未核实——「SDK 57=RN 0.86+React 19.2」（registry 无法核实，已降级为施工时 `expo install --fix` + `npm ls` 实证）、SPM 未成默认、Xcode 27 opt-in UIKit scene、Metro 从 app 目录启动——施工时以 expo-doctor 与实跑为准。
13. **SDK 漂移**：expoGoSdkVersion 与 dist-tags.latest 不同步（当前 57 vs 58.0.16）——复跑 §9.0 判据 1，Go 升级即项目跟升（§9.0 规则 3）。
14. **单 react 实例**：以 `npm ls react react-native` 单副本为准（hoist）；不预断言具体版本号。
15. **无 CocoaPods**：dev-client/EAS local build 不可行，原生构建走 EAS 云；本地 native 前的 UIKit scene 处理取决于最终 SDK（§9.0 规则 3/4）。

---

## 11. 迁移步骤（20 步，每步一行祈使句；「迁入即切 import、当步删源」内置）

1. 按 §9.0 四判据跑外部验证并做 SDK 决策（当前双源实测留 57；expoGoSdkVersion 漂移则升并全文同步）。
2. 在根 package.json 声明 workspaces 与恰好六条聚合脚本，把现有应用 git mv 原样迁入 apps/web。
3. 修正 deploy.yml（dist 改 apps/web/dist、e2e job :79/:82 加 working-directory 或 :82 改根 test:e2e、:89 报告路径同步、:76 保持根目录）并完成一次真机 Pages 部署验证。
4. 新建 config-ts 与 config-eslint 包（携带 eslint.config.js:7 的全部 ignores 与现有规则），并为各 packages 配 vitest 与 jsdom/@testing-library 按需 devDeps。
5. 存档迁移基线：根 npm run test 双口径（25 文件/217 用例，本会话已实测）与 vite build 产物清单，并校准跨段求和命令。
6. 把 storage.ts 迁为 core/storageBus 并实现异步后端语义（缓存/水合/pendingWrites/读缓存/DEV 断言），当步切 import 删旧文件。
7. 把 api.ts 的领域类型抽成 core/models，indicators 与 crossAsset/verdict 改引 core/models 消除类型环。
8. 把 i18n 词典与引擎迁入 core（经 storageBus 持久化并补 setLocale 守卫），alignment 测试随迁并删旧文件。
9. 迁纯逻辑模块进 core（ta/indicators/coinAnalysis/thresholds/format/events/crossAsset 引擎与各域纯函数），当步切 import 删源。
10. 迁 backup 三函数进 core（经 storageBus 与双通道事件端口派发四事件），downloadBackup 留 apps/web。
11. 迁 useTheme 为 core theme store（THEME_COLORS 随迁）并把 DOM 副作用拆成 web 订阅者，新增 index.html 内联脚本三契约对齐测试。
12. 拆 realtime.ts：TRADE_SYMBOLS/类型/解析纯函数进 data（新函数补单测）、useRealtime 进 react，api.ts 改引 data 内常量。
13. 迁取数层进 data（http/cg/api/kline/crossAsset），cg 的 VITE_CG_KEY 改为 apps/web 入口 configureCG 注入。
14. 迁 hooks 与 context 进 react（MarketDataContext/useMarketData/useFavorites/useAlerts 等），自定义事件与跨标签 storage 双通道一并收编进 core 端口。
15. 建 ui-tokens 包：以 index.css 为唯一事实源对齐 RN 三主题 theme.ts（含每主题 chart 色板/radius 档/字体栈/状态栏色）并加对齐测试。
16. 用 create-expo-app 在 apps/ios 建应用（SDK 按 §9.0 决策）并接 expo-router/NativeWind，入口首位 import storage-bootstrap 走 installNativeRuntime 单点注册。
17. 在 apps/ios 加 HydrationGate 与 hydratePersistedState，水合完成前不渲染业务树并校正 locale/theme 与九键缓存。
18. 按 screenGroups 搭 iOS 壳并依 dashboard→markets→signal→tools→portfolio→settings 逐组移植，每组跑 ios:export 与模拟器走查（含收藏联动与 web 双标签跨通道冒烟）。
19. 在 iOS settings 组落地备份导出导入（expo-sharing/DocumentPicker）与本地通知、系统提示音，并配 eas.json 与 CI ios job（expo-doctor + ios:export）。
20. 收尾冻结 eslint 包边界矩阵（禁反向 import apps、禁 packages import platform 等）并更新 README 指向本文档。
