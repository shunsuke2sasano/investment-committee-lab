// ═══════════════════════════════════════════════════════════════════════════
// DOMAIN TYPES — Investment Committee vNext
// ═══════════════════════════════════════════════════════════════════════════

// ── Company ──────────────────────────────────────────────────────────────
export type CaseStatus = 'draft' | 'active' | 'archived'

export interface CompanyCase {
  id: string
  ticker: string
  companyName: string
  sector: string | null
  currentPrice: number | null
  marketCap: number | null
  enterpriseValue: number | null
  investmentHorizonMonths: number
  status: CaseStatus
  createdAt: string
  updatedAt: string
}

// ── Thesis ───────────────────────────────────────────────────────────────
export type CollapseOperator = '<' | '<=' | '>' | '>=' | '=' | 'manual'

export type TimeToValidateSource = 'user' | 'ai'

export interface TimeToValidate {
  months: number
  source: TimeToValidateSource
  confidence: 1 | 2 | 3 | 4 | 5   // 1=very uncertain, 5=high certainty
  aiReasoning: string | null        // AI推定の根拠テキスト
}

export interface CollapseCondition {
  id: string
  label: string
  metricKey: string | null
  operator: CollapseOperator
  threshold: number | null
  unit: string | null
  note: string | null
  // ── Horizon inference ─────────────────────────────────────────────────
  timeToValidate: TimeToValidate | null   // null = 未入力・未推定
  isPrimary: boolean                      // Horizon算出の優先条件
}

// ── Horizon inference result ─────────────────────────────────────────────
export type HorizonBasis = 'primary_condition' | 'median_conditions' | 'valuation_optimal' | 'fallback'

export interface HorizonInference {
  recommendedMonths: number
  rangeMin: number
  rangeMax: number
  basis: HorizonBasis
  primaryConditionLabel: string | null   // primary指定された条件のラベル
  valuationOptimalMonths: number | null  // Valuation逆算の最適期間
  aiExplanation: string | null           // AI説明文
  computedAt: string
}

export interface MonitoringMetric {
  id: string
  metricKey: string
  label: string
  source: 'manual' | 'financial_api' | 'market_api'
  expectedDirection: 'up' | 'down' | 'stable'
  note: string | null
}

export interface ThesisAnalysis {
  id: string
  companyId: string
  thesisText: string
  drivers: string[]
  collapseConditions: CollapseCondition[]
  monitoringMetrics: MonitoringMetric[]
  confidenceNote: string | null
  version: number
  createdAt: string
  updatedAt: string
}

// ── Data Lane ────────────────────────────────────────────────────────────
export interface DataLaneInput {
  revenueGrowthYoy: number | null       // % YoY
  revenueGrowth3y: number | null        // % CAGR 3yr
  grossMargin: number | null            // %
  operatingMargin: number | null        // %
  fcfMargin: number | null              // %
  roic: number | null                   // %
  debtToEbitda: number | null
  netDebtToEquity: number | null
  shareDilutionAnnual: number | null    // % annual
  reinvestmentRate: number | null       // %
  currentRatio: number | null
}

export interface DataLaneScores {
  businessQuality: 1 | 2 | 3 | 4 | 5
  capitalEfficiency: 1 | 2 | 3 | 4 | 5
  balanceSheetSafety: 1 | 2 | 3 | 4 | 5
  cashGeneration: 1 | 2 | 3 | 4 | 5
}

export interface DataAnalysis {
  id: string
  companyId: string
  input: DataLaneInput
  scores: DataLaneScores
  summary: string
  computedAt: string
}

// ── Market Lane ──────────────────────────────────────────────────────────
export type ValuationPressure = 'low' | 'medium' | 'high'
export type SentimentRisk = 'low' | 'medium' | 'high'
export type ConsensusDependency = 'low' | 'medium' | 'high'

export interface MarketLaneInput {
  // Consensus (手入力 or API)
  analystRevenueConsensusGrowth: number | null  // % expected by analysts
  analystEpsConsensus: number | null
  analystCount: number | null
  // Valuation
  currentEvEbitda: number | null
  currentPer: number | null
  historicalEvEbitdaMin: number | null
  historicalEvEbitdaMax: number | null
  // Sentiment
  shortInterestPct: number | null
  institutionalOwnershipPct: number | null
  ownershipNote: string | null
  // User's own growth forecast (for gap calculation)
  userRevenueGrowthForecast: number | null
}

export interface MarketLaneOutputs {
  marketExpectationGap: number | null   // user forecast − consensus
  valuationPressure: ValuationPressure
  sentimentRisk: SentimentRisk
  consensusDependency: ConsensusDependency
}

export interface MarketAnalysis {
  id: string
  companyId: string
  input: MarketLaneInput
  outputs: MarketLaneOutputs
  summary: string
  computedAt: string
}

// ── Review Engine ────────────────────────────────────────────────────────
export type RiskCategory =
  | 'demand_risk'
  | 'competition_risk'
  | 'margin_risk'
  | 'balance_sheet_risk'
  | 'execution_risk'
  | 'regulation_risk'
  | 'multiple_compression'
  | 'narrative_risk'

export type MismatchType = 'thesis_data' | 'data_market' | 'thesis_market'

export interface ReviewRisk {
  category: RiskCategory
  severity: 1 | 2 | 3 | 4 | 5
  title: string
  detail: string
}

export interface ReviewMismatch {
  type: MismatchType
  title: string
  detail: string
  likelySource: 'thesis' | 'data' | 'market' | 'unclear'  // どちらが怪しいか
}

export interface ReviewReport {
  id: string
  companyId: string
  provider: string
  model: string
  missingItems: string[]
  mismatches: ReviewMismatch[]
  risks: ReviewRisk[]
  scenarioNotes: string[]
  rawResponse: string | null
  createdAt: string
}

