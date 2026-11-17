import type {
  DataLaneInput, DataLaneScores, DataCoverage, RiskFlag, RiskLevel, MetricCoverageStatus,
  FiscalPeriodData,
  MarketLaneInput, MarketLaneOutputs,
  ValuationAssumptions, ValuationScenario,
  VerdictAxes, VerdictResult, VerdictProfile,
  ThesisStatus, MonitorItem,
} from '../types/domain'

// ═══════════════════════════════════════════════════════════════════════════
// DATA LANE SCORING — pure functions
// ═══════════════════════════════════════════════════════════════════════════

function clamp(n: number, min = 1, max = 5): 1 | 2 | 3 | 4 | 5 {
  return Math.min(max, Math.max(min, Math.round(n))) as 1 | 2 | 3 | 4 | 5
}

export function scoreBusinessQuality(input: DataLaneInput): 1 | 2 | 3 | 4 | 5 {
  let score = 3
  const g = input.revenueGrowthYoy
  const gm = input.grossMargin
  if (g !== null) {
    // Most severe first: checking `g < 5` before `g < 0` made the −2
    // penalty unreachable (audit fix, 2026-11-17).
    if (g < 0)       score -= 2
    else if (g < 5)  score -= 1
    else if (g >= 25) score += 1
    else if (g >= 15) score += 0.5
  }
  if (gm !== null) {
    if (gm < 10)      score -= 2
    else if (gm < 20) score -= 1
    else if (gm >= 60) score += 1
    else if (gm >= 40) score += 0.5
  }
  return clamp(score)
}

export function scoreCapitalEfficiency(input: DataLaneInput): 1 | 2 | 3 | 4 | 5 {
  let score = 3
  const roic = input.roic
  const dil = input.shareDilutionAnnual
  if (roic !== null) {
    // Most severe first: `roic < 8` before `roic < 0` made the −2
    // penalty unreachable (audit fix, 2026-11-17).
    if (roic < 0)       score -= 2
    else if (roic < 8)  score -= 1
    else if (roic >= 25) score += 2
    else if (roic >= 15) score += 1
  }
  if (dil !== null) {
    if (dil > 5)       score -= 1
    else if (dil > 2)  score -= 0.5
    else if (dil <= 0) score += 0.5  // buyback
  }
  return clamp(score)
}

export function scoreBalanceSheetSafety(input: DataLaneInput): 1 | 2 | 3 | 4 | 5 {
  let score = 3
  const de = input.debtToEbitda
  const cr = input.currentRatio
  if (de !== null) {
    if (de <= 0)       score += 2   // net cash
    else if (de <= 1)  score += 1
    else if (de <= 2)  score += 0
    else if (de <= 4)  score -= 1
    else               score -= 2
  }
  if (cr !== null) {
    if (cr >= 2)      score += 0.5
    else if (cr < 1)  score -= 1
  }
  return clamp(score)
}

export function scoreCashGeneration(input: DataLaneInput): 1 | 2 | 3 | 4 | 5 {
  let score = 3
  const fcf = input.fcfMargin
  const op  = input.operatingMargin
  if (fcf !== null) {
    if (fcf >= 20)     score += 2
    else if (fcf >= 10) score += 1
    else if (fcf >= 0)  score += 0
    else if (fcf < 0)   score -= 2
  }
  if (op !== null) {
    if (op >= 25)      score += 0.5
    else if (op < 0)   score -= 1
  }
  return clamp(score)
}

export function calculateDataScores(input: DataLaneInput): DataLaneScores {
  return {
    businessQuality:    scoreBusinessQuality(input),
    capitalEfficiency:  scoreCapitalEfficiency(input),
    balanceSheetSafety: scoreBalanceSheetSafety(input),
    cashGeneration:     scoreCashGeneration(input),
  }
}

// ── Data coverage (Phase 2: separate data quality from the score itself) ──

/** Metrics each score actually reads. Missing metrics are skipped by the
 *  scorers, which used to make a data-poor company look "neutral 3".
 *  Coverage makes that visible instead of hiding it inside the score. */
