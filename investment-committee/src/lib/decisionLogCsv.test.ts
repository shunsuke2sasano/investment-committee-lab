import { describe, it, expect } from 'vitest'
import { decisionLogsToCsv } from './decisionLogCsv'
import { emptyBenchmarkSnapshot, emptyPriceSnapshot } from './decisionLog'
import type { DecisionLogEvaluation, DecisionLogRecord } from '../types/domain'

const NOW = '2026-06-01T12:00:00.000Z'

const log: DecisionLogRecord = {
  id: 'l1', seq: 0, schemaVersion: 1, companyId: 'c1', ticker: 'TEST', companyName: 'Test, Inc',
  decidedAt: '2026-06-01T10:00:00.000Z', createdAt: NOW, entrySource: 'verdict_save',
  retrospective: false, appVersion: '0.0.0', buildCommit: 'abc', versionUnknown: false,
  decisionSessionId: null, candidateSource: null, aiReviewUsed: false, engineVersionOrNone: null,
  priceAtDecision: { ...emptyPriceSnapshot(NOW), price: 100, priceDate: '2026-05-29', source: 'manual' },
  benchmarkPrice: { ...emptyBenchmarkSnapshot(NOW), price: 500, priceDate: '2026-05-29', source: 'manual' },
  extraBenchmarks: [], comparisonStatus: 'evaluable', comparisonExclusions: [],
  verdictReportId: 'v1', verdictResult: 'BUY', humanFinalDecision: 'buy', previousLogId: null,
  axisScores: null, totalScore: 30, vetoCount: 0, profileUsed: null, rationale: 'r',
  dataAnalysisId: 'd1', scores: null, coverage: null, riskLevel: 'normal', riskFlags: null,
  dataInputSnapshot: null, periodsSnapshot: null,
  valuationReportId: 'val1', valuationAssumptions: null, expectedCagr: 15, cagrGate: 'watch',
  impliedGrowthPct: null, cagrGateMinUsed: 12,
  thesisSnapshot: null, reviewReportId: null, reviewModel: null, reviewSummary: null,
  sourceRefs: {
    dataAnalysis: { id: 'd1', sourceAt: '2026-05-01T00:00:00.000Z', asOfStatus: 'verified' },
    valuation: { id: 'val1', sourceAt: '2026-05-02T00:00:00.000Z', asOfStatus: 'verified' },
    thesis: { id: null, sourceAt: null, asOfStatus: 'absent' },
    review: { id: null, sourceAt: null, asOfStatus: 'absent' },
  },
  engineRank: null, engineScore: null, linkedPositionId: null,
  contentHash: 'hash1', prevLogHash: null,
}

const evaluation: DecisionLogEvaluation = {
  id: 'e1', logId: 'l1', horizonMonths: 12, evaluatedAt: '2027-06-01T00:00:00.000Z',
  priceNow: { ...emptyPriceSnapshot(NOW), price: 120 },
  benchmarkPriceNow: null,
  stockReturnPct: 20, benchmarkReturnPct: 10, excessReturnPct: 10,
  note: null, contentHash: 'ehash',
}

describe('decisionLogsToCsv', () => {
  it('emits a header and one row per log, quoting commas', () => {
    const csv = decisionLogsToCsv([log], [])
    const lines = csv.trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('decidedAt,ticker,companyName')
    expect(lines[1]).toContain('"Test, Inc"')
    expect(lines[1]).toContain('hash1')
  })
  it('spreads standard-horizon evaluations into columns', () => {
    const csv = decisionLogsToCsv([{ ...log, companyName: 'Test Inc' }], [evaluation])
    const row = csv.trim().split('\n')[1]
    const cells = row.split(',')
    // 17 base columns, then 12m stock/benchmark/excess at positions 17..19
    expect(cells[17]).toBe('20')
    expect(cells[18]).toBe('10')
    expect(cells[19]).toBe('10')
    // 36m/60m columns are empty
    expect(cells[20]).toBe('')
  })
  it('leaves evaluation columns empty when no evaluation exists', () => {
    const csv = decisionLogsToCsv([log], [])
    const row = csv.trim().split('\n')[1]
    expect(row.endsWith(',,,,,,,,,')).toBe(true)
  })
})
