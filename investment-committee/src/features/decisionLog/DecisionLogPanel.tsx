import { useEffect, useMemo, useState } from 'react'
import { T, Button, Input, Select, Textarea, SectionHeader } from '../../components/common/ui'
import { useStore } from '../../state/store'
import { t } from '../../lib/i18n'
import { decisionLogRepository, settingsRepository } from '../../db/repositories'
import {
  buildDecisionLogDraft, emptyBenchmarkSnapshot, emptyPriceSnapshot,
  fromDateTimeLocalValue, isRetrospective, localDateString, resolveCagrGateMinUsed,
  toDateTimeLocalValue,
  type DecisionLogDraft,
} from '../../lib/decisionLog'
import { APP_VERSION, BUILD_COMMIT } from '../../lib/version'
import type {
  CompanyCase, DataAnalysis, DecisionKind, DecisionLogRecord, PriceSnapshot,
  PriceType, ReviewReport, ThesisAnalysis, ValuationReport, VerdictReport,
} from '../../types/domain'

// ── Decision log recording panel (Phase A) ───────────────────────────────
// Source records are loaded ONCE when the panel opens and the point-in-time
// selection (as of the verdict / decision moment) happens in pure code.
// What is shown is exactly what gets saved — saving never re-reads the
// source tables, so edits in another tab cannot leak future information
// into a past decision (Issue #6, P0-1).

interface Sources {
  dataAnalyses: DataAnalysis[]
  valuations: ValuationReport[]
  theses: ThesisAnalysis[]
  reviews: ReviewReport[]
  cagrGateMin: number | null
}

interface Props {
  company: CompanyCase
  verdict: VerdictReport | null // null = manual entry
  /** The cagrGateMin in effect at the moment the verdict was saved in
   * this session, captured by VerdictPage. Null when the verdict was
   * loaded from storage — past settings cannot be reconstructed, so the
   * log then records the gate minimum as unknown. */
  frozenCagrGateMin?: number | null
  /** True when the verdict was saved in this session (the log is the
   * forward record of that save). A verdict loaded from storage is a
   * past decision being re-recorded: the log is retrospective and
   * today's prices are not prefilled as if they were decision-time
   * observations (PR #7 review, BLOCKER 2). */
  verdictSavedInSession?: boolean
  onClose: () => void
  onSaved: (rec: DecisionLogRecord) => void
}

function verdictToKind(v: 'BUY' | 'WATCH' | 'PASS'): DecisionKind {
  return v === 'BUY' ? 'buy' : v === 'WATCH' ? 'watch' : 'pass'
}