export const SCORE_METRICS: Record<keyof DataLaneScores, (keyof DataLaneInput)[]> = {
  businessQuality:    ['revenueGrowthYoy', 'grossMargin'],
  capitalEfficiency:  ['roic', 'shareDilutionAnnual'],
  balanceSheetSafety: ['debtToEbitda', 'currentRatio'],
  cashGeneration:     ['fcfMargin', 'operatingMargin'],
}

/** Three-way coverage: every metric a score reads is 'present', 'missing'
 *  (applicable but unavailable) or 'notApplicable' (the concept does not
 *  exist for this industry). Not-applicable is decided ONLY by the preset
 *  map passed in (`naMetrics`, metric → reason code) — never by the data
 *  being unavailable. Ratios are present / applicable, so NA metrics leave
 *  the denominator instead of silently dragging coverage down. */
export function calculateDataCoverage(
  input: DataLaneInput,
  naMetrics: Partial<Record<keyof DataLaneInput, string>> = {},
): DataCoverage {
  const perScore = {} as Record<keyof DataLaneScores, number>
  const perScoreApplicable = {} as Record<keyof DataLaneScores, number>
  const statuses: Partial<Record<keyof DataLaneInput, MetricCoverageStatus>> = {}
  const naReasons: Partial<Record<keyof DataLaneInput, string>> = {}
  let used = 0
  let applicableTotal = 0
  for (const key of Object.keys(SCORE_METRICS) as (keyof DataLaneScores)[]) {
    const metrics = SCORE_METRICS[key]
    let present = 0
    let applicable = 0
    for (const m of metrics) {
      const reason = naMetrics[m]
      if (reason !== undefined) {
        statuses[m] = 'notApplicable'
        naReasons[m] = reason
      } else if (input[m] !== null && input[m] !== undefined) {
        statuses[m] = 'present'
        present += 1
        applicable += 1
      } else {
        statuses[m] = 'missing'
        applicable += 1
      }
    }
    perScore[key] = applicable === 0 ? 0 : present / applicable
    perScoreApplicable[key] = applicable
    used += present
    applicableTotal += applicable
  }
  return {
    perScore,
    overall: applicableTotal === 0 ? 0 : used / applicableTotal,
    usedMetrics: used,
    totalMetrics: applicableTotal,
    perScoreApplicable,
    statuses,
    naReasons,
  }
}

/** A score is insufficient when it has NO applicable metrics at all, or
 *  when less than half of its applicable metrics are present — it is not
 *  evidence either way and must be presented as 判定不能, not "neutral".
 *  Legacy coverage objects (saved before the three-way split) have no
 *  perScoreApplicable; for them the ratio was computed over all metrics,
 *  so the plain ratio test still applies. */
export function isScoreInsufficient(coverage: DataCoverage, key: keyof DataLaneScores): boolean {
  if (coverage.perScoreApplicable && coverage.perScoreApplicable[key] === 0) return true
  return coverage.perScore[key] < 0.5
}

// ── Financial risk screen (Phase 2: independent of the quality scores) ────
//
// Rule-based red flags, deliberately kept separate from the 1–5 quality
// scores: a company can score well on quality and still trip a risk flag
// (e.g. an acquisition-heavy balance sheet). Severe flags name the verdict
// axis they are a veto candidate for, so the screen feeds the existing
// IC-07 veto flow instead of creating a parallel judgement.
// Thresholds are round, principle-based values — NOT fitted to any
// backtest sample.

