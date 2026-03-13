// ═══════════════════════════════════════════════════════════════════════════
// FMP Client — Financial Modeling Prep API (free tier)
// US stocks only. Japanese stocks are skipped.
// ═══════════════════════════════════════════════════════════════════════════

/** Returns true if the ticker looks like a Japanese stock (4-digit code or ends with .T) */
export function isJapaneseStock(ticker: string): boolean {
  const t = ticker.trim().toUpperCase()
  return /^\d{4}$/.test(t) || t.endsWith('.T')
}

// ── Profile response (from /v3/profile/{ticker}) ─────────────────────────

export interface FmpProfileData {
  price: number | null
  mktCap: number | null        // in absolute units (USD)
  enterpriseValue: number | null
  sector: string | null
  companyName: string | null
  currency: string | null
  exchangeShortName: string | null
}

// ── Financials response ───────────────────────────────────────────────────

export interface FmpFinancialData {
  revenueGrowthYoy: number | null   // %
  revenueGrowth3y: number | null    // % CAGR
  grossMargin: number | null        // %
  operatingMargin: number | null    // %
  fcfMargin: number | null          // %
  roic: number | null               // %
  debtToEbitda: number | null       // x
  currentRatio: number | null       // x
}

// ── Internal FMP API shapes ───────────────────────────────────────────────

interface FmpIncomeItem {
  date: string
  revenue: number
  grossProfit: number
  operatingIncome: number
  ebitda: number
}

interface FmpCashFlowItem {
  date: string
  freeCashFlow: number
}

interface FmpKeyMetricsItem {
  date: string
  roic: number | null
  netDebtToEBITDA: number | null
  currentRatio: number | null
}

// ── Fetch helpers ─────────────────────────────────────────────────────────

const BASE = 'https://financialmodelingprep.com/api/v3'

async function fmpGet<T>(path: string): Promise<T[]> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`FMP ${res.status}: ${path}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('Unexpected FMP response')
  return data as T[]
}

// ── Public API ────────────────────────────────────────────────────────────

export async function fetchFmpProfile(ticker: string, apiKey: string): Promise<FmpProfileData> {
  const items = await fmpGet<any>(`/profile/${ticker}?apikey=${apiKey}`)
  if (items.length === 0) throw new Error('No profile data returned')
  const d = items[0]
  return {
    price:             typeof d.price === 'number' ? d.price : null,
    mktCap:            typeof d.mktCap === 'number' ? d.mktCap / 1e6 : null,         // → $M
    enterpriseValue:   typeof d.enterpriseValue === 'number' ? d.enterpriseValue / 1e6 : null, // → $M
    sector:            d.sector || null,
    companyName:       d.companyName || null,
    currency:          d.currency || null,
    exchangeShortName: d.exchangeShortName || null,
  }
}

export async function fetchFmpFinancials(ticker: string, apiKey: string): Promise<FmpFinancialData> {
  const [income, cashflow, keyMetrics] = await Promise.all([
    fmpGet<FmpIncomeItem>(`/income-statement/${ticker}?limit=4&apikey=${apiKey}`),
    fmpGet<FmpCashFlowItem>(`/cash-flow-statement/${ticker}?limit=4&apikey=${apiKey}`),
    fmpGet<FmpKeyMetricsItem>(`/key-metrics/${ticker}?limit=4&apikey=${apiKey}`),
  ])

  const inc0 = income[0]
  const inc1 = income[1]
  const inc3 = income[3]
  const cf0  = cashflow[0]
  const km0  = keyMetrics[0]

  const revenueGrowthYoy = inc0 && inc1 && inc1.revenue
    ? ((inc0.revenue - inc1.revenue) / Math.abs(inc1.revenue)) * 100
    : null

  const revenueGrowth3y = inc0 && inc3 && inc3.revenue
    ? ((inc0.revenue / inc3.revenue) ** (1 / 3) - 1) * 100
    : null

  const grossMargin = inc0 && inc0.revenue
    ? (inc0.grossProfit / inc0.revenue) * 100
    : null

  const operatingMargin = inc0 && inc0.revenue
    ? (inc0.operatingIncome / inc0.revenue) * 100
    : null

  const fcfMargin = inc0 && cf0 && inc0.revenue
    ? (cf0.freeCashFlow / inc0.revenue) * 100
    : null

  const roic = km0?.roic != null
    ? km0.roic * 100
    : null

  const debtToEbitda = km0?.netDebtToEBITDA != null
    ? km0.netDebtToEBITDA
    : null

  const currentRatio = km0?.currentRatio != null
    ? km0.currentRatio
    : null

  return {
    revenueGrowthYoy: round(revenueGrowthYoy),
    revenueGrowth3y:  round(revenueGrowth3y),
    grossMargin:      round(grossMargin),
    operatingMargin:  round(operatingMargin),
    fcfMargin:        round(fcfMargin),
    roic:             round(roic),
    debtToEbitda:     round(debtToEbitda),
    currentRatio:     round(currentRatio),
  }
}

function round(v: number | null, dp = 1): number | null {
  if (v == null || !isFinite(v)) return null
  return Math.round(v * 10 ** dp) / 10 ** dp
}