export default function DecisionLogPanel({ company, verdict, frozenCagrGateMin, verdictSavedInSession, onClose, onSaved }: Props) {
  const lang = useStore(s => s.lang)
  const showToast = useStore(s => s.showToast)
  const [sources, setSources] = useState<Sources | null>(null)
  const [saving, setSaving] = useState(false)

  // First-render facts used only for initial form values: a stored
  // verdict being logged later is a retrospective re-record, so today's
  // currentPrice must not be prefilled as the decision-time price.
  const openedAt = useMemo(() => new Date().toISOString(), [])
  const initialDecidedAt = verdict?.createdAt ?? openedAt
  const initiallyRetrospective = isRetrospective(
    initialDecidedAt, openedAt, verdict != null && !verdictSavedInSession)

  const [decidedAt, setDecidedAt] = useState<string>(initialDecidedAt)
  const [decidedAtEdited, setDecidedAtEdited] = useState(false)
  const [decision, setDecision] = useState<DecisionKind>(verdict ? verdictToKind(verdict.verdict) : 'pass')
  const [rationale, setRationale] = useState<string>(verdict?.rationale ?? '')

  // Stock price form
  const [price, setPrice] = useState<string>(
    !initiallyRetrospective && company.currentPrice != null ? String(company.currentPrice) : '')
  const [priceDate, setPriceDate] = useState<string>(
    initiallyRetrospective ? localDateString(new Date(initialDecidedAt)) : localDateString(new Date()))
  const [currency, setCurrency] = useState<'USD' | 'JPY'>('USD')
  const [priceType, setPriceType] = useState<PriceType>('raw')
  const [adjustmentBasis, setAdjustmentBasis] = useState<string>('')
  const [priceSource, setPriceSource] = useState<string>('manual')
  // SPY benchmark form
  const [benchPrice, setBenchPrice] = useState<string>('')
  const [benchPriceDate, setBenchPriceDate] = useState<string>(
    initiallyRetrospective ? localDateString(new Date(initialDecidedAt)) : localDateString(new Date()))

  useEffect(() => {
    let cancelled = false
    Promise.all([
      decisionLogRepository.loadCompanySources(company.id),
      settingsRepository.get().catch(() => null),
    ]).then(([loaded, settings]) => {
      if (cancelled) return
      setSources({ ...loaded, cagrGateMin: settings?.cagrGateMin ?? null })
    })
    return () => { cancelled = true }
  }, [company.id])

  const draft: DecisionLogDraft | null = useMemo(() => {
    if (!sources) return null
    const nowIso = new Date().toISOString()
    const stockSnap: PriceSnapshot = {
      ...emptyPriceSnapshot(nowIso),
      price: price.trim() === '' ? null : Number(price),
      priceDate: priceDate || null,
      currency,
      priceType,
      adjustmentBasis: priceType === 'adjusted' ? (adjustmentBasis.trim() || null) : null,
      source: priceSource.trim() || null,
    }
    const benchSnap = {
      ...emptyBenchmarkSnapshot(nowIso),
      price: benchPrice.trim() === '' ? null : Number(benchPrice),
      priceDate: benchPriceDate || null,
      currency,
      priceType,
      adjustmentBasis: priceType === 'adjusted' ? (adjustmentBasis.trim() || null) : null,
      source: priceSource.trim() || null,
    }
    // A stored verdict logged later counts as an explicitly past moment
    // even on the same day; only an in-session verdict save is bound to
    // the flow (date-based rule).
    const explicit = decidedAtEdited || (verdict != null && !verdictSavedInSession)
    const retro = isRetrospective(decidedAt, nowIso, explicit)
    return buildDecisionLogDraft({
      company,
      entrySource: verdict ? 'verdict_save' : 'manual',
      decidedAt,
      decidedAtExplicit: explicit,
      createdAt: nowIso,
      referenceTime: verdict?.createdAt ?? decidedAt,
      verdict,
      dataAnalyses: sources.dataAnalyses,
      valuations: sources.valuations,
      theses: sources.theses,
      reviews: sources.reviews,
      cagrGateMin: resolveCagrGateMinUsed({
        entrySource: verdict ? 'verdict_save' : 'manual',
        frozenAtSave: frozenCagrGateMin ?? null,
        currentValue: sources.cagrGateMin,
        retrospective: retro,
      }),
      appVersion: APP_VERSION,
      buildCommit: BUILD_COMMIT,
      priceAtDecision: stockSnap,
      benchmarkPrice: benchSnap,
      extraBenchmarks: [],
      humanFinalDecision: decision,
      rationale,
      candidateSource: verdict ? null : 'ad_hoc',
    })
  }, [sources, company, verdict, decidedAt, decidedAtEdited, verdictSavedInSession, frozenCagrGateMin, decision, rationale, price, priceDate,
      currency, priceType, adjustmentBasis, priceSource, benchPrice, benchPriceDate])

  async function handleSave() {
    if (!draft) return
    // Input validation (PR #7 review): the rationale is required, prices
    // must be finite positive numbers when given, and neither the
    // decision moment nor a price's market date may lie in the future.
    if (rationale.trim() === '') {
      showToast(t('decisionLogRationaleRequired', lang), 'error')
      return
    }
    const badNumber = (s: string) =>
      s.trim() !== '' && (!Number.isFinite(Number(s)) || Number(s) <= 0)
    if (badNumber(price) || badNumber(benchPrice)) {
      showToast(t('decisionLogInvalidPrice', lang), 'error')
      return
    }
    const todayLocal = localDateString(new Date())
    if (new Date(decidedAt).getTime() > Date.now() + 5 * 60_000
      || priceDate > todayLocal || benchPriceDate > todayLocal) {
      showToast(t('decisionLogFutureDate', lang), 'error')
      return
    }
    setSaving(true)
    try {
      const rec = await decisionLogRepository.create(draft)
      showToast(t('decisionLogSaved', lang), 'success')
      onSaved(rec)
      onClose()
    } catch (e) {
      if (e instanceof Error && e.message === 'duplicate_decision_log') {
        showToast(t('decisionLogDuplicate', lang), 'error')
      } else {
        showToast(t('saveFailed', lang), 'error')
      }
    }
    setSaving(false)
  }

  const statusLabel = (s: string) =>
    s === 'verified' ? t('decisionLogVerified', lang)
    : s === 'unverified' ? t('decisionLogUnverified', lang)
    : t('decisionLogAbsent', lang)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto',
    }}>
      <div style={{
        background: T.bg, border: `1px solid ${T.cyan}`, margin: '40px 16px',
        padding: '24px 28px', width: 640, maxWidth: '94vw', color: T.text,
      }}>
        <SectionHeader label={`${t('decisionLogPanelTitle', lang)} — ${company.ticker}`} color={T.cyan} />

        {!sources || !draft ? (
          <div style={{ color: T.textDim, fontSize: 12, padding: 16 }}>…</div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input
                label={t('decisionLogDecidedAt', lang)} type="datetime-local"
                value={toDateTimeLocalValue(decidedAt)}
                onChange={v => { setDecidedAt(fromDateTimeLocalValue(v)); setDecidedAtEdited(true) }}
              />
              <Select
                label={t('decisionLogFinalDecision', lang)} value={decision}
                onChange={v => setDecision(v as DecisionKind)}
                options={[
                  { value: 'buy', label: 'BUY' },
                  { value: 'watch', label: 'WATCH' },
                  { value: 'pass', label: 'PASS' },
                ]}
              />
            </div>
            <Textarea
              label={t('decisionLogRationale', lang)} value={rationale} rows={3}
              onChange={v => setRationale(v)}
            />

            <div style={{ marginTop: 8, fontSize: 11, color: T.textDim }}>
              {t('decisionLogSectionStatus', lang)}:&nbsp;
              {(['dataAnalysis', 'valuation', 'thesis', 'review'] as const).map(k => (
                <span key={k} style={{ marginRight: 10 }}>
                  {k}: <span style={{ color: draft.sourceRefs[k].asOfStatus === 'verified' ? T.green : T.orange }}>
                    {statusLabel(draft.sourceRefs[k].asOfStatus)}
                  </span>
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: draft.comparisonStatus === 'evaluable' ? T.green : T.orange, marginTop: 4 }}>
              {draft.comparisonStatus === 'evaluable'
                ? t('decisionLogEvaluable', lang)
                : `${t('decisionLogNotEvaluable', lang)} (${draft.comparisonExclusions.join(', ')})`}
              {draft.retrospective && <span> · {t('decisionLogRetrospective', lang)}</span>}
            </div>
            <div style={{ fontSize: 11, color: draft.benchmarkComparisonStatus === 'evaluable' ? T.green : T.orange }}>
              vs SPY: {draft.benchmarkComparisonStatus === 'evaluable'
                ? t('decisionLogEvaluable', lang)
                : t('decisionLogNotEvaluable', lang)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
              <Input label={t('decisionLogPrice', lang)} type="number" value={price}
                onChange={v => setPrice(v)} />
              <Input label={t('decisionLogPriceDate', lang)} type="date" value={priceDate}
                onChange={v => setPriceDate(v)} />
              <Select label={t('decisionLogPriceType', lang)} value={priceType}
                onChange={v => setPriceType(v as PriceType)}
                options={[
                  { value: 'raw', label: 'raw' },
                  { value: 'adjusted', label: 'adjusted' },
                ]} />
              <Input label={t('decisionLogSource', lang)} value={priceSource}
                onChange={v => setPriceSource(v)} />
              <Input label={t('decisionLogBenchmarkPrice', lang)} type="number" value={benchPrice}
                onChange={v => setBenchPrice(v)} />
              <Input label={t('decisionLogPriceDate', lang)} type="date" value={benchPriceDate}
                onChange={v => setBenchPriceDate(v)} />
            </div>
            {priceType === 'adjusted' && (
              <Input label="adjustmentBasis" value={adjustmentBasis}
                placeholder="split_dividend_adjusted"
                onChange={v => setAdjustmentBasis(v)} />
            )}
            <Select label="Currency" value={currency}
              onChange={v => setCurrency(v as 'USD' | 'JPY')}
              options={[{ value: 'USD', label: 'USD' }, { value: 'JPY', label: 'JPY' }]} />

            <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
              <Button onClick={onClose}>{t('cancelBtn', lang)}</Button>
              <Button onClick={handleSave} loading={saving} accent={T.cyan}>
                {t('decisionLogSave', lang)}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
