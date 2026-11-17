import { describe, it, expect } from 'vitest'
import {
  calculateVerdict, calculateValuation, cagrGateFor,
  scoreBusinessQuality, scoreCapitalEfficiency,
  scoreBalanceSheetSafety, scoreCashGeneration,
  calculateDataCoverage, isScoreInsufficient, assessFinancialRisk, evaluateFinancialRisk,
  sufficientDataScores, buildDataSummary, calculateDataScores,
  isSuspiciouslyHighCagr,
} from './calculators'
import { NOT_APPLICABLE_METRICS } from './industryPresets'
import type { DataCoverage } from '../types/domain'
import { VERDICT_PROFILES } from '../types/domain'
import type { VerdictAxes, AxisScore, ValuationAssumptions, DataLaneInput } from '../types/domain'

const emptyInput: DataLaneInput = {
  revenueGrowthYoy: null, revenueGrowth3y: null,
  grossMargin: null, operatingMargin: null, fcfMargin: null,
  roic: null, debtToEbitda: null, netDebtToEquity: null,
  shareDilutionAnnual: null, reinvestmentRate: null, currentRatio: null,
}
const input = (patch: Partial<DataLaneInput>): DataLaneInput => ({ ...emptyInput, ...patch })

const axis = (score: AxisScore['score'], veto = false): AxisScore => ({
  score, veto, comment: '', evidenceMetrics: [],
})

function allAxes(score: AxisScore['score']): VerdictAxes {
  return {
    businessQuality: axis(score), growthQuality: axis(score),
    capitalEfficiency: axis(score), balanceSheetSafety: axis(score),
    valuationAttractiveness: axis(score), marketExpectationGap: axis(score),
    executionRisk: axis(score), governance: axis(score),
  }
}

const std = VERDICT_PROFILES['standard']
const conservative = VERDICT_PROFILES['conservative']
const aggressive = VERDICT_PROFILES['aggressive']

describe('calculateVerdict — profile thresholds', () => {
  it('score 40/40 is BUY for every profile', () => {
    expect(calculateVerdict(allAxes(5), std).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), conservative).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), aggressive).verdict).toBe('BUY')
  })

  it('respects the BUY threshold boundary (standard: 30)', () => {
    const axes = allAxes(3) // 24 points, valuation 3 → no valScore rule
    axes.businessQuality = axis(5); axes.growthQuality = axis(5); axes.capitalEfficiency = axis(5) // +6 → 30
    expect(calculateVerdict(axes, std).totalScore).toBe(30)
    expect(calculateVerdict(axes, std).verdict).toBe('BUY')
    expect(calculateVerdict(axes, conservative).verdict).toBe('WATCH') // needs 32
  })

  it('falls to WATCH at the watch threshold and PASS below it', () => {
    const watch = allAxes(2); watch.valuationAttractiveness = axis(3)
    watch.businessQuality = axis(5); watch.growthQuality = axis(4) // 17 - 2 + 5 + 2 = 22
    expect(calculateVerdict(watch, std).totalScore).toBe(22)
    expect(calculateVerdict(watch, std).verdict).toBe('WATCH')

    const pass = allAxes(2); pass.valuationAttractiveness = axis(3) // 17 points
    expect(calculateVerdict(pass, std).verdict).toBe('PASS')
  })

  it('veto count above the profile max forces PASS', () => {
    const axes = allAxes(5)
    axes.governance = axis(5, true); axes.executionRisk = axis(5, true) // 2 vetos > max 1
    expect(calculateVerdict(axes, std).vetoCount).toBe(2)
    expect(calculateVerdict(axes, std).verdict).toBe('PASS')
    // Aggressive allows 2 vetos for BUY
    expect(calculateVerdict(axes, aggressive).verdict).toBe('BUY')
  })

  it('valuation axis below 3 caps at WATCH for standard/conservative only', () => {
    const axes = allAxes(5); axes.valuationAttractiveness = axis(2)
    expect(calculateVerdict(axes, std).verdict).toBe('WATCH')
    expect(calculateVerdict(axes, aggressive).verdict).toBe('BUY')
  })
})

