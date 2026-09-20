// @vitest-environment jsdom
/**
 * 行情页排序 null 语义回归（MarketsPage.tsx:131-141，64c9f48 P1 修复）：
 * Binance 兜底数据源缺失的列（1h/7d/30d 涨跌、ATH）取值为 null，
 * 排序时 null 恒排末尾 —— 无论升序降序，且不与真实 0 混排。
 *
 * 只断言该语义。刻意不断言列宽与实时重排时序，也不在渲染后改 mock
 * tickers 驱动重排（ux-backup 包会给排序输入加快照捕获，两包实现须
 * 各自独立跑绿，此处只依赖两版一致的 null 恒排尾语义）。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter } from "react-router-dom"

import { setLocale } from "@/i18n"
import { MarketsPage } from "@/pages/MarketsPage"
import type { Coin, Snapshot } from "@/lib/api"

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

vi.mock("@/context/MarketDataContext", () => ({
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
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({ favorites: [], has: () => false, toggle: () => {} }),
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
    <MemoryRouter>
      <MarketsPage />
    </MemoryRouter>,
  )
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
