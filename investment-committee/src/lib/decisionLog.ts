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

export type DecisionLogDraft = Omit<DecisionLogRecord, 'id' | 'contentHash'>

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

/** Whether a record is retrospective (a past decision written down later).
 * Two regimes (Issue #6, final review):
 * - The user explicitly specified the decision moment (`explicit`): any
 *   moment more than a minute before creation counts, even on the same
 *   day — deliberately backdating within the day is still backdating.
 *   A sub-minute difference is UI/clock jitter, not a past decision.
 * - The moment is bound by the flow (a verdict's own timestamp, or "now"
 *   by default): compared by ISO date, so a same-day entry is a forward
 *   record and only an earlier day is retrospective. */
export function isRetrospective(decidedAt: string, createdAt: string, explicit = false): boolean {
  if (explicit) {
    return new Date(decidedAt).getTime() < new Date(createdAt).getTime() - 60_000
  }
  return decidedAt.slice(0, 10) < createdAt.slice(0, 10)
}

/** The CAGR-gate minimum that may be frozen into a log as the value in
 * force at decision time (Issue #6, mandatory fix B + final review).
 * Settings cannot be reconstructed for a past moment, so:
 * - verdict flow: only a value captured at the moment the verdict was
 *   saved (`frozenAtSave`) counts. Being recorded on the same day is NOT
 *   sufficient — settings can change within a day. No frozen value → null.
 * - manual flow: the decision is made in the panel itself, so the current
 *   value is the decision-time value — unless the entry is retrospective,
 *   in which case it is unknown → null. */
