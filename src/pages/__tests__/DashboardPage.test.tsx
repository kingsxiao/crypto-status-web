// @vitest-environment jsdom
/**
 * 总览页挂载冒烟 + 本轮新增交互回归：
 *  - 三卡 / 统计条 / BTC 走势 / 价格表全部挂载不炸（含 mock 快照全链路）；
 *  - PricesTable 键盘行导航（基础层 useRowNav：Enter 激活跳转 /coin/:id，
 *    稳定币行不参与导航）、自选档过滤与空态、自选星标闭环；
 *  - BtcChartCard 方向键探针（十字线渲染，挂载描线类存在）。
 *
 * 数据层全 mock（对齐 MarketsPage.test 的封闭模式），不断言具体行情数值。
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MemoryRouter, Route, Routes } from "react-router-dom"

import { setLocale } from "@/i18n"
import { DashboardPage } from "@/pages/DashboardPage"
import type { Analysis } from "@/lib/indicators"
import type { Coin, Snapshot } from "@/lib/api"

/* ------------------------------ mock 数据层 ------------------------------ */

const MOCK_IMG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"
const DAY = 86_400_000

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
    ath_change_percentage: -30,
    circulating_supply: 1,
    ...partial,
  }
}

const COINS: Coin[] = [
  makeCoin({ id: "bitcoin", name: "Bitcoin", current_price: 68000, market_cap_rank: 1 }),
  // 稳定币：无交易对 → 不可进详情 → 不参与键盘行导航
  makeCoin({ id: "tether", name: "Tether", current_price: 1, market_cap_rank: 2 }),
]

const snapshot: Snapshot = {
  coins: COINS,
  global: {
    total_market_cap_usd: 2.65e12, total_volume_usd: 9.8e10, market_cap_change_24h_pct: -3.37,
    btc_dominance: 58.5, eth_dominance: 12.1, active_cryptocurrencies: 16842,
  },
  fng: Array.from({ length: 31 }, (_, i) => ({
    value: 40 + (i % 20),
    classification: "Neutral",
    timestamp: Math.round((Date.now() - (30 - i) * DAY) / 1000),
  })),
  btcChart: {
    prices: Array.from({ length: 365 }, (_, i) => [Date.now() - (365 - i) * DAY, 60000 + i * 20]),
  },
  fetchedAt: 0,
}

const analysis: Analysis = {
  indicators: [
    { key: "trend", name: { key: "kind.trend" }, display: "+10.0%", score: 1.5, weight: 0.3, verdict: { key: "regime.bull" }, kind: "trend" },
    { key: "momentum", name: { key: "kind.momentum" }, display: { key: "regime.bull" }, score: -0.5, weight: 0.2, verdict: { key: "regime.bear" }, kind: "momentum" },
    { key: "sentiment", name: { key: "kind.sentiment" }, display: "55", score: 0, weight: 0.2, verdict: { key: "regime.recovering" }, kind: "sentiment" },
  ],
  composite: 42,
  signal: { level: "long" },
  regime: { state: "bull", days: 120, priceVsMa200: 12.3, ma50VsMa200: 4.5 },
  btc: { price: 68000, ma50: 64000, ma200: 61000, rsi14: 58, drawdownFromAth: -20 },
}

vi.mock("@/context/MarketDataContext", () => ({
  useMarket: () => ({
    snapshot,
    error: null,
    loading: false,
    refreshing: false,
    lastUpdated: 0,
    refresh: () => {},
    patchedChart: snapshot.btcChart,
    analysis,
  }),
  useLive: () => ({}),
}))
// 交易对集合收敛为 bitcoin：键盘行导航可点行确定
vi.mock("@/lib/realtime", () => ({
  TRADE_SYMBOLS: { bitcoin: { binance: "BTCUSDT", okx: "BTC-USDT" } },
}))

/* -------------------------------- 用例 -------------------------------- */

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/coin/:id" element={<div data-testid="coin-page" />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("DashboardPage 挂载冒烟", () => {
  beforeEach(() => {
    setLocale("zh")
    localStorage.clear()
  })
  afterEach(cleanup)

  it("三卡 + 统计条 + BTC 走势 + 价格表全链路渲染", () => {
    const { container } = renderPage()
    // 实时/快照价格到位（e2e 首页锚点同口径：main 含 $数字）
    expect(container.querySelector("main")!.textContent).toMatch(/\$\d/)
    // 统计条（StatStrip）：总市值读数 + 24H 子行涨跌着色
    expect(screen.getByText("$2.65T")).toBeTruthy()
    expect(screen.getByText("24H -3.37%")).toBeTruthy()
    // BTC 走势卡：svg 带 aria-label（挂载描线类在元素上）
    const chart = container.querySelector('svg[aria-label*="BTC"]')
    expect(chart).not.toBeNull()
    expect(chart!.querySelector("path.spark-draw")).not.toBeNull()
    // 价格表：两行（bitcoin + tether）
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2)
  })

  it("键盘行导航：只索引可进详情行，Enter 激活跳转 /coin/:id", () => {
    const { container } = renderPage()
    const rows = [...container.querySelectorAll<HTMLElement>("tr[data-row-nav-row]")]
    expect(rows).toHaveLength(1) // tether 无交易对，不参与导航
    rows[0].focus()
    fireEvent.keyDown(rows[0], { key: "Enter" })
    expect(screen.getByTestId("coin-page")).not.toBeNull()
  })

  it("自选闭环：星标加入 → 自选档过滤 → 移除后空态", () => {
    const { container } = renderPage()
    // 初始自选档为空（先切档验证空态，避免与星标用例耦合顺序）
    fireEvent.click(screen.getByRole("button", { name: "自选" }))
    expect(screen.getByText("自选列表为空")).toBeTruthy()

    // 回全部档，点 bitcoin 星标加入自选
    fireEvent.click(screen.getByRole("button", { name: "全部" }))
    const star = container.querySelector<HTMLButtonElement>('tbody tr button[aria-label="加入自选"]')
    expect(star).not.toBeNull()
    fireEvent.click(star!)

    // 自选档只剩 bitcoin 一行
    fireEvent.click(screen.getByRole("button", { name: "自选" }))
    const rows = container.querySelectorAll("tbody tr")
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain("Bitcoin")

    // 取消自选 → 回到空态
    fireEvent.click(container.querySelector('tbody tr button[aria-label="移除自选"]')!)
    expect(screen.getByText("自选列表为空")).toBeTruthy()
  })

  it("BTC 走势卡：方向键出十字线探针（含非缩放竖线），Esc 收起", () => {
    const { container } = renderPage()
    const chart = container.querySelector<SVGSVGElement>('svg[aria-label*="BTC"]')!
    expect(chart.querySelector('line[vector-effect="non-scaling-stroke"]')).toBeNull()
    chart.focus()
    fireEvent.keyDown(chart, { key: "ArrowRight" })
    expect(chart.querySelector('line[vector-effect="non-scaling-stroke"]')).not.toBeNull()
    fireEvent.keyDown(chart, { key: "Escape" })
    expect(chart.querySelector('line[vector-effect="non-scaling-stroke"]')).toBeNull()
  })
})