export function assessFinancialRisk(
  input: DataLaneInput,
  periods?: FiscalPeriodData[],
): RiskFlag[] {
  const flags: RiskFlag[] = []
  const push = (f: RiskFlag) => flags.push(f)

  // Leverage level
  const de = input.debtToEbitda
  if (de !== null) {
    if (de >= 6) push({
      id: 'leverage_extreme', severity: 'severe', vetoAxis: 'balanceSheetSafety',
      label: 'レバレッジが極端',
      detail: `純負債/EBITDA ${de.toFixed(1)}x — 6x以上は金利・市況の変化に対する耐性が低い水準です。`,
    })
    else if (de >= 4) push({
      id: 'leverage_high', severity: 'caution', vetoAxis: 'balanceSheetSafety',
      label: 'レバレッジが高水準',
      detail: `純負債/EBITDA ${de.toFixed(1)}x — 4x以上は要注意水準です。`,
    })
  }

  // Acquisition dependence: goodwill + intangibles dominating the balance sheet
  const gia = input.goodwillIntangiblesToAssets
  if (gia !== null && gia !== undefined) {
    if (gia >= 70) push({
      id: 'acquisition_dependence_severe', severity: 'severe', vetoAxis: 'balanceSheetSafety',
      label: '買収資産への依存が極端',
      detail: `のれん+無形資産が総資産の ${gia.toFixed(0)}% — 実体資産より買収で得た資産が支配的で、減損が純資産を直撃する構造です。`,
    })
    else if (gia >= 50) push({
      id: 'acquisition_dependence', severity: 'caution', vetoAxis: 'balanceSheetSafety',
      label: '買収資産への依存が高い',
      detail: `のれん+無形資産が総資産の ${gia.toFixed(0)}% — 買収依存度が高い構造です。`,
    })
  }

  // Earnings quality: accounting profit without cash backing
  const op = input.operatingMargin
  const fcf = input.fcfMargin
  if (op !== null && fcf !== null) {
    if (op > 0 && fcf < 0) push({
      id: 'earnings_quality_negative_fcf', severity: 'severe', vetoAxis: 'executionRisk',
      label: '利益がキャッシュを伴っていない',
      detail: `営業利益率 ${op.toFixed(1)}% に対し FCFマージン ${fcf.toFixed(1)}% — 利益の質に疑問があります。`,
    })
    else if (op - fcf >= 15) push({
      id: 'earnings_quality_gap', severity: 'caution', vetoAxis: 'executionRisk',
      label: '利益とキャッシュの乖離が大きい',
      detail: `営業利益率とFCFマージンの差が ${(op - fcf).toFixed(1)}pt — 発生主義の調整項目を確認してください。`,
    })
  }

  // Persistent negative FCF across periods (single-year dips are common)
  if (periods && periods.length >= 2) {
    const negYears = periods.filter(p => p.input.fcfMargin !== null && p.input.fcfMargin < 0).length
    if (negYears >= 2 && fcf !== null && fcf >= 0) {
      push({
        id: 'fcf_negative_history', severity: 'caution', vetoAxis: 'executionRisk',
        label: '過去に複数年のFCFマイナス',
        detail: `直近 ${periods.length} 期中 ${negYears} 期でFCFマージンがマイナスです。`,
      })
    }
  }

  // Dilution
  const dil = input.shareDilutionAnnual
  if (dil !== null) {
    if (dil > 5) push({
      id: 'dilution_severe', severity: 'severe', vetoAxis: 'capitalEfficiency',
      label: '株式希薄化が大きい',
      detail: `年率 ${dil.toFixed(1)}% の希薄化 — 株主価値の目減りが継続しています。`,
    })
    else if (dil > 2) push({
      id: 'dilution_high', severity: 'caution', vetoAxis: 'capitalEfficiency',
      label: '株式希薄化が目立つ',
      detail: `年率 ${dil.toFixed(1)}% の希薄化が続いています。`,
    })
  }

  // Sustained revenue decline (uses the 3y CAGR that scoring ignored)
  const g1 = input.revenueGrowthYoy
  const g3 = input.revenueGrowth3y
  if (g1 !== null && g3 !== null && g1 < 0 && g3 < 0) {
    push({
      id: 'revenue_decline_sustained', severity: 'caution', vetoAxis: 'growthQuality',
      label: '売上が持続的に減少',
      detail: `前年比 ${g1.toFixed(1)}%、3年CAGR ${g3.toFixed(1)}% — 一時的でない減少トレンドです。`,
    })
  }

  return flags
}