export function resolveCagrGateMinUsed(args: {
  entrySource: DecisionEntrySource
  frozenAtSave: number | null
  currentValue: number | null
  retrospective: boolean
}): number | null {
  if (args.entrySource === 'verdict_save') return args.frozenAtSave
  return args.retrospective ? null : args.currentValue
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

// ─── Local-time helpers ──────────────────────────────────────────────
// Decision moments are stored as UTC ISO strings, but users think and
// type in local time. Converting through the UTC string's date/time
// components (e.g. iso.slice(0, 16) into a datetime-local input) shifts
// the displayed moment by the timezone offset and corrupts edits, so
// every display/edit path goes through these helpers (PR #7 review).

/** 'YYYY-MM-DD' in the runtime's local timezone for a Date. */
export function localDateString(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Value for an <input type="datetime-local"> showing a UTC ISO instant
 * in local time: 'YYYY-MM-DDTHH:mm'. */
export function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${localDateString(d)}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Inverse of toDateTimeLocalValue: a datetime-local value is parsed as
 * local time and converted back to a UTC ISO string. Round-tripping
 * display → edit → save never moves the recorded moment. */
export function fromDateTimeLocalValue(v: string): string {
  return new Date(v).toISOString()
}

export interface ComparisonAssessment {
  exclusions: ComparisonExclusion[]
  /** The stock's own price return can be measured later. */
  comparisonStatus: 'evaluable' | 'not_evaluable'
  /** The excess return vs the primary benchmark (SPY) can be measured:
   * needs everything comparisonStatus needs, plus the benchmark's own
   * decision-time price, date and source. */
  benchmarkComparisonStatus: 'evaluable' | 'not_evaluable'
  /** Cross-model/version comparison needs a known build commit. This is
   * deliberately separate from the price statuses: an unknown build does
   * not invalidate a price return (PR #7 review, BLOCKER 4). */
  modelComparisonEligible: boolean
}

export function deriveComparisonExclusions(args: {
  price: PriceSnapshot
  benchmark: BenchmarkPriceSnapshot
  /** Local calendar date of the decision moment ('YYYY-MM-DD'). A price
   * whose market date is later than this cannot be a decision-time
   * observation, however it was obtained. */
  decidedDateLocal: string
  retrospective: boolean
  versionUnknown: boolean
}): ComparisonAssessment {
  const out: ComparisonExclusion[] = []
  const stockBlocking: ComparisonExclusion[] = []
  const benchBlocking: ComparisonExclusion[] = []
  const stock: [boolean, ComparisonExclusion][] = [
    [args.price.price == null, 'missing_price'],
    [!args.price.priceDate, 'missing_price_date'],
    [!args.price.source, 'missing_price_source'],
    [args.price.priceDate != null && args.price.priceDate > args.decidedDateLocal, 'price_after_decision'],
  ]
  const bench: [boolean, ComparisonExclusion][] = [
    [args.benchmark.price == null, 'missing_benchmark_price'],
    [!args.benchmark.priceDate, 'missing_benchmark_price_date'],
    [!args.benchmark.source, 'missing_benchmark_price_source'],
    [args.benchmark.priceDate != null && args.benchmark.priceDate > args.decidedDateLocal, 'benchmark_price_after_decision'],
  ]
  for (const [hit, code] of stock) if (hit) { out.push(code); stockBlocking.push(code) }
  for (const [hit, code] of bench) if (hit) { out.push(code); benchBlocking.push(code) }
  if (args.versionUnknown) out.push('version_unknown')
  if (args.retrospective) out.push('retrospective')
  const comparisonStatus = stockBlocking.length === 0 && !args.retrospective
    ? 'evaluable' : 'not_evaluable'
  const benchmarkComparisonStatus = comparisonStatus === 'evaluable' && benchBlocking.length === 0
    ? 'evaluable' : 'not_evaluable'
  return {
    exclusions: out,
    comparisonStatus,
    benchmarkComparisonStatus,
    modelComparisonEligible: !args.versionUnknown,
  }
}

/** Whether an evaluation price dated `priceDate` may be recorded as the
 * return for `horizonMonths` after the decision. The pre-registered
 * tolerance window is [horizon, horizon + 2) elapsed calendar months:
 * earlier is not that horizon yet, later belongs to a longer horizon
 * (PR #7 review, BLOCKER 3). */
export function validateEvaluationHorizon(
  decidedAt: string, priceDate: string, horizonMonths: number,
): { ok: boolean; elapsedMonths: number } {
  const start = localDateString(new Date(decidedAt))
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = priceDate.split('-').map(Number)
  let months = (y2 - y1) * 12 + (m2 - m1)
  if (d2 < d1) months -= 1
  return { ok: months >= horizonMonths && months < horizonMonths + 2, elapsedMonths: months }
}

export interface BuildDraftInput {
  company: CompanyCase
  entrySource: DecisionEntrySource
  decidedAt: string
  /** True when the user explicitly picked the decision moment in the UI
   * (as opposed to it being bound to the verdict / defaulted to now). */
  decidedAtExplicit?: boolean
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
  // Thesis records can be edited in place (thesisRepository.update), so
  // their decision-time content is only guaranteed when the last edit
  // predates the decision — judge them by updatedAt, not createdAt
  // (Issue #6, mandatory fix B). The other sources are append-only saves.
  const thesisPick = pickSectionAsOf(input.theses, asOf, r => r.updatedAt)
  const reviewPick = pickSectionAsOf(input.reviews, asOf, r => r.createdAt)

  const data = dataPick.verified
  const val = valPick.verified
  const thesis = thesisPick.verified
  const review = reviewPick.verified

  const retrospective = isRetrospective(input.decidedAt, input.createdAt, input.decidedAtExplicit ?? false)
  const versionUnknown = input.buildCommit == null
  const assessment = deriveComparisonExclusions({
    price: input.priceAtDecision,
    benchmark: input.benchmarkPrice,
    decidedDateLocal: localDateString(new Date(input.decidedAt)),
    retrospective, versionUnknown,
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
    comparisonStatus: assessment.comparisonStatus,
    benchmarkComparisonStatus: assessment.benchmarkComparisonStatus,
    modelComparisonEligible: assessment.modelComparisonEligible,
    comparisonExclusions: assessment.exclusions,

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
    // Pre-resolved by the caller via resolveCagrGateMinUsed: the value in
    // force at decision time, or null when that cannot be established.
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
    if (args.decisionPrice.currency !== args.decisionBenchmark.currency) {
      note = 'excess return not computed: stock and benchmark currencies differ'
    } else if (!conditionsMatch(args.decisionPrice, args.decisionBenchmark)) {
      // Each leg is internally consistent, but an adjusted (total-return
      // style) stock figure and a raw SPY figure are different quantities;
      // their difference is not an excess return (PR #7 review, BLOCKER 3).
      note = 'excess return not computed: stock and benchmark price conditions (type/adjustment) differ'
    } else {
      excessReturnPct = stockReturnPct - benchmarkReturnPct
    }
  } else if (stockReturnPct == null) {
    note = 'stock return not computed: missing price or price conditions (type/adjustment/currency) differ from decision time'
  } else {
    note = 'benchmark return not computed: missing price or price conditions differ from decision time'
  }
  return { stockReturnPct, benchmarkReturnPct, excessReturnPct, note }
}
