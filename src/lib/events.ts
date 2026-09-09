/**
 * 市场事件日历 — 影响行情走向的宏观与加密事件。
 *
 * 数据为人工核对的公开日程（2026-09 核对，来源见各事件 source 字段）：
 *   - 美联储 FOMC：federalreserve.gov/monetarypolicy/fomccalendars.htm
 *   - 美国 CPI：bls.gov/schedule/news_release/cpi.htm（8:30 ET）
 *   - 欧央行：ecb.europa.eu/press/calendars/mgcgc（14:15 法兰克福时间）
 *   - 代币解锁：tokenomist.ai 等追踪器（时刻多为约数，approx 标记）
 *   - 以太坊 Glamsterdam：ethereum.org/roadmap/glamsterdam（Q4 2026 目标，日期待定）
 *
 * 时刻一律存 ISO 8601 带显式时区偏移（含夏令时切换），跨时区换算交给 Date。
 * 过期维护：直接增删下方 MARKET_EVENTS 条目即可。
 */

export type EventCategory = "macro" | "crypto"
export type EventImpact = "high" | "medium"
export type EventStatus = "upcoming" | "live" | "finished"

export interface MarketEvent {
  id: string
  /** 中文标题 */
  zh: string
  /** 英文标题 */
  en: string
  category: EventCategory
  impact: EventImpact
  /** 开始时刻，ISO 8601 带时区偏移 */
  start: string
  /** 结束时刻；数据发布类瞬时事件可不填（按 LIVE_WINDOW_MS 视为进行中） */
  end?: string
  /** 时刻为约数（代币解锁通常只确知日期） */
  approx?: boolean
  /** 无确定日期的时间窗（如「Q4 2026」）；展示窗口文案而非倒计时 */
  window?: { zh: string; en: string }
  descZh?: string
  descEn?: string
  source?: { label: string; url: string }
}

/** 瞬时事件（CPI/NFP 等数据发布）默认视为「进行中」的窗口：覆盖发布后的市场反应期 */
export const LIVE_WINDOW_MS = 60 * 60_000