/** The risk screen plus its explicit state. The screen can only judge
 *  what at least one of its rules can read; when no rule has its inputs,
 *  the level is 'unevaluable' — which must never be shown as 'normal'.
 *  A rule counts as readable when ALL of its required inputs are present
 *  (the earnings-quality pair needs both margins, the decline rule needs
 *  both growth figures, the history rule needs period FCF data). */
export function evaluateFinancialRisk(
  input: DataLaneInput,
  periods?: FiscalPeriodData[],
): { flags: RiskFlag[]; level: RiskLevel } {
  const has = (v: number | null | undefined) => v !== null && v !== undefined
  const readable =
    has(input.debtToEbitda) ||
    has(input.goodwillIntangiblesToAssets) ||
    (has(input.operatingMargin) && has(input.fcfMargin)) ||
    has(input.shareDilutionAnnual) ||
    (has(input.revenueGrowthYoy) && has(input.revenueGrowth3y)) ||
    (periods !== undefined && periods.some(p => has(p.input.fcfMargin)))
  if (!readable) return { flags: [], level: 'unevaluable' }
  const flags = assessFinancialRisk(input, periods)
  const level: RiskLevel = flags.some(f => f.severity === 'severe')
    ? 'severe'
    : flags.length > 0
      ? 'caution'
      : 'normal'
  return { flags, level }
}

// ── Trend helpers (Phase 4-B2) ────────────────────────────────────────────

/** Delta between current and previous period (pt difference, not % change) */
export function calculateYoY(current: number | null, prev: number | null): number | null {
  if (current === null || prev === null) return null
  return current - prev
}

/** Detect trend direction from chronological values (oldest → newest) */
export function detectTrend(values: (number | null)[]): 'up' | 'down' | 'flat' {
  const valid = values.filter((v): v is number => v !== null)
  if (valid.length < 2) return 'flat'
  const delta = valid[valid.length - 1] - valid[0]
  if (delta > 0.5) return 'up'
  if (delta < -0.5) return 'down'
  return 'flat'
}

/** The subset of data scores that are sufficiently grounded to be used
 *  downstream (e.g. as Verdict axis suggestions). A score flagged
 *  insufficient by coverage is OMITTED — never passed on as a neutral
 *  number, which is how an unevaluable score would otherwise leak into
 *  the final verdict as "normal". */
export function sufficientDataScores(
  scores: DataLaneScores,
  coverage: DataCoverage,
): Partial<DataLaneScores> {
  const out: Partial<DataLaneScores> = {}
  for (const key of Object.keys(scores) as (keyof DataLaneScores)[]) {
    if (!isScoreInsufficient(coverage, key)) out[key] = scores[key]
  }
  return out
}

