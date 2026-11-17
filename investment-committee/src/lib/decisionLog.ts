// ── Forward decision log: pure assembly logic ────────────────────────────
// Everything in this file is a pure function so the point-in-time rules can
// be unit-tested without a database. The repository layer only persists
// what these functions produce.
//
// Point-in-time rule (Issue #6, P0-1): source sections are selected as the
// latest record at or before the decision's reference time — never simply
// "the latest". A section whose only sources postdate the decision is
// 'unverified' and contributes a reference only, never content.

import type {
  CompanyCase, DataAnalysis, DecisionKind, DecisionLogRecord, PriceSnapshot,
  BenchmarkPriceSnapshot, ReviewReport, SourceRef, ThesisAnalysis,
  ValuationReport, VerdictReport, ComparisonExclusion, DecisionEntrySource,
  CandidateSource,
} from '../types/domain'

export type DecisionLogDraft = Omit<DecisionLogRecord, 'id' | 'seq' | 'contentHash' | 'prevLogHash'>

export function emptyPriceSnapshot(recordedAt: string): PriceSnapshot {
  return {
    price: null, priceDate: null, recordedAt,
    currency: 'USD', priceType: 'raw', adjustmentBasis: null, source: null,
  }
}

export function emptyBenchmarkSnapshot(recordedAt: string): BenchmarkPriceSnapshot {
  // Primary benchmark is SPY, named explicitly (Issue #6, P0-3).
  return { ...emptyPriceSnapshot(recordedAt), label: 'S&P 500 (SPY)', ticker: 'SPY' }
}

/** A decision entered for a past date is retrospective. Compared by ISO
 * date so a same-day evening entry is not flagged. */
export function isRetrospective(decidedAt: string, createdAt: string): boolean {
  return decidedAt.slice(0, 10) < createdAt.slice(0, 10)
}

interface SectionPick<T> {
  verified: T | null
  ref: SourceRef
}

/** Pick the latest source at or before `asOf`. If sources exist but all
 * postdate `asOf`, the section is unverified: reference the earliest such
 * source (proof it exists) but attach no content. */
export function pickSectionAsOf<T extends { id: string }>(
  records: readonly T[],
  asOf: string,
  timeOf: (r: T) => string,
): SectionPick<T> {
  const sorted = [...records].sort((a, b) => timeOf(a).localeCompare(timeOf(b)))
  const eligible = sorted.filter(r => timeOf(r) <= asOf)
  if (eligible.length > 0) {
    const chosen = eligible[eligible.length - 1]
    return { verified: chosen, ref: { id: chosen.id, sourceAt: timeOf(chosen), asOfStatus: 'verified' } }
  }
  if (sorted.length > 0) {
    const earliest = sorted[0]
    return { verified: null, ref: { id: earliest.id, sourceAt: timeOf(earliest), asOfStatus: 'unverified' } }
  }
  return { verified: null, ref: { id: null, sourceAt: null, asOfStatus: 'absent' } }
}

export function deriveComparisonExclusions(args: {
  price: PriceSnapshot
  retrospective: boolean
  versionUnknown: boolean
}): ComparisonExclusion[] {
  const out: ComparisonExclusion[] = []
  if (args.price.price == null) out.push('missing_price')
  if (!args.price.priceDate) out.push('missing_price_date')
  if (!args.price.source) out.push('missing_price_source')
  if (args.versionUnknown) out.push('version_unknown')
  if (args.retrospective) out.push('retrospective')
  return out
}

export interface BuildDraftInput {
  company: CompanyCase
  entrySource: DecisionEntrySource
  decidedAt: string
  createdAt: string
  /** The moment the decision crystallised: the verdict's createdAt for the
   * verdict flow, decidedAt for manual entries. Sources must predate it. */
  referenceTime: string
  verdict: VerdictReport | null
  dataAnalyses: readonly DataAnalysis[]
  valuations: readonly ValuationReport[]
  theses: readonly ThesisAnalysis[]
  reviews: readonly ReviewReport[]
  cagrGateMin: number | null
  appVersion: string
  buildCommit: string | null
  priceAtDecision: PriceSnapshot
  benchmarkPrice: BenchmarkPriceSnapshot
  extraBenchmarks: BenchmarkPriceSnapshot[]
  humanFinalDecision: DecisionKind | null
  rationale: string
  decisionSessionId?: string | null
  candidateSource?: CandidateSource | null
}

