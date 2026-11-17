import { describe, it, expect } from 'vitest'
import {
  buildDecisionLogDraft, computeEvaluationReturns, emptyBenchmarkSnapshot,
  emptyPriceSnapshot, isRetrospective, pickSectionAsOf,
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
})

describe('isRetrospective', () => {
  it('compares by date', () => {
    expect(isRetrospective('2026-01-01T09:00:00.000Z', '2026-01-01T23:00:00.000Z')).toBe(false)
    expect(isRetrospective('2026-01-01T09:00:00.000Z', '2026-01-02T00:00:00.000Z')).toBe(true)
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