describe('calculateVerdict — CAGR gate enforcement', () => {
  it('downgrades BUY to WATCH when the gate is block', () => {
    const r = calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'block' })
    expect(r.verdict).toBe('WATCH')
    expect(r.cagrBlocked).toBe(true)
  })

  it('keeps BUY for pass / watch / unknown gates', () => {
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'pass' }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: 'watch' }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std, undefined, { cagrGate: null }).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std).cagrBlocked).toBe(false)
  })

  it('never upgrades or further downgrades WATCH / PASS', () => {
    const pass = allAxes(2); pass.valuationAttractiveness = axis(3)
    expect(calculateVerdict(pass, std, undefined, { cagrGate: 'block' }).verdict).toBe('PASS')
    const veto = allAxes(5); veto.governance = axis(5, true); veto.executionRisk = axis(5, true)
    expect(calculateVerdict(veto, std, undefined, { cagrGate: 'block' }).verdict).toBe('PASS')
  })
})

describe('cagrGateFor', () => {
  it('classifies against the default minimum of 12%', () => {
    expect(cagrGateFor(11.9)).toBe('block')
    expect(cagrGateFor(12)).toBe('watch')
    expect(cagrGateFor(19.9)).toBe('watch')
    expect(cagrGateFor(20)).toBe('pass')
    expect(cagrGateFor(35)).toBe('pass')
  })

  it('returns null for an unknown CAGR (no valuation yet)', () => {
    expect(cagrGateFor(null)).toBeNull()
    expect(cagrGateFor(NaN)).toBeNull()
  })

  it('honours a custom minimum from Settings', () => {
    expect(cagrGateFor(14.9, 15)).toBe('block')
    expect(cagrGateFor(15, 15)).toBe('watch')
    expect(cagrGateFor(24.9, 25)).toBe('block')
    expect(cagrGateFor(25, 25)).toBe('pass')
    expect(cagrGateFor(11, NaN)).toBe('block') // invalid min falls back to 12
  })
})

describe('calculateValuation', () => {
  const assumptions: ValuationAssumptions = {
    currentRevenue: 100, currentFcf: 10, currentEnterpriseValue: 100,
    baseRevenueGrowth: 10, baseFcfMargin: 20, exitMultiple: 10, years: 3,
  }

  it('computes the base expected CAGR and a pass gate by default', () => {
    const v = calculateValuation(assumptions)
    expect(v.expectedCagr).toBeCloseTo(38.6, 0)
    expect(v.cagrGate).toBe('pass')
    expect(v.bear.expectedCagr).toBeLessThan(v.base.expectedCagr!)
    expect(v.bull.expectedCagr).toBeGreaterThan(v.base.expectedCagr!)
  })

  it('applies the Settings minimum to the gate', () => {
    expect(calculateValuation(assumptions, 50).cagrGate).toBe('block')
    // A ~14% CAGR is 'watch' at the default minimum but 'block' at 15%.
    const modest = { ...assumptions, baseFcfMargin: 14, exitMultiple: 8 }
    expect(calculateValuation(modest).expectedCagr).toBeCloseTo(14.2, 0)
    expect(calculateValuation(modest).cagrGate).toBe('watch')
    expect(calculateValuation(modest, 15).cagrGate).toBe('block')
  })

  it('reports unknown (not block) when inputs are insufficient', () => {
    const v = calculateValuation({ ...assumptions, currentRevenue: null })
    expect(v.expectedCagr).toBeNull()
    expect(v.cagrGate).toBe('unknown')
  })

  it('reverse-calculates the growth priced into the current EV', () => {
    // Build an EV from a known 10% growth path: implied growth must
    // recover exactly that 10%.
    const v = calculateValuation(assumptions)
    expect(v.impliedGrowthPct).not.toBeNull()
    // assumptions: R=100, margin 20%, multiple 10, years 3, EV=100
    // denominator = 100 * 0.20 * 10 = 200 → (100/200)^(1/3) − 1 ≈ −20.6%
    expect(v.impliedGrowthPct!).toBeCloseTo(-20.6, 0)
    const priced = { ...assumptions, currentEnterpriseValue: 100 * Math.pow(1.10, 3) * 0.20 * 10 }
    expect(calculateValuation(priced).impliedGrowthPct!).toBeCloseTo(10, 1)
  })

  it('implied growth is null when it cannot be computed', () => {
    expect(calculateValuation({ ...assumptions, exitMultiple: null }).impliedGrowthPct).toBeNull()
  })

  it('flags suspiciously high expected CAGR (value-trap warning)', () => {
    expect(isSuspiciouslyHighCagr(55)).toBe(true)
    expect(isSuspiciouslyHighCagr(40)).toBe(true)
    expect(isSuspiciouslyHighCagr(25)).toBe(false)
    expect(isSuspiciouslyHighCagr(null)).toBe(false)
  })

  it('uses Bear x0.65 / Base x1.0 / Bull x1.4 revenue growth adjustments', () => {
    const v = calculateValuation(assumptions)
    expect(v.bear.revenueGrowthAdj).toBe(0.65)
    expect(v.base.revenueGrowthAdj).toBe(1.0)
    expect(v.bull.revenueGrowthAdj).toBe(1.4)
  })
})