export function buildDecisionLogDraft(input: BuildDraftInput): DecisionLogDraft {
  const asOf = input.referenceTime
  const dataPick = pickSectionAsOf(input.dataAnalyses, asOf, r => r.computedAt)
  const valPick = pickSectionAsOf(input.valuations, asOf, r => r.createdAt)
  const thesisPick = pickSectionAsOf(input.theses, asOf, r => r.createdAt)
  const reviewPick = pickSectionAsOf(input.reviews, asOf, r => r.createdAt)

  const data = dataPick.verified
  const val = valPick.verified
  const thesis = thesisPick.verified
  const review = reviewPick.verified

  const retrospective = isRetrospective(input.decidedAt, input.createdAt)
  const versionUnknown = input.buildCommit == null
  const exclusions = deriveComparisonExclusions({
    price: input.priceAtDecision, retrospective, versionUnknown,
  })

  const verdict = input.verdict
  return {
    schemaVersion: 1,
    companyId: input.company.id,
    ticker: input.company.ticker,
    companyName: input.company.companyName,
    decidedAt: input.decidedAt,
    createdAt: input.createdAt,
    entrySource: input.entrySource,
    retrospective,

    appVersion: input.appVersion,
    buildCommit: input.buildCommit,
    versionUnknown,

    decisionSessionId: input.decisionSessionId ?? null,
    candidateSource: input.candidateSource ?? (input.entrySource === 'manual' ? 'ad_hoc' : null),
    aiReviewUsed: review != null,
    engineVersionOrNone: null,

    priceAtDecision: input.priceAtDecision,
    benchmarkPrice: input.benchmarkPrice,
    extraBenchmarks: input.extraBenchmarks,
    comparisonStatus: exclusions.length === 0 ? 'evaluable' : 'not_evaluable',
    comparisonExclusions: exclusions,

    verdictReportId: verdict?.id ?? null,
    verdictResult: verdict?.verdict ?? null,
    humanFinalDecision: input.humanFinalDecision,
    previousLogId: null,
    axisScores: verdict?.axisScores ?? null,
    totalScore: verdict?.totalScore ?? null,
    vetoCount: verdict?.vetoCount ?? null,
    profileUsed: verdict?.profileUsed ?? null,
    rationale: input.rationale,

    dataAnalysisId: dataPick.ref.id,
    scores: data?.scores ?? null,
    coverage: data?.coverage ?? null,
    riskLevel: data?.riskLevel ?? null,
    riskFlags: data?.riskFlags ?? null,
    dataInputSnapshot: data?.input ?? null,
    periodsSnapshot: data?.periods ?? null,

    valuationReportId: valPick.ref.id,
    valuationAssumptions: val?.assumptions ?? null,
    expectedCagr: val?.expectedCagr ?? null,
    cagrGate: val?.cagrGate ?? null,
    impliedGrowthPct: val?.impliedGrowthPct ?? null,
    cagrGateMinUsed: input.cagrGateMin,

    thesisSnapshot: thesis
      ? { thesisText: thesis.thesisText, collapseConditions: thesis.collapseConditions }
      : null,
    reviewReportId: reviewPick.ref.id,
    reviewModel: review ? `${review.provider}/${review.model}` : null,
    reviewSummary: review ? { risks: review.risks, mismatches: review.mismatches } : null,

    sourceRefs: {
      dataAnalysis: dataPick.ref,
      valuation: valPick.ref,
      thesis: thesisPick.ref,
      review: reviewPick.ref,
    },

    engineRank: null,
    engineScore: null,
    linkedPositionId: null,
  }
}

// ── Evaluation returns (Issue #6, P0-3) ─────────────────────────────────
// Returns are computed only when the price conditions match between
// decision time and evaluation time. A difference between prices recorded
// under different conditions is never presented as an excess return.

export interface EvaluationReturns {
  stockReturnPct: number | null
  benchmarkReturnPct: number | null
  excessReturnPct: number | null
  note: string | null
}

function conditionsMatch(a: PriceSnapshot, b: PriceSnapshot): boolean {
  return a.currency === b.currency
    && a.priceType === b.priceType
    && a.adjustmentBasis === b.adjustmentBasis
}

function pct(from: PriceSnapshot, to: PriceSnapshot): number | null {
  if (from.price == null || to.price == null || from.price === 0) return null
  if (!conditionsMatch(from, to)) return null
  return (to.price / from.price - 1) * 100
}

export function computeEvaluationReturns(args: {
  decisionPrice: PriceSnapshot
  priceNow: PriceSnapshot
  decisionBenchmark: BenchmarkPriceSnapshot
  benchmarkNow: BenchmarkPriceSnapshot | null
}): EvaluationReturns {
  const stockReturnPct = pct(args.decisionPrice, args.priceNow)
  const benchmarkReturnPct = args.benchmarkNow
    ? pct(args.decisionBenchmark, args.benchmarkNow)
    : null
  let excessReturnPct: number | null = null
  let note: string | null = null
  if (stockReturnPct != null && benchmarkReturnPct != null) {
    if (args.decisionPrice.currency === args.decisionBenchmark.currency) {
      excessReturnPct = stockReturnPct - benchmarkReturnPct
    } else {
      note = 'excess return not computed: stock and benchmark currencies differ'
    }
  } else if (stockReturnPct == null) {
    note = 'stock return not computed: missing price or price conditions (type/adjustment/currency) differ from decision time'
  } else {
    note = 'benchmark return not computed: missing price or price conditions differ from decision time'
  }
  return { stockReturnPct, benchmarkReturnPct, excessReturnPct, note }
}
