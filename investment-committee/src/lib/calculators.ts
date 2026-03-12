import type {
  DataLaneInput, DataLaneScores,
  MarketLaneInput, MarketLaneOutputs,
  ValuationAssumptions, ValuationScenario, ValuationReport,
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
    if (g >= 25) score += 1
    else if (g >= 15) score += 0.5
    else if (g < 5)  score -= 1
    else if (g < 0)  score -= 2
  }
  if (gm !== null) {
    if (gm >= 60) score += 1
    else if (gm >= 40) score += 0.5
    else if (gm < 20) score -= 1
    else if (gm < 10) score -= 2
  }
  return clamp(score)
}

export function scoreCapitalEfficiency(input: DataLaneInput): 1 | 2 | 3 | 4 | 5 {
  let score = 3
  const roic = input.roic
  const dil = input.shareDilutionAnnual
  if (roic !== null) {
    if (roic >= 25) score += 2
    else if (roic >= 15) score += 1
    else if (roic >= 8)  score += 0
    else if (roic < 8)   score -= 1
    else if (roic < 0)   score -= 2
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

export function buildDataSummary(scores: DataLaneScores, input: DataLaneInput): string {
  const lines: string[] = []
  lines.push(`Business Quality: ${scores.businessQuality}/5`)
  lines.push(`Capital Efficiency: ${scores.capitalEfficiency}/5`)
  lines.push(`Balance Sheet Safety: ${scores.balanceSheetSafety}/5`)
  lines.push(`Cash Generation: ${scores.cashGeneration}/5`)
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

export function calculateValuation(assumptions: ValuationAssumptions) {
  const bear = calculateValuationScenario(assumptions, 0.65, 0.85, 0.75)
  const base = calculateValuationScenario(assumptions, 1.00, 1.00, 1.00)
  const bull = calculateValuationScenario(assumptions, 1.40, 1.15, 1.25)

  const expectedCagr = base.expectedCagr

  let cagrGate: 'pass' | 'watch' | 'block' = 'block'
  if (expectedCagr !== null) {
    if (expectedCagr >= 20)      cagrGate = 'pass'
    else if (expectedCagr >= 12) cagrGate = 'watch'
  }

  const downsideRiskScore = (base.expectedCagr !== null && bear.expectedCagr !== null)
    ? base.expectedCagr - bear.expectedCagr
    : 0

  return { bear, base, bull, expectedCagr, cagrGate, downsideRiskScore }
}

// ═══════════════════════════════════════════════════════════════════════════
// VERDICT ENGINE — pure functions
// ═══════════════════════════════════════════════════════════════════════════

export function calculateVerdict(
  axisScores: VerdictAxes,
  profile: VerdictProfile,
): { totalScore: number; vetoCount: number; verdict: VerdictResult } {
  const axes = Object.values(axisScores) as { score: number; veto: boolean }[]
  const totalScore = axes.reduce((sum, a) => sum + a.score, 0)
  const vetoCount  = axes.filter(a => a.veto).length

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

  return { totalScore, vetoCount, verdict }
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
