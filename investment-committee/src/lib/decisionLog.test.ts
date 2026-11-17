import { describe, it, expect, vi } from 'vitest'
import {
  buildDecisionLogDraft, computeEvaluationReturns, emptyBenchmarkSnapshot,
  emptyPriceSnapshot, fromDateTimeLocalValue, isRetrospective, localDateString,
  pickSectionAsOf, resolveCagrGateMinUsed, toDateTimeLocalValue,
  validateEvaluationHorizon,
} from './decisionLog'
import type {
  CompanyCase, DataAnalysis, ThesisAnalysis, ValuationReport, VerdictReport,
} from '../types/domain'

const company: CompanyCase = {
  id: 'c1', ticker: 'TEST', companyName: 'Test Corp', sector: null,
  currentPrice: 100, marketCap: null, enterpriseValue: null,
  investmentHorizonMonths: 36, status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

function dataAnalysis(id: string, computedAt: string): DataAnalysis {
  return {
    id, companyId: 'c1',
    input: {
      revenueGrowthYoy: 10, revenueGrowth3y: 8, grossMargin: 40, operatingMargin: 20,
      fcfMargin: 15, roic: 18, debtToEbitda: 1, netDebtToEquity: 0.2,
      shareDilutionAnnual: 0, reinvestmentRate: 30, currentRatio: 2,
    },
    scores: { businessQuality: 4, capitalEfficiency: 4, balanceSheetSafety: 5, cashGeneration: 4 },
    summary: '', computedAt, riskLevel: 'normal', riskFlags: [],
  }
}

function valuation(id: string, createdAt: string): ValuationReport {
  return {
    id, companyId: 'c1',
    assumptions: {
      currentRevenue: 1000, currentFcf: 150, currentEnterpriseValue: 5000,
      baseRevenueGrowth: 8, baseFcfMargin: 15, exitMultiple: 18, years: 5,
    },
    scenarios: {
      bear: { revenueGrowthAdj: 0.65, fcfMarginAdj: 1, exitMultipleAdj: 1, impliedEnterpriseValue: null, expectedCagr: 2, notes: [] },
      base: { revenueGrowthAdj: 1, fcfMarginAdj: 1, exitMultipleAdj: 1, impliedEnterpriseValue: null, expectedCagr: 15, notes: [] },
      bull: { revenueGrowthAdj: 1.4, fcfMarginAdj: 1, exitMultipleAdj: 1, impliedEnterpriseValue: null, expectedCagr: 25, notes: [] },
    },
    expectedCagr: 15, cagrGate: 'watch', downsideRiskScore: 13, createdAt,
  }
}

function thesis(id: string, createdAt: string): ThesisAnalysis {
  return {
    id, companyId: 'c1', thesisText: 'thesis', drivers: [], collapseConditions: [],
    monitoringMetrics: [], confidenceNote: null, version: 1, createdAt, updatedAt: createdAt,
  }
}

const verdict: VerdictReport = {
  id: 'v1', companyId: 'c1',
  axisScores: {} as VerdictReport['axisScores'],
  totalScore: 30, vetoCount: 0, verdict: 'BUY', rationale: 'because',
  profileUsed: { id: 'standard', label: 'Standard', buyThreshold: 30, watchThreshold: 22, maxVetoForBuy: 1 },
  createdAt: '2026-06-01T10:00:00.000Z',
}

const NOW = '2026-06-01T12:00:00.000Z'

function draftBase(overrides: Partial<Parameters<typeof buildDecisionLogDraft>[0]> = {}) {
  return buildDecisionLogDraft({
    company,
    entrySource: 'verdict_save',
    decidedAt: verdict.createdAt,
    createdAt: NOW,
    referenceTime: verdict.createdAt,
    verdict,
    dataAnalyses: [dataAnalysis('d1', '2026-05-01T00:00:00.000Z')],
    valuations: [valuation('val1', '2026-05-02T00:00:00.000Z')],
    theses: [thesis('t1', '2026-05-03T00:00:00.000Z')],
    reviews: [],
    cagrGateMin: 12,
    appVersion: '0.0.0',
    buildCommit: 'abc123',
    priceAtDecision: { ...emptyPriceSnapshot(NOW), price: 100, priceDate: '2026-05-29', source: 'manual' },
    benchmarkPrice: { ...emptyBenchmarkSnapshot(NOW), price: 500, priceDate: '2026-05-29', source: 'manual' },
    extraBenchmarks: [],
    humanFinalDecision: 'buy',
    rationale: 'because',
    ...overrides,
  })
}

describe('pickSectionAsOf', () => {
  const recs = [
    { id: 'a', at: '2026-01-01T00:00:00.000Z' },
    { id: 'b', at: '2026-03-01T00:00:00.000Z' },
    { id: 'c', at: '2026-09-01T00:00:00.000Z' },
  ]
  const timeOf = (r: { at: string }) => r.at
  it('picks the latest record at or before the reference time', () => {
    const pick = pickSectionAsOf(recs, '2026-06-01T00:00:00.000Z', timeOf)
    expect(pick.verified?.id).toBe('b')
    expect(pick.ref.asOfStatus).toBe('verified')
  })
  it('is unverified (reference only) when all sources postdate the decision', () => {
    const pick = pickSectionAsOf(recs, '2025-12-01T00:00:00.000Z', timeOf)
    expect(pick.verified).toBeNull()
    expect(pick.ref.asOfStatus).toBe('unverified')
    expect(pick.ref.id).toBe('a')
  })
  it('is absent when there are no sources', () => {
    const pick = pickSectionAsOf([], '2026-06-01T00:00:00.000Z', timeOf)
    expect(pick.ref.asOfStatus).toBe('absent')
  })
})

describe('buildDecisionLogDraft', () => {
  it('freezes verified sections and fills the snapshot', () => {
    const d = draftBase()
    expect(d.scores?.businessQuality).toBe(4)
    expect(d.expectedCagr).toBe(15)
    expect(d.cagrGate).toBe('watch')
    expect(d.cagrGateMinUsed).toBe(12)
    expect(d.thesisSnapshot?.thesisText).toBe('thesis')
    expect(d.sourceRefs.dataAnalysis.asOfStatus).toBe('verified')
    expect(d.sourceRefs.review.asOfStatus).toBe('absent')
    expect(d.comparisonStatus).toBe('evaluable')
    expect(d.comparisonExclusions).toEqual([])
  })

  it('does not attach content from analyses updated after the verdict (P0-1)', () => {
    const d = draftBase({
      dataAnalyses: [
        dataAnalysis('d-old', '2026-05-01T00:00:00.000Z'),
        { ...dataAnalysis('d-new', '2026-07-01T00:00:00.000Z'), scores: { businessQuality: 1, capitalEfficiency: 1, balanceSheetSafety: 1, cashGeneration: 1 } },
      ],
    })
    expect(d.dataAnalysisId).toBe('d-old')
    expect(d.scores?.businessQuality).toBe(4)
  })

  it('marks a section unverified and attaches no content when only later sources exist', () => {
    const d = draftBase({ valuations: [valuation('val-late', '2026-08-01T00:00:00.000Z')] })
    expect(d.sourceRefs.valuation.asOfStatus).toBe('unverified')
    expect(d.valuationReportId).toBe('val-late')
    expect(d.expectedCagr).toBeNull()
    expect(d.cagrGate).toBeNull()
  })

  it('treats a thesis edited after the verdict as unverified (mandatory fix B)', () => {
    const edited = {
      ...thesis('t1', '2026-05-03T00:00:00.000Z'),
      thesisText: 'rewritten after the decision',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const d = draftBase({ theses: [edited] })
    expect(d.sourceRefs.thesis.asOfStatus).toBe('unverified')
    expect(d.thesisSnapshot).toBeNull()
  })

  it('stores the pre-resolved cagrGateMin as given (resolution happens upstream)', () => {
    expect(draftBase().cagrGateMinUsed).toBe(12)
    expect(draftBase({ cagrGateMin: null }).cagrGateMinUsed).toBeNull()
  })

  it('backdated manual entries cannot attach newer financials (P0-1)', () => {
    const d = draftBase({
      entrySource: 'manual', verdict: null,
      decidedAt: '2025-01-15T00:00:00.000Z', referenceTime: '2025-01-15T00:00:00.000Z',
      humanFinalDecision: 'pass',
    })
    expect(d.retrospective).toBe(true)
    expect(d.sourceRefs.dataAnalysis.asOfStatus).toBe('unverified')
    expect(d.scores).toBeNull()
    expect(d.comparisonExclusions).toContain('retrospective')
  })

  it('flags missing price fields and unknown version as exclusions (P0-3/P0-5)', () => {
    const d = draftBase({
      buildCommit: null,
      priceAtDecision: { ...emptyPriceSnapshot(NOW), price: null, priceDate: null, source: null },
    })
    expect(d.versionUnknown).toBe(true)
    expect(d.comparisonStatus).toBe('not_evaluable')
    expect(d.comparisonExclusions).toEqual(
      expect.arrayContaining(['missing_price', 'missing_price_date', 'missing_price_source', 'version_unknown']),
    )
  })

  it('unknown build version limits model comparison only, not price returns (BLOCKER 4)', () => {
    const d = draftBase({ buildCommit: null })
    expect(d.modelComparisonEligible).toBe(false)
    expect(d.comparisonStatus).toBe('evaluable')
    expect(d.benchmarkComparisonStatus).toBe('evaluable')
    expect(d.comparisonExclusions).toContain('version_unknown')
  })

  it('a price dated after the decision cannot pose as a decision-time price (BLOCKER 2)', () => {
    const d = draftBase({
      priceAtDecision: {
        price: 100, priceDate: '2026-06-03', recordedAt: NOW, currency: 'USD',
        priceType: 'raw', adjustmentBasis: null, source: 'manual',
      },
    })
    expect(d.comparisonStatus).toBe('not_evaluable')
    expect(d.comparisonExclusions).toContain('price_after_decision')
  })

  it('missing SPY decision price blocks only the benchmark comparison (BLOCKER 3)', () => {
    const d = draftBase({
      benchmarkPrice: {
        ...emptyBenchmarkSnapshot(NOW), price: null, priceDate: null, source: null,
      },
    })
    expect(d.comparisonStatus).toBe('evaluable')
    expect(d.benchmarkComparisonStatus).toBe('not_evaluable')
    expect(d.comparisonExclusions).toEqual(expect.arrayContaining([
      'missing_benchmark_price', 'missing_benchmark_price_date', 'missing_benchmark_price_source',
    ]))
  })
})

describe('local time conversion (BLOCKER 2)', () => {
  it('round-trips display → edit → save without moving the moment', () => {
    for (const iso of ['2026-06-01T12:00:00.000Z', '2026-01-15T03:45:00.000Z', '2026-12-31T23:59:00.000Z']) {
      expect(fromDateTimeLocalValue(toDateTimeLocalValue(iso))).toBe(iso)
    }
  })

  it('shows the JST local time across the UTC date boundary', () => {
    vi.stubEnv('TZ', 'Asia/Tokyo')
    try {
      // 2026-06-01 15:30 UTC is 2026-06-02 00:30 in Tokyo.
      expect(toDateTimeLocalValue('2026-06-01T15:30:00.000Z')).toBe('2026-06-02T00:30')
      expect(localDateString(new Date('2026-06-01T15:30:00.000Z'))).toBe('2026-06-02')
      expect(fromDateTimeLocalValue('2026-06-02T00:30')).toBe('2026-06-01T15:30:00.000Z')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('validateEvaluationHorizon (BLOCKER 3)', () => {
  const decided = '2026-06-01T12:00:00.000Z'
  it('rejects a horizon that has not elapsed', () => {
    expect(validateEvaluationHorizon(decided, '2026-06-01', 60).ok).toBe(false)
    expect(validateEvaluationHorizon(decided, '2027-05-31', 12).ok).toBe(false)
  })
  it('accepts the horizon inside the pre-registered [h, h+2) month window', () => {
    expect(validateEvaluationHorizon(decided, '2027-06-01', 12)).toEqual({ ok: true, elapsedMonths: 12 })
    expect(validateEvaluationHorizon(decided, '2027-07-15', 12).ok).toBe(true)
  })
  it('rejects a date that belongs to a longer horizon', () => {
    expect(validateEvaluationHorizon(decided, '2027-08-01', 12).ok).toBe(false)
  })
})

describe('isRetrospective', () => {
  it('compares by date when the moment is bound by the flow', () => {
    expect(isRetrospective('2026-01-01T09:00:00.000Z', '2026-01-01T23:00:00.000Z')).toBe(false)
    expect(isRetrospective('2026-01-01T09:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBe(true)
  })
  it('flags an explicitly specified past moment even on the same day', () => {
    expect(isRetrospective('2026-01-01T09:00:00.000Z', '2026-01-01T12:00:00.000Z', true)).toBe(true)
  })
  it('does not flag sub-minute differences (no false positive for deciding now)', () => {
    expect(isRetrospective('2026-01-01T12:00:00.000Z', '2026-01-01T12:00:30.000Z', true)).toBe(false)
    expect(isRetrospective('2026-01-01T12:00:00.000Z', '2026-01-01T12:00:00.500Z', true)).toBe(false)
  })
})

describe('resolveCagrGateMinUsed (mandatory fix B, final review)', () => {
  it('verdict flow: only a value frozen at verdict-save time counts', () => {
    expect(resolveCagrGateMinUsed({
      entrySource: 'verdict_save', frozenAtSave: 12, currentValue: 12, retrospective: false,
    })).toBe(12)
    // Recorded later the same day, but nothing was frozen at save time:
    // today's setting must not be presented as the decision-time value.
    expect(resolveCagrGateMinUsed({
      entrySource: 'verdict_save', frozenAtSave: null, currentValue: 12, retrospective: false,
    })).toBeNull()
  })
  it('manual flow: current value counts only for a decision made now', () => {
    expect(resolveCagrGateMinUsed({
      entrySource: 'manual', frozenAtSave: null, currentValue: 12, retrospective: false,
    })).toBe(12)
    expect(resolveCagrGateMinUsed({
      entrySource: 'manual', frozenAtSave: null, currentValue: 12, retrospective: true,
    })).toBeNull()
  })
})

describe('computeEvaluationReturns (P0-3 gating)', () => {
  const dec = { ...emptyPriceSnapshot(NOW), price: 100, priceDate: '2026-05-29', source: 'manual' }
  const decBench = { ...emptyBenchmarkSnapshot(NOW), price: 500, priceDate: '2026-05-29', source: 'manual' }
  it('computes stock, benchmark and excess returns when conditions match', () => {
    const r = computeEvaluationReturns({
      decisionPrice: dec,
      priceNow: { ...dec, price: 120, recordedAt: '2027-06-01T00:00:00.000Z' },
      decisionBenchmark: decBench,
      benchmarkNow: { ...decBench, price: 550, recordedAt: '2027-06-01T00:00:00.000Z' },
    })
    expect(r.stockReturnPct).toBeCloseTo(20)
    expect(r.benchmarkReturnPct).toBeCloseTo(10)
    expect(r.excessReturnPct).toBeCloseTo(10)
  })
  it('returns null when the price type differs between decision and evaluation', () => {
    const r = computeEvaluationReturns({
      decisionPrice: dec,
      priceNow: { ...dec, price: 120, priceType: 'adjusted', adjustmentBasis: 'split_dividend_adjusted' },
      decisionBenchmark: decBench,
      benchmarkNow: { ...decBench, price: 550 },
    })
    expect(r.stockReturnPct).toBeNull()
    expect(r.excessReturnPct).toBeNull()
    expect(r.note).toContain('stock return not computed')
  })
  it('returns null excess when the SPY decision price is missing (BLOCKER 3)', () => {
    const r = computeEvaluationReturns({
      decisionPrice: dec,
      priceNow: { ...dec, price: 120 },
      decisionBenchmark: { ...decBench, price: null },
      benchmarkNow: { ...decBench, price: 550 },
    })
    expect(r.stockReturnPct).toBeCloseTo(20)
    expect(r.benchmarkReturnPct).toBeNull()
    expect(r.excessReturnPct).toBeNull()
  })
  it('returns null excess when stock and SPY adjustment conditions differ (BLOCKER 3)', () => {
    const adj = { priceType: 'adjusted' as const, adjustmentBasis: 'split_dividend_adjusted' }
    const r = computeEvaluationReturns({
      decisionPrice: { ...dec, ...adj },
      priceNow: { ...dec, price: 120, ...adj },
      decisionBenchmark: decBench,
      benchmarkNow: { ...decBench, price: 550 },
    })
    expect(r.stockReturnPct).toBeCloseTo(20)
    expect(r.benchmarkReturnPct).toBeCloseTo(10)
    // Each leg is internally consistent, but an adjusted stock return and
    // a raw SPY return are not the same quantity — no excess is shown.
    expect(r.excessReturnPct).toBeNull()
  })
  it('returns null excess when currencies differ between stock and benchmark', () => {
    const r = computeEvaluationReturns({
      decisionPrice: dec,
      priceNow: { ...dec, price: 120 },
      decisionBenchmark: { ...decBench, currency: 'JPY' },
      benchmarkNow: { ...decBench, currency: 'JPY', price: 550 },
    })
    expect(r.stockReturnPct).toBeCloseTo(20)
    expect(r.excessReturnPct).toBeNull()
  })
  it('returns null when a price is missing', () => {
    const r = computeEvaluationReturns({
      decisionPrice: dec,
      priceNow: { ...dec, price: null },
      decisionBenchmark: decBench,
      benchmarkNow: null,
    })
    expect(r.stockReturnPct).toBeNull()
    expect(r.benchmarkReturnPct).toBeNull()
    expect(r.excessReturnPct).toBeNull()
  })
})
