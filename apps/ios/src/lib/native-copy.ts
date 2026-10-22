/**
 * iOS 端平台措辞覆写（nt = native t）：
 * 共享词典（packages/core/src/i18n）的 en/zh 文案面向 web（「in your
 * browser」/「浏览器 localStorage」），原生端按平台改述「本机/本应用本地
 * 存储」。词典为 web 共享源不在 iOS 侧改动；仅渲染层经 nt() 取覆写。
 * 未覆写的 key 原样回落 t()。新增覆写保持与词典句式逐字对齐（只替换
 * 平台相关短语），便于词典变更时比对同步。
 */
import { getLocale, t, type MessageKey } from "@repo/core/i18n"

const OVERRIDES: Partial<Record<MessageKey, { en: string; zh: string }>> = {
  "about.what.p1": {
    en:
      "CRYPTO STATUS lays out live prices, technical signals, market regime and sentiment on a minimal canvas. It ships three color themes — Graphite Mono, Electric Blue and Midnight Violet — switchable anytime from the top right. All data is fetched straight from public APIs on this device: no backend, no analytics, no user data collected; your watchlist lives only in the app's local on-device storage.",
    zh:
      "CRYPTO STATUS 在一块极简的画布上呈现加密市场的实时行情、技术信号、牛熊状态与情绪指数。内置石墨黑白、电光蓝、暗夜紫三套主题色，可随时在右上角切换。所有数据直接从本机请求公开 API，无后端、无埋点、不收集任何用户数据；自选列表仅保存在本应用的本地存储中。",
  },
  "page.portfolio.desc": {
    en: "Local holdings & cost basis · live valuation & P&L · data never leaves this device",
    zh: "本地记录持仓与成本 · 实时估值与盈亏 · 数据不出本机",
  },
  "pf.empty.desc": {
    en: "Add your first holding to see live valuation, 24h P&L and cost P&L. Data stays on this device.",
    zh: "添加你的第一笔持仓，实时查看组合估值、24H 盈亏与成本盈亏。数据只保存在本机。",
  },
  "pf.privacy": {
    en: "Holdings live only in the app's local on-device storage — nothing is uploaded",
    zh: "持仓数据仅存于本应用本地存储，不上传任何服务器",
  },
  "page.settings.desc": {
    en: "Local data backup & restore · data never leaves this device",
    zh: "本地数据备份与还原 · 数据不出本机",
  },
  "set.backup.desc": {
    en:
      "Holdings, alerts, watchlist and event reminders live only in the app's local on-device storage — deleting the app wipes them. Export a JSON backup to keep around and restore anytime",
    zh:
      "持仓、预警、自选与事件提醒仅存于本应用本地存储，卸载应用即全部丢失；导出 JSON 备份随身保存，随时可还原",
  },
  "set.importHint": {
    en: "Pick a previously exported JSON file; after validation it overwrites the four domains in this app",
    zh: "选择此前导出的 JSON 文件；校验通过后覆盖本应用现有四域数据",
  },
  "set.note": {
    en:
      "Importing overwrites the four domains currently in this app with the backup file; to migrate devices, open this page on the new device and import.",
    zh:
      "导入会以备份文件覆盖本应用当前的四域数据；换设备或卸载重装后，在新设备打开本页导入即可还原。",
  },
}

/** 取词（iOS 覆写版）：覆写表命中返回平台措辞，否则回落共享词典 t() */
export function nt(key: MessageKey, params?: Record<string, string | number>): string {
  const o = OVERRIDES[key]
  if (o) return getLocale() === "en" ? o.en : o.zh
  return t(key, params)
}