export const MARKET_EVENTS: MarketEvent[] = [
  /* ------------------------------ 已结束（近期） ------------------------------ */
  {
    id: "nfp-2026-08",
    zh: "美国 7 月非农就业报告（NFP）",
    en: "US July Nonfarm Payrolls (NFP)",
    category: "macro",
    impact: "high",
    start: "2026-08-07T08:30:00-04:00",
    descZh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价",
    descEn: "Job gains, unemployment rate and wage growth released at once",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    id: "cpi-2026-08",
    zh: "美国 7 月 CPI",
    en: "US July CPI",
    category: "macro",
    impact: "high",
    start: "2026-08-12T08:30:00-04:00",
    descZh: "整体与核心 CPI 同比/环比；9 月决议前的重要通胀读数",
    descEn: "Headline and core CPI y/y and m/m",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    id: "sui-unlock-2026-09",
    zh: "SUI 月度代币解锁",
    en: "SUI Monthly Token Unlock",
    category: "crypto",
    impact: "medium",
    start: "2026-09-03T00:00:00Z",
    approx: true,
    descZh: "月度线性释放，规模约 $150M+（随币价浮动）",
    descEn: "Monthly linear release, ~$150M+ (varies with price)",
    source: { label: "Tokenomist", url: "https://tokenomist.ai/sui" },
  },
  {
    id: "nfp-2026-09",
    zh: "美国 8 月非农就业报告（NFP）",
    en: "US August Nonfarm Payrolls (NFP)",
    category: "macro",
    impact: "high",
    start: "2026-09-04T08:30:00-04:00",
    descZh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价",
    descEn: "Job gains, unemployment rate and wage growth released at once",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    id: "hype-unlock-2026-09",
    zh: "HYPE 代币解锁（核心贡献者）",
    en: "HYPE Token Unlock (Core Contributors)",
    category: "crypto",
    impact: "medium",
    start: "2026-09-06T00:00:00Z",
    approx: true,
    descZh: "约 992 万枚 HYPE 流向核心贡献者，规模约 $590M+",
    descEn: "~9.92M HYPE to core contributors, ~$590M+",
    source: { label: "Tokenomist", url: "https://tokenomist.ai/hyperliquid/unlock-events" },
  },

  /* ------------------------------ 即将进行 ------------------------------ */
  {
    id: "ecb-2026-09",
    zh: "欧央行利率决议",
    en: "ECB Rate Decision",
    category: "macro",
    impact: "high",
    start: "2026-09-10T14:15:00+02:00",
    end: "2026-09-10T15:45:00+02:00",
    descZh: "法兰克福时间 14:15 公布利率，14:45 行长发布会；本次会议在柏林召开",
    descEn: "Rates at 14:15 CET, Lagarde presser at 14:45; meeting hosted in Berlin",
    source: { label: "ECB", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
  },
  {
    id: "cpi-2026-09",
    zh: "美国 8 月 CPI",
    en: "US August CPI",
    category: "macro",
    impact: "high",
    start: "2026-09-11T08:30:00-04:00",
    descZh: "9 月 FOMC 决议前的最后一份 CPI；整体与核心同比/环比",
    descEn: "Last CPI before the September FOMC; headline and core y/y and m/m",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    id: "fomc-2026-09",
    zh: "FOMC 利率决议（含 SEP 点阵图）",
    en: "FOMC Rate Decision (with SEP)",
    category: "macro",
    impact: "high",
    start: "2026-09-16T14:00:00-04:00",
    end: "2026-09-16T15:30:00-04:00",
    descZh: "会议 9/15–16 为期两天；美东 14:00 公布决议与点阵图，14:30 鲍威尔发布会",
    descEn: "Two-day meeting Sep 15–16; decision & dot plot 14:00 ET, Powell presser 14:30 ET",
    source: { label: "Fed", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  },
  {
    id: "zro-unlock-2026-09",
    zh: "LayerZero（ZRO）代币解锁",
    en: "LayerZero (ZRO) Token Unlock",
    category: "crypto",
    impact: "medium",
    start: "2026-09-20T00:00:00Z",
    approx: true,
    descZh: "约 2600 万枚 ZRO 解锁",
    descEn: "~26M ZRO unlocking",
    source: { label: "CryptoRank", url: "https://cryptorank.io/token-unlock" },
  },
  {
    id: "glamsterdam-mainnet",
    zh: "以太坊 Glamsterdam 主网升级",
    en: "Ethereum Glamsterdam Mainnet Upgrade",
    category: "crypto",
    impact: "high",
    start: "2026-10-01T00:00:00Z",
    end: "2026-12-31T23:59:59Z",
    window: { zh: "2026 Q4", en: "Q4 2026" },
    descZh: "官方目标 2026 年四季度；测试网 8 月已启动，主网日期待定",
    descEn: "Official target Q4 2026; testnets live since August, mainnet date TBA",
    source: { label: "ethereum.org", url: "https://ethereum.org/roadmap/glamsterdam/" },
  },
  {
    id: "sui-unlock-2026-10",
    zh: "SUI 月度代币解锁",
    en: "SUI Monthly Token Unlock",
    category: "crypto",
    impact: "medium",
    start: "2026-10-01T00:00:00Z",
    approx: true,
    descZh: "月度线性释放，规模随币价浮动",
    descEn: "Monthly linear release, size varies with price",
    source: { label: "Tokenomist", url: "https://tokenomist.ai/sui" },
  },
  {
    id: "nfp-2026-10",
    zh: "美国 9 月非农就业报告（NFP）",
    en: "US September Nonfarm Payrolls (NFP)",
    category: "macro",
    impact: "high",
    start: "2026-10-02T08:30:00-04:00",
    descZh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价",
    descEn: "Job gains, unemployment rate and wage growth released at once",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    id: "hype-unlock-2026-10",
    zh: "HYPE 代币解锁（核心贡献者）",
    en: "HYPE Token Unlock (Core Contributors)",
    category: "crypto",
    impact: "medium",
    start: "2026-10-06T00:00:00Z",
    approx: true,
    descZh: "月度解锁，规模随币价浮动",
    descEn: "Monthly unlock, size varies with price",
    source: { label: "Tokenomist", url: "https://tokenomist.ai/hyperliquid/unlock-events" },
  },
  {
    id: "cpi-2026-10",
    zh: "美国 9 月 CPI",
    en: "US September CPI",
    category: "macro",
    impact: "high",
    start: "2026-10-14T08:30:00-04:00",
    descZh: "整体与核心 CPI 同比/环比",
    descEn: "Headline and core CPI y/y and m/m",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    id: "fomc-2026-10",
    zh: "FOMC 利率决议",
    en: "FOMC Rate Decision",
    category: "macro",
    impact: "high",
    start: "2026-10-28T14:00:00-04:00",
    end: "2026-10-28T15:30:00-04:00",
    descZh: "美东 14:00 公布决议，14:30 鲍威尔发布会；次日欧央行决议，48 小时双央行窗口",
    descEn: "Decision 14:00 ET, presser 14:30 ET; ECB decides the next day",
    source: { label: "Fed", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  },
  {
    id: "ecb-2026-10",
    zh: "欧央行利率决议",
    en: "ECB Rate Decision",
    category: "macro",
    impact: "high",
    start: "2026-10-29T14:15:00+01:00",
    end: "2026-10-29T15:45:00+01:00",
    descZh: "法兰克福时间 14:15 公布利率，14:45 行长发布会；紧随 FOMC 之后 24 小时",
    descEn: "Rates 14:15 CET, presser 14:45 CET; 24h after the FOMC",
    source: { label: "ECB", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
  },
  {
    id: "nfp-2026-11",
    zh: "美国 10 月非农就业报告（NFP）",
    en: "US October Nonfarm Payrolls (NFP)",
    category: "macro",
    impact: "high",
    start: "2026-11-06T08:30:00-05:00",
    descZh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价",
    descEn: "Job gains, unemployment rate and wage growth released at once",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    id: "cpi-2026-11",
    zh: "美国 10 月 CPI",
    en: "US October CPI",
    category: "macro",
    impact: "high",
    start: "2026-11-12T08:30:00-05:00",
    descZh: "整体与核心 CPI 同比/环比",
    descEn: "Headline and core CPI y/y and m/m",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    id: "nfp-2026-12",
    zh: "美国 11 月非农就业报告（NFP）",
    en: "US November Nonfarm Payrolls (NFP)",
    category: "macro",
    impact: "high",
    start: "2026-12-04T08:30:00-05:00",
    descZh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价",
    descEn: "Job gains, unemployment rate and wage growth released at once",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    id: "fomc-2026-12",
    zh: "FOMC 利率决议（含 SEP 点阵图）",
    en: "FOMC Rate Decision (with SEP)",
    category: "macro",
    impact: "high",
    start: "2026-12-09T14:00:00-05:00",
    end: "2026-12-09T15:30:00-05:00",
    descZh: "会议 12/8–9 为期两天；年末决议携点阵图与经济预测",
    descEn: "Two-day meeting Dec 8–9; year-end decision with SEP projections",
    source: { label: "Fed", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  },
  {
    id: "cpi-2026-12",
    zh: "美国 11 月 CPI",
    en: "US November CPI",
    category: "macro",
    impact: "high",
    start: "2026-12-10T08:30:00-05:00",
    descZh: "12 月 FOMC 决议前最后一份 CPI；整体与核心同比/环比",
    descEn: "Last CPI before the December FOMC; headline and core y/y and m/m",
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    id: "ecb-2026-12",
    zh: "欧央行利率决议",
    en: "ECB Rate Decision",
    category: "macro",
    impact: "high",
    start: "2026-12-17T14:15:00+01:00",
    end: "2026-12-17T15:45:00+01:00",
    descZh: "法兰克福时间 14:15 公布利率，14:45 行长发布会",
    descEn: "Rates 14:15 CET, presser 14:45 CET",
    source: { label: "ECB", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
  },
]

/** 事件开始时刻（ms）；同一事件反复解析开销可忽略 */
export function eventStartMs(e: MarketEvent): number {
  return Date.parse(e.start)
}

/** 事件结束时刻（ms）；瞬时事件按 LIVE_WINDOW_MS 展开为反应窗口 */
export function eventEndMs(e: MarketEvent): number {
  const s = eventStartMs(e)
  return e.end ? Date.parse(e.end) : s + LIVE_WINDOW_MS
}

export function eventStatus(e: MarketEvent, now: number): EventStatus {
  if (now < eventStartMs(e)) return "upcoming"
  if (now < eventEndMs(e)) return "live"
  return "finished"
}

/** 按开始时刻升序 */
export function sortedEvents(events: MarketEvent[]): MarketEvent[] {
  return [...events].sort((a, b) => eventStartMs(a) - eventStartMs(b))
}

export type StatusFilter = "all" | EventStatus
export type CategoryFilter = "all" | EventCategory

/**
 * 状态 + 类别筛选。「已结束」按最近在前（先看刚发生的），其余按时间升序
 * （顺着读到未来）；「全部」视图由页面在首个未来事件前插入 NOW 分隔线。
 */
export function filterEvents(
  events: MarketEvent[],
  now: number,
  status: StatusFilter,
  category: CategoryFilter
): MarketEvent[] {
  const hit = events.filter(
    (e) => (status === "all" || eventStatus(e, now) === status) && (category === "all" || e.category === category)
  )
  const sorted = sortedEvents(hit)
  return status === "finished" ? sorted.reverse() : sorted
}

/**
 * 英雄卡候选：进行中的定时事件优先（正在发生的最重要）；否则取最近的
 * 高影响事件；全部结束后返回 null。无日期时间窗（window）不参与 ——
 * 对它倒数一个编造的时刻没有意义。
 */
export function heroEvent(events: MarketEvent[], now: number): MarketEvent | null {
  const timed = sortedEvents(events.filter((e) => !e.window))
  const live = timed.find((e) => eventStatus(e, now) === "live")
  if (live) return live
  const upcoming = timed.filter((e) => eventStatus(e, now) === "upcoming")
  return upcoming.find((e) => e.impact === "high") ?? upcoming[0] ?? null
}

/** 倒计时拆解；负数/零钳到 0（进入进行中前的最后一秒） */
export function countdownParts(msLeft: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(msLeft / 1000))
  return {
    d: Math.floor(total / 86_400),
    h: Math.floor((total % 86_400) / 3_600),
    m: Math.floor((total % 3_600) / 60),
    s: total % 60,
  }
}

/** 进行中事件的进度 0..1（有明确 end 才有意义） */
export function eventProgress(e: MarketEvent, now: number): number | null {
  if (!e.end) return null
  const s = eventStartMs(e)
  const en = Date.parse(e.end)
  if (now <= s || now >= en) return null
  return (now - s) / (en - s)
}

/** 本地日期键 YYYY-MM-DD（分组用；渲染层按 locale 展示） */
export function localDayKey(ts: number): string {
  const d = new Date(ts)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 按本地日期分组（输入需已排序）；返回 [{dayKey, events}] 连续分组 */
export function groupEventsByDay(events: MarketEvent[]): { dayKey: string; events: MarketEvent[] }[] {
  const groups: { dayKey: string; events: MarketEvent[] }[] = []
  for (const e of events) {
    const key = localDayKey(eventStartMs(e))
    const last = groups[groups.length - 1]
    if (last && last.dayKey === key) last.events.push(e)
    else groups.push({ dayKey: key, events: [e] })
  }
  return groups
}

/* ------------------------------ 筛选计数 / 源时区 / 日历导出 ------------------------------ */

/** 各状态条数（Segmented 角标用）；「全部」= 三者之和 */
export function statusCounts(
  events: MarketEvent[],
  now: number
): { upcoming: number; live: number; finished: number } {
  const c = { upcoming: 0, live: 0, finished: 0 }
  for (const e of events) c[eventStatus(e, now)]++
  return c
}

/** ISO 偏移 → 事件原生时区（展示「美东 14:00」式参考时间用）；未知偏移返回 null */
const SRC_ZONES: Record<string, { iana: string; zh: string; en: string }> = {
  "-04:00": { iana: "America/New_York", zh: "美东", en: "US ET" },
  "-05:00": { iana: "America/New_York", zh: "美东", en: "US ET" },
  "+01:00": { iana: "Europe/Berlin", zh: "法兰克福", en: "Frankfurt" },
  "+02:00": { iana: "Europe/Berlin", zh: "法兰克福", en: "Frankfurt" },
  Z: { iana: "UTC", zh: "UTC", en: "UTC" },
}

export function srcZone(e: MarketEvent): { iana: string; zh: string; en: string } | null {
  const m = e.start.match(/(?:Z|[+-]\d{2}:\d{2})$/)
  return m ? (SRC_ZONES[m[0]] ?? null) : null
}

/* ------------------------------ .ics 日历导出 ------------------------------ */

/** RFC 5545 文本转义：反斜杠、分号、逗号、换行 */
function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

function icsStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"
}

function icsDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10).replace(/-/g, "")
}

/**
 * 单事件 .ics（VEVENT）。定时事件用 UTC 时刻；approx / window 事件只确知日期，
 * 导出为全天事项（DTEND 为排他的次日，window 取窗口末日 +1）。
 * nowMs 仅作 DTSTAMP，测试可固定。
 */
export function buildIcs(e: MarketEvent, locale: "zh" | "en", nowMs: number = Date.now()): string {
  const start = eventStartMs(e)
  const title = icsEscape(locale === "en" ? e.en : e.zh)
  const desc = icsEscape((locale === "en" ? e.descEn : e.descZh) ?? "")
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CRYPTO STATUS//Event Calendar//ZH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${e.id}@crypto-status`,
    `DTSTAMP:${icsStamp(nowMs)}`,
  ]
  if (e.approx || e.window) {
    // 全天事项：结束日排他 —— window 到窗口末日次日，approx 固定一天
    const endMs = e.end ? Date.parse(e.end) + 86_400_000 : start + 86_400_000
    lines.push(`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(endMs)}`)
  } else {
    const endMs = e.end ? Date.parse(e.end) : start + LIVE_WINDOW_MS
    lines.push(`DTSTART:${icsStamp(start)}`, `DTEND:${icsStamp(endMs)}`)
  }
  lines.push(
    `SUMMARY:${title}`,
    `DESCRIPTION:${desc}${e.source ? icsEscape(` · ${e.source.url}`) : ""}`,
    "END:VEVENT",
    "END:VCALENDAR"
  )
  return lines.join("\r\n") + "\r\n"
}
