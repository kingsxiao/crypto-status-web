// @vitest-environment jsdom
/**
 * 行情页排序 null 语义回归（MarketsPage 排序比较器，64c9f48 P1 修复）：
 * Binance 兜底数据源缺失的列（1h/7d/30d 涨跌、ATH）取值为 null，
 * 排序时 null 恒排末尾 —— 无论升序降序，且不与真实 0 混排。
 *
 * 另覆盖键盘交互：'/' 聚焦搜索（useSlashFocus）、表格行导航
 * （useRowNav：↑↓ 在可进详情的行间移动、Enter 激活跳转、行内控件不劫持）。
 *
 * 刻意不断言列宽与实时重排时序，也不在渲染后改 mock tickers 驱动重排。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { setLocale } from "@repo/core/i18n"
import { MarketsPage } from "@/pages/MarketsPage"
import type { Coin, Snapshot } from "@repo/data/api"

/* ------------------------------ mock 数据层 ------------------------------ */

/** 占位图标：空串会触发 jsdom 的「重复下载整页」警告 */
const MOCK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"

function makeCoin(partial: Partial<Coin> & Pick<Coin, "id" | "name" | "current_price">): Coin {
  return {
    symbol: partial.id.slice(0, 3),
    image: MOCK_IMG,
    market_cap: partial.current_price * 1000,
    market_cap_rank: 1,
    total_volume: 1,
    high_24h: 1,
    low_24h: 1,
    ath: 1,
    ath_change_percentage: null,
    circulating_supply: 1,
    ...partial,
  }
}

/** 模拟 Binance 兜底行：7d 涨跌缺失（null），与真实 0 并存以验证不混排 */
const COINS: Coin[] = [
  makeCoin({ id: "alpha", name: "Alpha", current_price: 50, price_change_percentage_7d_in_currency: 5 }),
  makeCoin({ id: "beta", name: "Beta", current_price: 10, price_change_percentage_7d_in_currency: 1.2 }),
  makeCoin({ id: "gamma", name: "Gamma", current_price: 30, price_change_percentage_7d_in_currency: -3 }),
  // 真实 0：降序时排在正值之后、负值之前，而不是被当成缺失压到末尾
  makeCoin({ id: "zero", name: "Zero", current_price: 20, price_change_percentage_7d_in_currency: 0 }),
  // 缺失行：无论升降序恒排末尾（价格再高/再低也不参与排位）
  makeCoin({ id: "nullbig", name: "NullBig", current_price: 99, price_change_percentage_7d_in_currency: null }),
  makeCoin({ id: "nullsmall", name: "NullSmall", current_price: 1, price_change_percentage_7d_in_currency: null }),
]

const snapshot: Snapshot = {
  coins: COINS,
  global: {
    total_market_cap_usd: 1, total_volume_usd: 1, market_cap_change_24h_pct: 0,
    btc_dominance: 1, eth_dominance: 1, active_cryptocurrencies: 1,
  },
  fng: [],
  btcChart: { prices: [] },
  fetchedAt: 0,
}

vi.mock("@repo/react/MarketData", () => ({
  useMarket: () => ({
    snapshot,
    error: null,
    loading: false,
    refreshing: false,
    lastUpdated: 0,
    refresh: () => {},
  }),
  // 实时价固定为空：排序取值全部回退快照 current_price，输入确定
  useLive: () => ({}),
}))
vi.mock("@repo/react/useFavorites", () => ({
  useFavorites: () => ({ favorites: [], has: () => false, toggle: () => {} }),
}))
// 交易对集合收敛为两个可进详情的币（alpha/gamma）：键盘行导航只索引这些行，
// 断言「↑↓ 跳过不可进详情行」时数据确定，不依赖真实上线清单
vi.mock("@repo/data/realtime-source", () => ({
  TRADE_SYMBOLS: {
    alpha: { binance: "ALPHAUSDT", okx: "ALPHA-USDT" },
    gamma: { binance: "GAMMAUSDT", okx: "GAMMA-USDT" },
  },
}))

/* -------------------------------- 断言工具 -------------------------------- */