export function buildDataSummary(scores: DataLaneScores, input: DataLaneInput, coverage?: DataCoverage): string {
  const lines: string[] = []
  const mark = (key: keyof DataLaneScores) =>
    coverage && isScoreInsufficient(coverage, key) ? ' (insufficient — 判定不能)' : ''
  lines.push(`Business Quality: ${scores.businessQuality}/5${mark('businessQuality')}`)
  lines.push(`Capital Efficiency: ${scores.capitalEfficiency}/5${mark('capitalEfficiency')}`)
  lines.push(`Balance Sheet Safety: ${scores.balanceSheetSafety}/5${mark('balanceSheetSafety')}`)
  lines.push(`Cash Generation: ${scores.cashGeneration}/5${mark('cashGeneration')}`)
  if (input.roic !== null)       lines.push(`ROIC: ${input.roic}%`)
  if (input.fcfMargin !== null)  lines.push(`FCF Margin: ${input.fcfMargin}%`)
  if (input.debtToEbitda !== null) lines.push(`Net Debt/EBITDA: ${input.debtToEbitda}x`)
  return lines.join(' | ')
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKET LANE CALCULATION — pure functions
// ═══════════════════════════════════════════════════════════════════════════

export function calculateMarketOutputs(input: MarketLaneInput): MarketLaneOutputs {
  // Expectation gap
  const gap = (input.userRevenueGrowthForecast !== null && input.analystRevenueConsensusGrowth !== null)
    ? input.userRevenueGrowthForecast - input.analystRevenueConsensusGrowth
    : null

  // Valuation pressure
  let valuationPressure: 'low' | 'medium' | 'high' = 'medium'
  if (input.currentEvEbitda !== null && input.historicalEvEbitdaMax !== null) {
    const pct = input.currentEvEbitda / input.historicalEvEbitdaMax
    if (pct >= 0.9)      valuationPressure = 'high'
    else if (pct <= 0.5) valuationPressure = 'low'
  }

  // Sentiment risk
  let sentimentRisk: 'low' | 'medium' | 'high' = 'medium'
  if (input.shortInterestPct !== null) {
    if (input.shortInterestPct >= 10)     sentimentRisk = 'high'
    else if (input.shortInterestPct <= 3) sentimentRisk = 'low'
  }

  // Consensus dependency (analyst count proxy)
  let consensusDependency: 'low' | 'medium' | 'high' = 'medium'
  if (input.analystCount !== null) {
    if (input.analystCount >= 20)    consensusDependency = 'high'
    else if (input.analystCount <= 5) consensusDependency = 'low'
  }

  return { marketExpectationGap: gap, valuationPressure, sentimentRisk, consensusDependency }
}

export function buildMarketSummary(input: MarketLaneInput, outputs: MarketLaneOutputs): string {
  const lines: string[] = []
  if (outputs.marketExpectationGap !== null)
    lines.push(`Expectation Gap: ${outputs.marketExpectationGap > 0 ? '+' : ''}${outputs.marketExpectationGap.toFixed(1)}%`)
  lines.push(`Valuation Pressure: ${outputs.valuationPressure}`)
  lines.push(`Sentiment Risk: ${outputs.sentimentRisk}`)
  if (input.currentEvEbitda !== null) lines.push(`EV/EBITDA: ${input.currentEvEbitda}x`)
  return lines.join(' | ')
}

// ═══════════════════════════════════════════════════════════════════════════
// VALUATION ENGINE — pure functions
// ═══════════════════════════════════════════════════════════════════════════

export function calculateValuationScenario(
  assumptions: ValuationAssumptions,
  revenueGrowthAdj: number,
  fcfMarginAdj: number,
  exitMultipleAdj: number,
): ValuationScenario {
  const notes: string[] = []
  let impliedEnterpriseValue: number | null = null
  let expectedCagr: number | null = null

  const {
    currentRevenue, currentEnterpriseValue,
    baseRevenueGrowth, baseFcfMargin, exitMultiple, years
  } = assumptions

  if (
    currentRevenue !== null &&
    currentEnterpriseValue !== null &&
    baseRevenueGrowth !== null &&
    baseFcfMargin !== null &&
    exitMultiple !== null &&
    years > 0
  ) {
    const adjGrowth = (baseRevenueGrowth / 100) * revenueGrowthAdj
    const adjMargin = (baseFcfMargin / 100) * fcfMarginAdj
    const adjMultiple = exitMultiple * exitMultipleAdj

    const futureRevenue = currentRevenue * Math.pow(1 + adjGrowth, years)
    const futureFcf = futureRevenue * adjMargin
    impliedEnterpriseValue = futureFcf * adjMultiple

    if (impliedEnterpriseValue > 0 && currentEnterpriseValue > 0) {
      expectedCagr = (Math.pow(impliedEnterpriseValue / currentEnterpriseValue, 1 / years) - 1) * 100
    }

    notes.push(`Revenue CAGR: ${(adjGrowth * 100).toFixed(1)}%`)
    notes.push(`FCF Margin: ${(adjMargin * 100).toFixed(1)}%`)
    notes.push(`Exit EV/FCF: ${adjMultiple.toFixed(1)}x`)
  } else {
    notes.push('入力不足のため計算不可')
  }

  return { revenueGrowthAdj, fcfMarginAdj, exitMultipleAdj, impliedEnterpriseValue, expectedCagr, notes }
}

export type CagrGate = 'pass' | 'watch' | 'block'

/** Default minimum expected CAGR for BUY (Settings: cagrGateMin). */
export const DEFAULT_CAGR_GATE_MIN = 12
/** Expected CAGR at or above this is a clear pass, regardless of gateMin. */
export const CAGR_GATE_PASS = 20

/**
 * Classify an expected CAGR against the valuation gate.
 * Returns null when the CAGR is unknown (no valuation yet) — callers must
 * not treat "unknown" as a block.
 *   expectedCagr <  gateMin            → 'block' (BUY is forbidden)
 *   gateMin      <= expectedCagr < 20  → 'watch'
 *   expectedCagr >= max(20, gateMin)   → 'pass'
 */
export function cagrGateFor(
  expectedCagr: number | null,
  cagrGateMin: number = DEFAULT_CAGR_GATE_MIN,
): CagrGate | null {
  if (expectedCagr === null || !Number.isFinite(expectedCagr)) return null
  const gateMin = Number.isFinite(cagrGateMin) && cagrGateMin > 0
    ? cagrGateMin
    : DEFAULT_CAGR_GATE_MIN
  if (expectedCagr < gateMin) return 'block'
  if (expectedCagr >= Math.max(CAGR_GATE_PASS, gateMin)) return 'pass'
  return 'watch'
}

/** Gate value stored on a ValuationReport. 'unknown' means the CAGR could
 *  not be calculated (missing inputs) — deliberately distinct from 'block'
 *  (calculated, but below the minimum). The Verdict engine never sees
 *  'unknown': it re-derives the gate with cagrGateFor, which returns null
 *  for an unknown CAGR and therefore does not block. */
export type StoredCagrGate = CagrGate | 'unknown'

/**
 * Reverse the valuation: at the Base FCF margin and exit multiple, what
 * annual revenue growth makes the implied EV exactly equal today's EV?
 * That is the growth the current price already "prices in" — the number a
 * user should compare their own forecast against. Returns % or null.
 */
export function impliedRevenueGrowth(assumptions: ValuationAssumptions): number | null {
  const { currentRevenue, currentEnterpriseValue, baseFcfMargin, exitMultiple, years } = assumptions
  if (
    currentRevenue === null || currentEnterpriseValue === null ||
    baseFcfMargin === null || exitMultiple === null ||
    currentRevenue <= 0 || currentEnterpriseValue <= 0 ||
    baseFcfMargin <= 0 || exitMultiple <= 0 || years <= 0
  ) return null
  const denominator = currentRevenue * (baseFcfMargin / 100) * exitMultiple
  if (denominator <= 0) return null
  return (Math.pow(currentEnterpriseValue / denominator, 1 / years) - 1) * 100
}

/** An expected CAGR at or above this, while "passing" the gate, usually
 *  means the inputs describe a crashed/distressed company rather than a
 *  bargain (the mechanical model sees a shrunken EV). Warn, don't pass
 *  silently. Principle-based round value, not fitted to any sample. */
export const CAGR_SUSPICIOUS_HIGH = 40

export function isSuspiciouslyHighCagr(expectedCagr: number | null): boolean {
  return expectedCagr !== null && Number.isFinite(expectedCagr) && expectedCagr >= CAGR_SUSPICIOUS_HIGH
}

export function calculateValuation(
  assumptions: ValuationAssumptions,
  cagrGateMin: number = DEFAULT_CAGR_GATE_MIN,
) {
  const bear = calculateValuationScenario(assumptions, 0.65, 0.85, 0.75)
  const base = calculateValuationScenario(assumptions, 1.00, 1.00, 1.00)
  const bull = calculateValuationScenario(assumptions, 1.40, 1.15, 1.25)

  const expectedCagr = base.expectedCagr

  // An uncalculable CAGR is stored as 'unknown', NOT 'block': "cannot
  // calculate" and "calculated but too low" are different situations and
  // must stay distinguishable in saved reports (Phase 3 fix).
  const cagrGate: StoredCagrGate = cagrGateFor(expectedCagr, cagrGateMin) ?? 'unknown'

  const downsideRiskScore = (base.expectedCagr !== null && bear.expectedCagr !== null)
    ? base.expectedCagr - bear.expectedCagr
    : 0

  const impliedGrowthPct = impliedRevenueGrowth(assumptions)

  return { bear, base, bull, expectedCagr, cagrGate, downsideRiskScore, impliedGrowthPct }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERDICT ENGINE — pure functions
// ═══════════════════════════════════════════════════════════════════════════

export interface VerdictGateOptions {
  /**
   * Valuation CAGR gate for this company (see cagrGateFor).
   * 'block' downgrades a BUY verdict to WATCH. Omit / null when there is
   * no valuation yet — an unknown gate must not block a verdict.
   */
  cagrGate?: CagrGate | null
}

export function calculateVerdict(
  axisScores: VerdictAxes,
  profile: VerdictProfile,
  weights?: Partial<Record<keyof VerdictAxes, number>>,
  options?: VerdictGateOptions,
): { totalScore: number; vetoCount: number; verdict: VerdictResult; cagrBlocked: boolean } {
  const axisEntries = Object.entries(axisScores) as [keyof VerdictAxes, { score: number; veto: boolean }][]

  let totalScore: number
  if (weights) {
    const weightedSum = axisEntries.reduce((sum, [key, a]) => sum + a.score * (weights[key] ?? 1.0), 0)
    const sumWeights  = axisEntries.reduce((sum, [key])   => sum + (weights[key] ?? 1.0), 0)
    totalScore = Math.round((weightedSum / sumWeights) * axisEntries.length)
  } else {
    totalScore = axisEntries.reduce((sum, [, a]) => sum + a.score, 0)
  }
  const vetoCount = axisEntries.filter(([, a]) => a.veto).length

  let verdict: VerdictResult

  // Valuation veto check (valuationAttractiveness < 3 → no BUY in standard/conservative)
  const valScore = axisScores.valuationAttractiveness.score

  if (vetoCount > profile.maxVetoForBuy) {
    verdict = 'PASS'
  } else if (valScore < 3 && profile.id !== 'aggressive') {
    verdict = 'WATCH'
  } else if (totalScore >= profile.buyThreshold) {
    verdict = 'BUY'
  } else if (totalScore >= profile.watchThreshold) {
    verdict = 'WATCH'
  } else {
    verdict = 'PASS'
  }

  // Valuation gate (enforced): expected CAGR below the minimum blocks BUY.
  // A blocked BUY is downgraded to WATCH; WATCH / PASS are left unchanged.
  const cagrBlocked = options?.cagrGate === 'block'
  if (cagrBlocked && verdict === 'BUY') {
    verdict = 'WATCH'
  }

  return { totalScore, vetoCount, verdict, cagrBlocked }
}

// ═══════════════════════════════════════════════════════════════════════════
// MONITORING — pure functions
// ═══════════════════════════════════════════════════════════════════════════

export function evaluateMonitorItemStatus(
  item: Pick<MonitorItem, 'currentValue' | 'threshold' | 'operator'>
): 'ok' | 'warning' | 'breach' | 'manual_check' {
  if (item.operator === 'manual') return 'manual_check'
  if (item.currentValue === null || item.threshold === null) return 'manual_check'

  const { currentValue: v, threshold: t, operator: op } = item
  let breached = false
  if (op === '<')  breached = v < t
  if (op === '<=') breached = v <= t
  if (op === '>')  breached = v > t
  if (op === '>=') breached = v >= t
  if (op === '=')  breached = v === t

  return breached ? 'breach' : 'ok'
}

export function calculateThesisStatus(items: MonitorItem[]): ThesisStatus {
  const breachCount = items.filter(i => i.status === 'breach').length
  const warningCount = items.filter(i => i.status === 'warning').length
  if (breachCount >= 2) return 'broken'
  if (breachCount >= 1 || warningCount >= 2) return 'warning'
  return 'intact'
}
