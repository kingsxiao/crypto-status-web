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
 * 过期维护：直接增删下方 HARDCODED_MARKET_EVENTS 条目即可；周期系列
 * （NFP/CPI/FOMC/ECB）会在模块加载时按年度节奏自动向前外推（见
 * extrapolateRecurringEvents），手工补充的硬编码条目按 id 优先于外推。
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

/** 人工核对的事件（2026-09 核对）；导出供测试与外推锚定使用，消费方用 MARKET_EVENTS */
export const HARDCODED_MARKET_EVENTS: MarketEvent[] = [
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

/* ------------------------------ 周期事件外推 ------------------------------ */

/**
 * 硬编码终点（2026-12）过后，周期事件按年度节奏自动向前外推，事件页不至于
 * 停在「全部已结束」。外推日期是节奏近似 —— 与 Fed/ECB/BLS 实际日历可漂移
 * 数周，因此生成条目一律带 approx: true（UI 呈现 ≈ 而非虚假精确时刻，
 * buildIcs 自动降级为全天事项导出）。
 *
 * 节奏依据官方日历的典型模式（来源见文件头），并以 2026 硬编码数据自证：
 *   - NFP：BLS 惯例每月第一个周五 08:30 ET —— 规则精确复现 2026 全部 5 个
 *     硬编码日期（8/7、9/4、10/2、11/6、12/4）
 *   - CPI：BLS 月度中旬发布（2026 硬编码落在 10–14 日），取 12 日近似
 *   - FOMC：每年 8 次会议（1/3/4/6/7/9/10/12 月），决议在周三 14:00 ET、
 *     14:30 发布会；3/6/9/12 月例会附 SEP 点阵图
 *   - ECB：每年 8 次会议（同上月组），决议在周四 14:15 法兰克福、14:45 发布会
 */

/** UTC 日历：某年某月（0 起）第 n 个 weekday（0=周日…6=周六）是几号 */
function nthWeekdayDay(year: number, month: number, weekday: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7
}

/** UTC 日历：某年某月（0 起）最后一个 weekday 是几号 */
function lastWeekdayDay(year: number, month: number, weekday: number): number {
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(year, month, daysInMonth)).getUTCDay()
  return daysInMonth - ((lastDow - weekday + 7) % 7)
}

/**
 * 美东某日的 UTC 偏移。夏令时自 2007 年起规则稳定：3 月第二个周日 02:00 起、
 * 11 月第一个周日 02:00 止。切换均发生在凌晨，本模块只生成日间墙钟时刻
 * （≥08:30），按日期比较即为精确。
 */
function etOffset(year: number, month: number, day: number): "-04:00" | "-05:00" {
  const inDst =
    (month > 2 || (month === 2 && day >= nthWeekdayDay(year, 2, 0, 2))) &&
    (month < 10 || (month === 10 && day < nthWeekdayDay(year, 10, 0, 1)))
  return inDst ? "-04:00" : "-05:00"
}

/** 法兰克福某日的 UTC 偏移。欧盟夏令时：3 月最后一个周日 01:00 UTC 起、10 月最后一个周日止 */
function frankfurtOffset(year: number, month: number, day: number): "+01:00" | "+02:00" {
  const inDst =
    (month > 2 || (month === 2 && day >= lastWeekdayDay(year, 2, 0))) &&
    (month < 9 || (month === 9 && day < lastWeekdayDay(year, 9, 0)))
  return inDst ? "+02:00" : "+01:00"
}

const pad2 = (n: number) => String(n).padStart(2, "0")