describe('data scores — severe-penalty branch order (audit fix)', () => {
  it('negative revenue growth takes the −2 penalty, not −1', () => {
    // 3 − 2 = 1 (before the fix the g<5 branch caught negatives first → 2)
    expect(scoreBusinessQuality(input({ revenueGrowthYoy: -3 }))).toBe(1)
  })
  it('mild positive growth still takes −1', () => {
    expect(scoreBusinessQuality(input({ revenueGrowthYoy: 3 }))).toBe(2)
  })
  it('gross margin below 10% takes the −2 penalty', () => {
    expect(scoreBusinessQuality(input({ grossMargin: 8 }))).toBe(1)
    expect(scoreBusinessQuality(input({ grossMargin: 15 }))).toBe(2)
  })
  it('negative ROIC takes the −2 penalty, not −1', () => {
    expect(scoreCapitalEfficiency(input({ roic: -5 }))).toBe(1)
    expect(scoreCapitalEfficiency(input({ roic: 5 }))).toBe(2)
  })
  it('strong metrics still score 5', () => {
    expect(scoreBusinessQuality(input({ revenueGrowthYoy: 30, grossMargin: 70 }))).toBe(5)
    expect(scoreCapitalEfficiency(input({ roic: 30, shareDilutionAnnual: -1 }))).toBe(5)
  })
})

describe('calculateDataCoverage', () => {
  it('empty input has zero coverage and every score is insufficient', () => {
    const cov = calculateDataCoverage(emptyInput)
    expect(cov.overall).toBe(0)
    expect(cov.usedMetrics).toBe(0)
    expect(cov.totalMetrics).toBe(8)
    expect(isScoreInsufficient(cov, 'businessQuality')).toBe(true)
  })
  it('full input has complete coverage', () => {
    const cov = calculateDataCoverage(input({
      revenueGrowthYoy: 10, grossMargin: 50, roic: 20, shareDilutionAnnual: 0,
      debtToEbitda: 1, currentRatio: 2, fcfMargin: 15, operatingMargin: 20,
    }))
    expect(cov.overall).toBe(1)
    expect(isScoreInsufficient(cov, 'cashGeneration')).toBe(false)
  })
  it('one of two metrics is exactly the sufficiency boundary', () => {
    const cov = calculateDataCoverage(input({ revenueGrowthYoy: 10 }))
    expect(cov.perScore.businessQuality).toBe(0.5)
    expect(isScoreInsufficient(cov, 'businessQuality')).toBe(false)
    expect(isScoreInsufficient(cov, 'capitalEfficiency')).toBe(true)
  })
})

describe('assessFinancialRisk', () => {
  it('clean input produces no flags', () => {
    expect(assessFinancialRisk(input({
      debtToEbitda: 1, operatingMargin: 20, fcfMargin: 15,
      shareDilutionAnnual: 0, revenueGrowthYoy: 10, revenueGrowth3y: 8,
      goodwillIntangiblesToAssets: 20,
    }))).toEqual([])
  })
  it('extreme leverage is a severe flag with a veto axis', () => {
    const flags = assessFinancialRisk(input({ debtToEbitda: 7 }))
    expect(flags).toHaveLength(1)
    expect(flags[0].severity).toBe('severe')
    expect(flags[0].vetoAxis).toBe('balanceSheetSafety')
  })
  it('acquisition dependence trips at 50% (caution) and 70% (severe)', () => {
    expect(assessFinancialRisk(input({ goodwillIntangiblesToAssets: 55 }))[0].severity).toBe('caution')
    expect(assessFinancialRisk(input({ goodwillIntangiblesToAssets: 78 }))[0].severity).toBe('severe')
  })
  it('positive operating margin with negative FCF is severe', () => {
    const flags = assessFinancialRisk(input({ operatingMargin: 12, fcfMargin: -4 }))
    expect(flags.some(f => f.id === 'earnings_quality_negative_fcf' && f.severity === 'severe')).toBe(true)
  })
  it('sustained revenue decline uses the 3y CAGR', () => {
    const flags = assessFinancialRisk(input({ revenueGrowthYoy: -2, revenueGrowth3y: -1 }))
    expect(flags.some(f => f.id === 'revenue_decline_sustained')).toBe(true)
  })
  it('missing data produces no flags (absence is a coverage issue, not a risk flag)', () => {
    expect(assessFinancialRisk(emptyInput)).toEqual([])
  })
})

