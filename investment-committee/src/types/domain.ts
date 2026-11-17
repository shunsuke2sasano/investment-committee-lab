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
  dataPresetId?: string
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
  /** (Goodwill + intangible assets) / total assets, %. Optional: feeds the
   *  financial risk screen (acquisition dependence), not the quality scores. */
  goodwillIntangiblesToAssets?: number | null
}

// ── Multi-period data (Phase 4-B2) ────────────────────────────────────────
export interface FiscalPeriodData {
  fiscalYear: string          // e.g. "FY2024"
  input: DataLaneInput
}

export interface DataLaneScores {
  businessQuality: 1 | 2 | 3 | 4 | 5
  capitalEfficiency: 1 | 2 | 3 | 4 | 5
  balanceSheetSafety: 1 | 2 | 3 | 4 | 5
  cashGeneration: 1 | 2 | 3 | 4 | 5
}

// ── Data coverage & financial risk screen (Phase 2) ─────────────────────
/** Three-way classification of every metric a score reads. 'notApplicable'
 *  is decided ONLY by the industry preset (with a reason code) — never by
 *  the data merely being unavailable; an unavailable applicable metric is
 *  'missing'. */
export type MetricCoverageStatus = 'present' | 'missing' | 'notApplicable'

/** How much of the data each score is actually built on. Ratios are
 *  present / applicable: not-applicable metrics are excluded from the
 *  denominator, so `totalMetrics` counts applicable metrics only.
 *  `perScoreApplicable`, `statuses` and `naReasons` are absent on records
 *  saved before the three-way split (legacy coverage). */
export interface DataCoverage {
  perScore: Record<keyof DataLaneScores, number>
  overall: number
  usedMetrics: number
  totalMetrics: number
  perScoreApplicable?: Record<keyof DataLaneScores, number>
  statuses?: Partial<Record<keyof DataLaneInput, MetricCoverageStatus>>
  naReasons?: Partial<Record<keyof DataLaneInput, string>>
}

export type RiskSeverity = 'caution' | 'severe'

/** Explicit three-level risk state, plus 'unevaluable' when too little
 *  data exists to run the screen at all. 'unevaluable' must never be
 *  presented as 'normal'. Stored on the analysis; absent on legacy
 *  records, where it is derived from the saved flags/inputs. */
export type RiskLevel = 'normal' | 'caution' | 'severe' | 'unevaluable'

/** A rule-based red flag from the financial risk screen. Kept separate from
 *  the quality scores; `vetoAxis` names the verdict axis this flag is a
 *  veto candidate for in the IC-07 veto flow. */
export interface RiskFlag {
  id: string
  severity: RiskSeverity
  label: string
  detail: string
  vetoAxis?: keyof VerdictAxes
}

export interface DataAnalysis {
  id: string
  companyId: string
  input: DataLaneInput        // latest period (backward compat with Verdict feed)
  scores: DataLaneScores
  summary: string
  computedAt: string
  periods?: FiscalPeriodData[]  // multi-period data; undefined = legacy single-period
  presetId?: string
  coverage?: DataCoverage       // undefined = legacy record saved before Phase 2
  riskFlags?: RiskFlag[]        // undefined = legacy record saved before Phase 2
  riskLevel?: RiskLevel         // undefined = legacy record; derive via evaluateFinancialRisk
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
  cagrGate: 'pass' | 'watch' | 'block' | 'unknown' // >= max(20, gateMin) / gateMin-20 / < gateMin / uncalculable (gateMin = settings.cagrGateMin, default 12)
  impliedGrowthPct?: number | null     // revenue growth the current EV prices in at Base margin/multiple (Phase 3)
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

// ── Position（保有管理）──────────────────────────────────────────────────
export type PositionStatus = 'watching' | 'holding' | 'sold'

export interface PositionRecord {
  id: string
  companyId: string
  status: PositionStatus

  entryDate: string | null
  entryPrice: number | null
  shares: number | null
  entryCurrency: 'USD' | 'JPY'

  entryEvEbitda: number | null
  entryVerdict: 'BUY' | 'WATCH' | 'PASS' | null

  exitDate: string | null
  exitPrice: number | null

  note: string | null