// ── Valuation ────────────────────────────────────────────────────────────
export interface ValuationAssumptions {
  currentRevenue: number | null
  currentFcf: number | null
  currentEnterpriseValue: number | null
  baseRevenueGrowth: number | null      // %
  baseFcfMargin: number | null          // %
  exitMultiple: number | null           // EV/FCF
  years: number
}

export interface ValuationScenario {
  revenueGrowthAdj: number             // multiplier vs base (bear: 0.65, base: 1.0, bull: 1.4)
  fcfMarginAdj: number
  exitMultipleAdj: number
  impliedEnterpriseValue: number | null
  expectedCagr: number | null
  notes: string[]
}

export interface ValuationReport {
  id: string
  companyId: string
  assumptions: ValuationAssumptions
  scenarios: {
    bear: ValuationScenario
    base: ValuationScenario
    bull: ValuationScenario
  }
  expectedCagr: number | null          // base case
  cagrGate: 'pass' | 'watch' | 'block' // >= 20 / 12-20 / < 12
  downsideRiskScore: number            // bear CAGR delta from base
  createdAt: string
}

// ── Verdict ──────────────────────────────────────────────────────────────
export type VerdictResult = 'BUY' | 'WATCH' | 'PASS'

export interface AxisScore {
  score: 1 | 2 | 3 | 4 | 5
  veto: boolean
  comment: string
  evidenceMetrics: string[]
}

export interface VerdictAxes {
  businessQuality: AxisScore
  growthQuality: AxisScore
  capitalEfficiency: AxisScore
  balanceSheetSafety: AxisScore
  valuationAttractiveness: AxisScore
  marketExpectationGap: AxisScore
  executionRisk: AxisScore
  governance: AxisScore
}

export interface VerdictReport {
  id: string
  companyId: string
  axisScores: VerdictAxes
  totalScore: number
  vetoCount: number
  verdict: VerdictResult
  rationale: string
  profileUsed: VerdictProfile
  createdAt: string
}

// ── Verdict Profile (Conservative / Standard / Aggressive) ───────────────
export interface VerdictProfile {
  id: 'conservative' | 'standard' | 'aggressive'
  label: string
  buyThreshold: number
  watchThreshold: number
  maxVetoForBuy: number
}

export const VERDICT_PROFILES: Record<string, VerdictProfile> = {
  conservative: {
    id: 'conservative',
    label: 'Conservative',
    buyThreshold: 32,
    watchThreshold: 24,
    maxVetoForBuy: 1,   // veto >= 2 → PASS
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    buyThreshold: 30,
    watchThreshold: 22,
    maxVetoForBuy: 1,   // veto >= 2 → BUY不可（WATCH止まり）
  },
  aggressive: {
    id: 'aggressive',
    label: 'Aggressive',
    buyThreshold: 28,
    watchThreshold: 20,
    maxVetoForBuy: 2,   // veto >= 3 → PASS
  },
}

// ── Monitoring ───────────────────────────────────────────────────────────
export type ThesisStatus = 'intact' | 'warning' | 'broken'
export type MonitorItemStatus = 'ok' | 'warning' | 'breach' | 'manual_check'

export interface MonitorItem {
  id: string
  label: string
  metricKey: string | null
  currentValue: number | null
  threshold: number | null
  operator: CollapseOperator
  status: MonitorItemStatus
  note: string | null
  updatedAt: string
}

export interface MonitoringPlan {
  id: string
  companyId: string
  thesisStatus: ThesisStatus
  monitorItems: MonitorItem[]
  nextReviewDate: string | null
  createdAt: string
  updatedAt: string
}

// ── Lesson ───────────────────────────────────────────────────────────────
export type DecisionQuality =
  | 'good_process_good_outcome'
  | 'good_process_bad_outcome'
  | 'bad_process_good_outcome'
  | 'bad_process_bad_outcome'

export type LessonPhase = 'candidate' | 'pattern' | 'validated_rule'

export interface LessonRecord {
  id: string
  companyId: string
  ticker: string
  entryThesis: string
  entryPrice: number | null
  exitPrice: number | null
  actualReturn: number | null
  benchmarkReturn: number | null
  benchmarkLabel: string | null        // e.g. "S&P500", "TOPIX"
  decisionQuality: DecisionQuality
  rootCause: string
  missedSignal: string | null
  ruleCandidate: string | null
  confidence: 1 | 2 | 3 | 4 | 5
  phase: LessonPhase
  counterfactual: string | null        // 反事実比較
  createdAt: string
  updatedAt: string
}

// ── System Metrics ───────────────────────────────────────────────────────
export interface MetricSnapshot {
  id: string
  asOfDate: string
  totalCases: number
  buyCount: number
  watchCount: number
  passCount: number
  buyHitRate6m: number | null          // BUYでプラスリターンの割合
  buyHitRate12m: number | null
  passMissRate: number | null          // PASSだったが上昇した割合
  watchConversionRate: number | null   // WATCHがBUYに昇格した割合
  portfolioAlpha: number | null
  createdAt: string
}

// ── App Settings ─────────────────────────────────────────────────────────
export interface AppSettings {
  id: 'default'
  activeProfileId: 'conservative' | 'standard' | 'aggressive'
  encryptionEnabled: boolean
  encryptionVerifier: string | null    // encrypt("ic-verified") — used to validate passphrase on startup
  lastBackupAt: string | null
  cagrGateMin: number                  // default 12
  defaultHorizonMonths: number         // default 36
  benchmarkLabel: string               // default 'S&P500'
  anthropicApiKey: string | null       // user-provided key; takes priority over env
  fmpApiKey: string | null             // Financial Modeling Prep API key
}