describe('data scores — threshold boundary values (Phase 1, C-1)', () => {
  // Each case varies ONE metric around a threshold; all other metrics are
  // null, so the expected score is base 3 plus that metric's adjustment
  // (clamp() rounds .5 up).
  const bqGrowth: [number, number][] = [
    [-0.1, 1], [0, 2], [4.9, 2], [5, 3], [14.9, 3], [15, 4], [24.9, 4], [25, 4],
  ]
  it.each(bqGrowth)('revenue growth %s%% → BQ %s', (g, want) => {
    expect(scoreBusinessQuality(input({ revenueGrowthYoy: g }))).toBe(want)
  })

  const bqMargin: [number, number][] = [
    [9.9, 1], [10, 2], [19.9, 2], [20, 3], [39.9, 3], [40, 4], [59.9, 4], [60, 4],
  ]
  it.each(bqMargin)('gross margin %s%% → BQ %s', (gm, want) => {
    expect(scoreBusinessQuality(input({ grossMargin: gm }))).toBe(want)
  })

  const ceRoic: [number, number][] = [
    [-0.1, 1], [0, 2], [7.9, 2], [8, 3], [14.9, 3], [15, 4], [24.9, 4], [25, 5],
  ]
  it.each(ceRoic)('ROIC %s%% → CE %s', (roic, want) => {
    expect(scoreCapitalEfficiency(input({ roic }))).toBe(want)
  })

  const ceDilution: [number, number][] = [[0, 4], [2, 3], [5, 3], [5.1, 2]]
  it.each(ceDilution)('dilution %s%% → CE %s', (dil, want) => {
    expect(scoreCapitalEfficiency(input({ shareDilutionAnnual: dil }))).toBe(want)
  })

  const bssLeverage: [number, number][] = [
    [0, 5], [0.1, 4], [1, 4], [1.1, 3], [2, 3], [2.1, 2], [4, 2], [4.1, 1],
  ]
  it.each(bssLeverage)('net debt/EBITDA %sx → BSS %s', (de, want) => {
    expect(scoreBalanceSheetSafety(input({ debtToEbitda: de }))).toBe(want)
  })

  const bssCurrentRatio: [number, number][] = [[0.9, 2], [1, 3], [2, 4]]
  it.each(bssCurrentRatio)('current ratio %s → BSS %s', (cr, want) => {
    expect(scoreBalanceSheetSafety(input({ currentRatio: cr }))).toBe(want)
  })

  const cgFcf: [number, number][] = [
    [-0.1, 1], [0, 3], [9.9, 3], [10, 4], [19.9, 4], [20, 5],
  ]
  it.each(cgFcf)('FCF margin %s%% → CG %s', (fcf, want) => {
    expect(scoreCashGeneration(input({ fcfMargin: fcf }))).toBe(want)
  })

  const cgOp: [number, number][] = [[-0.1, 2], [0, 3], [25, 4]]
  it.each(cgOp)('operating margin %s%% → CG %s', (op, want) => {
    expect(scoreCashGeneration(input({ operatingMargin: op }))).toBe(want)
  })
})

describe('CAGR gate — unknown stays distinct from block end-to-end', () => {
  const base: ValuationAssumptions = {
    currentRevenue: 100, currentFcf: 10, currentEnterpriseValue: 100,
    baseRevenueGrowth: 10, baseFcfMargin: 20, exitMultiple: 10, years: 3,
  }
  it('calculable but too low is block; uncalculable is unknown — never the reverse', () => {
    const low = calculateValuation({ ...base, baseRevenueGrowth: -5, exitMultiple: 5 })
    expect(low.expectedCagr).not.toBeNull()
    expect(low.cagrGate).toBe('block')
    const missing = calculateValuation({ ...base, currentRevenue: null })
    expect(missing.expectedCagr).toBeNull()
    expect(missing.cagrGate).toBe('unknown')
  })
  it('an unknown CAGR never restricts BUY through the verdict path', () => {
    const missing = calculateValuation({ ...base, currentEnterpriseValue: null })
    // VerdictPage re-derives the gate from the CAGR, exactly like this:
    const derived = cagrGateFor(missing.expectedCagr, 12)
    expect(derived).toBeNull()
    const r = calculateVerdict(allAxes(5), std, undefined, { cagrGate: derived })
    expect(r.verdict).toBe('BUY')
    expect(r.cagrBlocked).toBe(false)
  })
})