/** UTC 时刻 → 源时区墙钟的显式偏移 ISO 串（end 复用；平移回墙钟后取 UTC 部件） */
function toIsoWithOffset(ms: number, offset: string): string {
  const sign = offset[0] === "-" ? -1 : 1
  const shifted = ms + sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6))) * 60_000
  const d = new Date(shifted)
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:00${offset}`
}

/** 自然月加法（UTC 日历；月溢出由 Date.UTC 归一化） */
function addMonthsUtc(ms: number, months: number): number {
  const d = new Date(ms)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes())
}

/** 月内日期规则：第 nth 个星期几，或固定日期 */
type DayRule = { weekday: number; nth: number } | { dayOfMonth: number }

const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** 周期系列的外推节奏（依据见本节开头说明） */
interface SeriesSpec {
  /** id 前缀（系列识别，对应硬编码 id 如 nfp-2026-08） */
  prefix: string
  /** 每年锚定月份（1–12）；缺省 = 每月 */
  anchorMonths?: number[]
  day: DayRule
  /** 源时区墙钟时刻 */
  wall: { h: number; m: number }
  zone: "ET" | "Frankfurt"
  /** 决议类持续分钟数（含发布会）；数据发布类不填 */
  durationMin?: number
  /** 标题（入参为发布月 1–12；NFP/CPI 惯例以数据月份 = 发布前一月命名） */
  title: (releaseMonth: number) => { zh: string; en: string }
  desc: { zh: string; en: string }
  source: { label: string; url: string }
}

const SERIES_SPECS: SeriesSpec[] = [
  {
    prefix: "nfp",
    day: { weekday: 5, nth: 1 },
    wall: { h: 8, m: 30 },
    zone: "ET",
    title: (m) => {
      const data = m === 1 ? 12 : m - 1
      return { zh: `美国 ${data} 月非农就业报告（NFP）`, en: `US ${EN_MONTHS[data - 1]} Nonfarm Payrolls (NFP)` }
    },
    desc: { zh: "就业增减、失业率与时薪增速一并发布，利率预期即时重定价", en: "Job gains, unemployment rate and wage growth released at once" },
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/empsit.htm" },
  },
  {
    prefix: "cpi",
    day: { dayOfMonth: 12 },
    wall: { h: 8, m: 30 },
    zone: "ET",
    title: (m) => {
      const data = m === 1 ? 12 : m - 1
      return { zh: `美国 ${data} 月 CPI`, en: `US ${EN_MONTHS[data - 1]} CPI` }
    },
    desc: { zh: "整体与核心 CPI 同比/环比", en: "Headline and core CPI y/y and m/m" },
    source: { label: "BLS", url: "https://www.bls.gov/schedule/news_release/cpi.htm" },
  },
  {
    prefix: "fomc",
    anchorMonths: [1, 3, 4, 6, 7, 9, 10, 12],
    day: { weekday: 3, nth: 2 },
    wall: { h: 14, m: 0 },
    zone: "ET",
    durationMin: 90,
    title: (m) => {
      const sep = m === 3 || m === 6 || m === 9 || m === 12
      return { zh: `FOMC 利率决议${sep ? "（含 SEP 点阵图）" : ""}`, en: `FOMC Rate Decision${sep ? " (with SEP)" : ""}` }
    },
    desc: { zh: "美东 14:00 公布决议，14:30 鲍威尔发布会", en: "Decision 14:00 ET, presser 14:30 ET" },
    source: { label: "Fed", url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm" },
  },
  {
    prefix: "ecb",
    anchorMonths: [1, 3, 4, 6, 7, 9, 10, 12],
    day: { weekday: 4, nth: 2 },
    wall: { h: 14, m: 15 },
    zone: "Frankfurt",
    durationMin: 90,
    title: () => ({ zh: "欧央行利率决议", en: "ECB Rate Decision" }),
    desc: { zh: "法兰克福时间 14:15 公布利率，14:45 行长发布会", en: "Rates 14:15 CET, presser 14:45 CET" },
    source: { label: "ECB", url: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html" },
  },
]

/** 按节奏生成某年某月（1 起）的一个条目（不做截止/去重判断） */
function buildOccurrence(spec: SeriesSpec, year: number, month: number): MarketEvent {
  const m0 = month - 1
  const day = "weekday" in spec.day ? nthWeekdayDay(year, m0, spec.day.weekday, spec.day.nth) : spec.day.dayOfMonth
  const offset = spec.zone === "ET" ? etOffset(year, m0, day) : frankfurtOffset(year, m0, day)
  const start = `${year}-${pad2(month)}-${pad2(day)}T${pad2(spec.wall.h)}:${pad2(spec.wall.m)}:00${offset}`
  const title = spec.title(month)
  const e: MarketEvent = {
    id: `${spec.prefix}-${year}-${pad2(month)}`,
    zh: title.zh,
    en: title.en,
    category: "macro",
    impact: "high",
    start,
    approx: true,
    descZh: `${spec.desc.zh}（按周期节奏推算，以官方日历为准）`,
    descEn: `${spec.desc.en} (projected from recurring cadence; see official calendar)`,
    source: spec.source,
  }
  if (spec.durationMin) {
    // 90 分钟的决议窗口不会跨夏令时切换（切换均在凌晨），沿用同一偏移
    e.end = toIsoWithOffset(eventStartMs(e) + spec.durationMin * 60_000, offset)
  }
  return e
}

/**
 * 从 lastKnown 中各周期系列（nfp/cpi/fomc/ecb）最后一个硬编码事件起，按年度
 * 节奏向前外推，截止于全集最晚开始时刻之后 months 个自然月。纯函数、零依赖：
 *   - id 沿用系列规则（如 nfp-2027-03），与 lastKnown 撞 id 时跳过 —— 未来
 *     手工补充硬编码条目自动优先，历史与未来都不会出现重复条目；
 *   - 生成条目一律 approx: true；系列在 lastKnown 中无硬编码锚点时跳过
 *     （宁缺毋假）。
 * 返回按开始时刻升序。
 */
export function extrapolateRecurringEvents(lastKnown: MarketEvent[], months = 18): MarketEvent[] {
  if (months <= 0 || lastKnown.length === 0) return []
  const knownIds = new Set(lastKnown.map((e) => e.id))
  const horizon = addMonthsUtc(Math.max(...lastKnown.map(eventStartMs)), months)
  const hz = new Date(horizon)
  const horizonIdx = hz.getUTCFullYear() * 12 + hz.getUTCMonth() // 0 起月份序号
  const out: MarketEvent[] = []
  for (const spec of SERIES_SPECS) {
    const series = lastKnown.filter((e) => e.id.startsWith(`${spec.prefix}-`))
    if (series.length === 0) continue
    // 锚点：该系列最后一个硬编码事件的年月（日间时刻的 UTC 年月与源时区一致）
    const anchor = new Date(Math.max(...series.map(eventStartMs)))
    const startIdx = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + 1
    for (let idx = startIdx; idx <= horizonIdx; idx++) {
      const y = Math.floor(idx / 12)
      const m = (idx % 12) + 1
      if (spec.anchorMonths && !spec.anchorMonths.includes(m)) continue
      const e = buildOccurrence(spec, y, m)
      if (eventStartMs(e) >= horizon) continue // 截止月内日期可能已越界
      if (!knownIds.has(e.id)) out.push(e)
    }
  }
  return out.sort((a, b) => eventStartMs(a) - eventStartMs(b))
}

/** 事件全集 = 硬编码（人工核对）+ 周期外推（节奏近似）；消费方一律用本导出 */
export const MARKET_EVENTS: MarketEvent[] = [
  ...HARDCODED_MARKET_EVENTS,
  ...extrapolateRecurringEvents(HARDCODED_MARKET_EVENTS),
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