  createdAt: string
  updatedAt: string
}

// ── Forward Decision Log (Phase A) ───────────────────────────────────────
// Append-only record of an investment decision, frozen with the information
// available at decision time. See FORWARD_DECISION_LOG_SPEC.md.
// The log is a record of *judgments*: real trades live in PositionRecord,
// method validation lives in the (future) virtual portfolio ledger.

export type DecisionKind = 'buy' | 'watch' | 'pass'
export type DecisionEntrySource = 'verdict_save' | 'manual'
export type CandidateSource = 'engine_ranking' | 'manual_watchlist' | 'ad_hoc'

/** Price snapshot shared by the stock and its benchmarks. `priceDate` is the
 * market date the price refers to; `recordedAt` is when it was written down.
 * Returns are only computed when priceType/adjustmentBasis/currency match
 * between decision time and evaluation time (Issue #6, P0-3). */
export type PriceType = 'raw' | 'adjusted'
export interface PriceSnapshot {
  price: number | null
  priceDate: string | null
  recordedAt: string
  currency: 'USD' | 'JPY'
  priceType: PriceType
  adjustmentBasis: string | null
  source: string | null
}

export interface BenchmarkPriceSnapshot extends PriceSnapshot {
  label: string
  ticker: string
}

/** Whether a source section was verified to predate the decision.
 * 'verified' sections carry a frozen content copy; 'unverified' sections
 * carry only the reference (the source postdates the decision, so its
 * content must not be presented as decision-time information); 'absent'
 * means no source record existed at or before the decision time. */
export type SectionAsOfStatus = 'verified' | 'unverified' | 'absent'
export interface SourceRef {
  id: string | null
  sourceAt: string | null
  asOfStatus: SectionAsOfStatus
}

export type ComparisonExclusion =
  | 'missing_price'
  | 'missing_price_date'
  | 'missing_price_source'
  | 'version_unknown'
  | 'retrospective'

export interface DecisionLogRecord {
  id: string
  /** Monotonic creation sequence (0-based), assigned by the repository.
   * The hash chain is ordered by seq — wall-clock timestamps can tie at
   * millisecond resolution and must not decide the chain order. */
  seq: number
  schemaVersion: 1
  companyId: string
  ticker: string
  companyName: string
  decidedAt: string
  createdAt: string
  entrySource: DecisionEntrySource
  retrospective: boolean

  // Model / code version. buildCommit null → versionUnknown, and the record
  // is excluded from headline comparisons (no false precision).
  appVersion: string
  buildCommit: string | null
  versionUnknown: boolean

  // Candidate-population reservations (Issue #6, P0-2). Filled once a
  // prediction engine exists; null in Phase A. A handful of manually
  // recorded names is NOT a candidate population and proves nothing about
  // the committee's added value.
  decisionSessionId: string | null
  candidateSource: CandidateSource | null
  aiReviewUsed: boolean
  engineVersionOrNone: string | null

  // Decision-time prices (Issue #6, P0-3). Primary benchmark is SPY.
  priceAtDecision: PriceSnapshot
  benchmarkPrice: BenchmarkPriceSnapshot
  extraBenchmarks: BenchmarkPriceSnapshot[]

  // Comparability of this record for later performance measurement.
  comparisonStatus: 'evaluable' | 'not_evaluable'
  comparisonExclusions: ComparisonExclusion[]

  // Committee judgment (frozen copies + references)
  verdictReportId: string | null
  verdictResult: 'BUY' | 'WATCH' | 'PASS' | null
  humanFinalDecision: DecisionKind | null
  previousLogId: string | null
  axisScores: VerdictAxes | null
  totalScore: number | null
  vetoCount: number | null
  profileUsed: VerdictProfile | null
  rationale: string

  // Data lane (frozen copies; only for 'verified' sections)
  dataAnalysisId: string | null
  scores: DataLaneScores | null
  coverage: DataCoverage | null
  riskLevel: RiskLevel | null
  riskFlags: RiskFlag[] | null
  dataInputSnapshot: DataLaneInput | null
  periodsSnapshot: FiscalPeriodData[] | null

  // Valuation (frozen copies; only for 'verified' sections)
  valuationReportId: string | null
  valuationAssumptions: ValuationAssumptions | null
  expectedCagr: number | null
  cagrGate: 'pass' | 'watch' | 'block' | 'unknown' | null
  impliedGrowthPct: number | null
  cagrGateMinUsed: number | null

  // Thesis & AI review (frozen copies; only for 'verified' sections)
  thesisSnapshot: { thesisText: string; collapseConditions: CollapseCondition[] } | null
  reviewReportId: string | null
  reviewModel: string | null
  reviewSummary: { risks: ReviewRisk[]; mismatches: ReviewMismatch[] } | null

  sourceRefs: {
    dataAnalysis: SourceRef
    valuation: SourceRef
    thesis: SourceRef
    review: SourceRef
  }

  // Reserved for the future ranking engine (never written after creation).
  engineRank: number | null
  engineScore: number | null
  linkedPositionId: string | null

  // Integrity: SHA-256 over the whole record except contentHash itself
  // (id, decidedAt, createdAt and prevLogHash included). Tamper *detection*
  // for one's own records — not third-party proof (Issue #6, P0-4).
  contentHash: string
  prevLogHash: string | null
}

export type DecisionLogEventType =
  | 'created'
  | 'note_added'
  | 'correction_note'
  | 'position_linked'
  | 'position_unlinked'

export interface DecisionLogEvent {
  id: string
  logId: string
  type: DecisionLogEventType
  at: string
  note: string | null
  payload: Record<string, unknown> | null
  contentHash: string
}

export interface DecisionLogEvaluation {
  id: string
  logId: string
  horizonMonths: number
  evaluatedAt: string
  priceNow: PriceSnapshot
  benchmarkPriceNow: BenchmarkPriceSnapshot | null
  stockReturnPct: number | null
  benchmarkReturnPct: number | null
  excessReturnPct: number | null
  note: string | null
  contentHash: string
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