describe('calculateDataCoverage — three-way split (present / missing / not applicable)', () => {
  const fin = NOT_APPLICABLE_METRICS['financials']!
  it('an unavailable metric is missing under generic, not applicable under financials', () => {
    const generic = calculateDataCoverage(emptyInput)
    expect(generic.statuses?.grossMargin).toBe('missing')
    const bank = calculateDataCoverage(emptyInput, fin)
    expect(bank.statuses?.grossMargin).toBe('notApplicable')
    expect(bank.naReasons?.grossMargin).toBe('financials_no_gross_margin')
    expect(bank.statuses?.revenueGrowthYoy).toBe('missing')
  })
  it('NA metrics leave the denominator: a fully-entered bank has complete coverage of what applies', () => {
    const cov = calculateDataCoverage(input({
      revenueGrowthYoy: 5, roic: 12, shareDilutionAnnual: 0.5, operatingMargin: 30,
    }), fin)
    expect(cov.totalMetrics).toBe(4)
    expect(cov.usedMetrics).toBe(4)
    expect(cov.overall).toBe(1)
  })
  it('a score with zero applicable metrics is insufficient even though nothing is "missing"', () => {
    const cov = calculateDataCoverage(input({
      revenueGrowthYoy: 5, roic: 12, shareDilutionAnnual: 0.5, operatingMargin: 30,
    }), fin)
    // Financials: balanceSheetSafety reads only debtToEbitda + currentRatio,
    // both not applicable -> no valid solvency basis in this score.
    expect(cov.perScoreApplicable?.balanceSheetSafety).toBe(0)
    expect(isScoreInsufficient(cov, 'balanceSheetSafety')).toBe(true)
    expect(isScoreInsufficient(cov, 'businessQuality')).toBe(false)
    expect(isScoreInsufficient(cov, 'capitalEfficiency')).toBe(false)
    expect(isScoreInsufficient(cov, 'cashGeneration')).toBe(false)
  })
  it('an entered value for an NA metric does not resurrect it into the denominator', () => {
    const cov = calculateDataCoverage(input({ grossMargin: 30 }), fin)
    expect(cov.statuses?.grossMargin).toBe('notApplicable')
    expect(cov.totalMetrics).toBe(4)
    expect(cov.usedMetrics).toBe(0)
  })
  it('legacy coverage objects (no perScoreApplicable) still answer isScoreInsufficient', () => {
    const legacy: DataCoverage = {
      perScore: { businessQuality: 0.5, capitalEfficiency: 0, balanceSheetSafety: 1, cashGeneration: 0.25 },
      overall: 0.44, usedMetrics: 3.5, totalMetrics: 8,
    }
    expect(isScoreInsufficient(legacy, 'businessQuality')).toBe(false)
    expect(isScoreInsufficient(legacy, 'capitalEfficiency')).toBe(true)
    expect(isScoreInsufficient(legacy, 'cashGeneration')).toBe(true)
  })
})

describe('evaluateFinancialRisk — explicit level, unevaluable is not normal', () => {
  it('no readable rule inputs -> unevaluable with no flags', () => {
    const r = evaluateFinancialRisk(emptyInput)
    expect(r.level).toBe('unevaluable')
    expect(r.flags).toEqual([])
  })
  it('a single margin alone does not make the screen evaluable (pair rule unreadable)', () => {
    expect(evaluateFinancialRisk(input({ operatingMargin: 20 })).level).toBe('unevaluable')
    expect(evaluateFinancialRisk(input({ debtToEbitda: 1 })).level).toBe('normal')
  })
  it('clean readable input -> normal; caution-only -> caution; any severe -> severe', () => {
    expect(evaluateFinancialRisk(input({
      debtToEbitda: 1, operatingMargin: 20, fcfMargin: 15,
      shareDilutionAnnual: 0, revenueGrowthYoy: 10, revenueGrowth3y: 8,
      goodwillIntangiblesToAssets: 20,
    })).level).toBe('normal')
    expect(evaluateFinancialRisk(input({ debtToEbitda: 4.5 })).level).toBe('caution')
    expect(evaluateFinancialRisk(input({ debtToEbitda: 4.5, goodwillIntangiblesToAssets: 80 })).level).toBe('severe')
  })
  it('severe risk flags never auto-veto: the verdict engine has no flag input', () => {
    const risky = evaluateFinancialRisk(input({ debtToEbitda: 9, goodwillIntangiblesToAssets: 85 }))
    expect(risky.level).toBe('severe')
    // calculateVerdict takes axes + gate only; identical axes give an
    // identical verdict regardless of the risk screen's state.
    expect(calculateVerdict(allAxes(5), std).verdict).toBe('BUY')
    expect(calculateVerdict(allAxes(5), std).vetoCount).toBe(0)
  })
})