/** 按表格行序读出币种名（AssetCell 名称列的固定类名） */
function rowNames(container: HTMLElement): (string | null | undefined)[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (tr) => tr.querySelector<HTMLElement>("span.text-sm.font-semibold")?.textContent,
  )
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<MarketsPage />} />
        <Route path="/coin/:id" element={<div data-testid="coin-page" />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 可键盘导航的行（有交易对 → data-row-nav-row） */
function navRows(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("tr[data-row-nav-row]")]
}

describe("MarketsPage 排序 null 语义", () => {
  beforeEach(() => {
    setLocale("zh") // 表头取词确定（jsdom 默认 navigator.language 是 en-US）
  })
  afterEach(cleanup)

  it("默认按排名升序渲染全部行", () => {
    const { container } = renderPage()
    expect(rowNames(container)).toHaveLength(6)
  })

  it("7D 降序：缺失行恒排末尾，真实 0 不与缺失混排", () => {
    const { container } = renderPage()
    fireEvent.click(screen.getByRole("button", { name: "7D" })) // 非排名列首点默认降序
    expect(rowNames(container)).toEqual(["Alpha", "Beta", "Zero", "Gamma", "NullBig", "NullSmall"])
  })

  it("7D 升序：缺失行仍恒排末尾", () => {
    const { container } = renderPage()
    const head = screen.getByRole("button", { name: "7D" })
    fireEvent.click(head) // → 降序
    fireEvent.click(head) // → 升序
    expect(rowNames(container)).toEqual(["Gamma", "Zero", "Beta", "Alpha", "NullBig", "NullSmall"])
  })

  it("价格两向排序按快照价排序（实时价为空回退 current_price）", () => {
    const { container } = renderPage()
    const priceHead = screen.getByRole("button", { name: /价格/ })
    fireEvent.click(priceHead) // 降序
    expect(rowNames(container)).toEqual(["NullBig", "Alpha", "Gamma", "Zero", "Beta", "NullSmall"])
    fireEvent.click(priceHead) // 升序
    expect(rowNames(container)).toEqual(["NullSmall", "Beta", "Zero", "Gamma", "Alpha", "NullBig"])
  })
})

describe("MarketsPage 键盘交互", () => {
  beforeEach(() => {
    setLocale("zh")
  })
  afterEach(cleanup)

  it("'/' 直接聚焦搜索框", () => {
    renderPage()
    const input = screen.getByPlaceholderText("搜索币种 / 代码")
    expect(document.activeElement).not.toBe(input)
    fireEvent.keyDown(window, { key: "/" })
    expect(document.activeElement).toBe(input)
    // 聚焦后再按 '/' 属于输入态：不抢焦点、不 preventDefault（正常落入输入框）
    fireEvent.keyDown(input, { key: "/" })
    expect(document.activeElement).toBe(input)
  })

  it("↑↓ 在可进详情的行间移动（跳过无交易对行），Enter 激活跳转详情", () => {
    const { container } = renderPage()
    const rows = navRows(container)
    expect(rows.map((r) => r.textContent)).toHaveLength(2) // alpha + gamma

    rows[0].focus()
    expect(document.activeElement).toBe(rows[0])
    // ↓：alpha → gamma（中间 beta/zero 无交易对，被跳过）
    fireEvent.keyDown(rows[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[1])
    // ↓ 到底钳位：仍停在 gamma
    fireEvent.keyDown(rows[1], { key: "ArrowDown" })
    expect(document.activeElement).toBe(rows[1])
    // ↑ 回到 alpha；Home/End 跳首尾
    fireEvent.keyDown(rows[1], { key: "ArrowUp" })
    expect(document.activeElement).toBe(rows[0])
    fireEvent.keyDown(rows[0], { key: "End" })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: "Home" })
    expect(document.activeElement).toBe(rows[0])

    // Enter 激活当前行 → 路由跳转 /coin/alpha
    fireEvent.keyDown(rows[0], { key: "Enter" })
    expect(screen.getByTestId("coin-page")).not.toBeNull()
  })

  it("焦点在行内控件（星标）上时 Space 不触发行跳转", () => {
    const { container } = renderPage()
    const star = container.querySelector<HTMLButtonElement>('tbody tr button[aria-label="加入自选"]')
    expect(star).not.toBeNull()
    star!.focus()
    fireEvent.keyDown(star!, { key: " " })
    // 未离开列表页（行导航对行内控件豁免）
    expect(screen.queryByTestId("coin-page")).toBeNull()
  })
})