describe('sufficientDataScores — insufficient scores never flow downstream as neutral', () => {
  const fin = NOT_APPLICABLE_METRICS['financials']!
  it('full coverage passes every score through', () => {
    const inp = input({
      revenueGrowthYoy: 10, grossMargin: 50, roic: 20, shareDilutionAnnual: 0,
      debtToEbitda: 1, currentRatio: 2, fcfMargin: 15, operatingMargin: 20,
    })
    const ok = sufficientDataScores(calculateDataScores(inp), calculateDataCoverage(inp))
    expect(Object.keys(ok)).toHaveLength(4)
  })
  it('financials: balanceSheetSafety (zero applicable metrics) is omitted, others kept', () => {
    const inp = input({ revenueGrowthYoy: 5, roic: 12, shareDilutionAnnual: 0.5, operatingMargin: 30 })
    const ok = sufficientDataScores(calculateDataScores(inp), calculateDataCoverage(inp, fin))
    expect(ok.balanceSheetSafety).toBeUndefined()
    expect(ok.businessQuality).toBeDefined()
    expect(ok.capitalEfficiency).toBeDefined()
    expect(ok.cashGeneration).toBeDefined()
  })
  it('empty input omits everything instead of suggesting four neutral 3s', () => {
    const ok = sufficientDataScores(calculateDataScores(emptyInput), calculateDataCoverage(emptyInput))
    expect(ok).toEqual({})
  })
})

describe('buildDataSummary — insufficient scores are annotated, never silent', () => {
  it('annotates only the insufficient lines when coverage is supplied', () => {
    const inp = input({ revenueGrowthYoy: 5, roic: 12, shareDilutionAnnual: 0.5, operatingMargin: 30 })
    const fin = NOT_APPLICABLE_METRICS['financials']!
    const summary = buildDataSummary(calculateDataScores(inp), inp, calculateDataCoverage(inp, fin))
    expect(summary).toContain('Balance Sheet Safety: 3/5 (insufficient — 判定不能)')
    expect(summary).not.toContain('Business Quality: 3/5 (insufficient')
  })
  it('without coverage the legacy format is unchanged', () => {
    const summary = buildDataSummary(calculateDataScores(emptyInput), emptyInput)
    expect(summary).toContain('Balance Sheet Safety: 3/5')
    expect(summary).not.toContain('insufficient')
  })
})

describe('assessFinancialRisk — persistent negative FCF (review fix)', () => {
  const period = (fcfMargin: number | null) => ({
    input: input({ fcfMargin }), fiscalYear: 'FY2024',
  })
  it('fires for an ongoing cash burn, even with a negative operating margin', () => {
    const inp = input({ fcfMargin: -3, operatingMargin: -2 })
    const flags = assessFinancialRisk(inp, [period(-3), period(-8), period(-5)])
    expect(flags.some(f => f.id === 'fcf_negative_history')).toBe(true)
  })
  it('still fires when the latest period has recovered', () => {
    const inp = input({ fcfMargin: 4, operatingMargin: 10 })
    const flags = assessFinancialRisk(inp, [period(4), period(-6), period(-2)])
    expect(flags.some(f => f.id === 'fcf_negative_history')).toBe(true)
  })
  it('a single negative year does not fire, and nulls do not count', () => {
    const inp = input({ fcfMargin: -3, operatingMargin: 5 })
    expect(assessFinancialRisk(inp, [period(-3), period(null), period(6)]).some(f => f.id === 'fcf_negative_history')).toBe(false)
    expect(assessFinancialRisk(inp, [period(-3)]).some(f => f.id === 'fcf_negative_history')).toBe(false)
    expect(assessFinancialRisk(inp).some(f => f.id === 'fcf_negative_history')).toBe(false)
  })
})
