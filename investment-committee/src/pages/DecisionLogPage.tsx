import { useEffect, useMemo, useState } from 'react'
import { T, Button, PageLayout, SectionHeader, Input, Select, Textarea } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { decisionLogRepository } from '../db/repositories'
import { verifyLogBody } from '../lib/decisionLogHash'
import {
  computeEvaluationReturns, emptyBenchmarkSnapshot, emptyPriceSnapshot,
  localDateString, validateEvaluationHorizon,
} from '../lib/decisionLog'
import { decisionLogsToCsv } from '../lib/decisionLogCsv'
import type {
  DecisionLogEvaluation, DecisionLogEvent, DecisionLogRecord, PriceType,
} from '../types/domain'

// ── Forward decision log: list, integrity check, notes, evaluations ─────
// Records are append-only: this page can add events and evaluations, but
// offers no way to edit or delete a frozen decision.

function download(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function DecisionLogPage() {
  const lang = useStore(s => s.lang)
  const showToast = useStore(s => s.showToast)
  const [logs, setLogs] = useState<DecisionLogRecord[]>([])
  const [evaluations, setEvaluations] = useState<DecisionLogEvaluation[]>([])
  const [hashOk, setHashOk] = useState<Map<string, boolean>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventsState, setEventsState] = useState<{ logId: string; items: DecisionLogEvent[] }>({ logId: '', items: [] })
  const events = eventsState.logId === selectedId ? eventsState.items : []
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<'note_added' | 'correction_note'>('note_added')

  // Evaluation form
  const [horizon, setHorizon] = useState('12')
  const [evalPrice, setEvalPrice] = useState('')
  // The evaluation price's own conditions, entered explicitly: defaulting
  // them from the decision record is a starting point, not an assumption.
  // If they differ from decision time, returns come out null (with the
  // reason recorded) instead of a silently mixed-basis number.
  const [evalPriceType, setEvalPriceType] = useState<PriceType>('raw')
  const [evalAdjustmentBasis, setEvalAdjustmentBasis] = useState('')
  // The benchmark's evaluation conditions are independent of the stock's:
  // SPY may come from a different series with its own adjustment basis.
  const [benchEvalPriceType, setBenchEvalPriceType] = useState<PriceType>('raw')
  const [benchEvalAdjustmentBasis, setBenchEvalAdjustmentBasis] = useState('')
  // The evaluation price's actual market date, and whether the "price" is
  // delisting/acquisition consideration rather than a market quote.
  const [evalPriceDate, setEvalPriceDate] = useState('')
  const [evalDelisted, setEvalDelisted] = useState(false)
  const [evalHashOk, setEvalHashOk] = useState<Map<string, boolean>>(new Map())
  const [eventHashOk, setEventHashOk] = useState<Map<string, boolean>>(new Map())
  const [evalBenchPrice, setEvalBenchPrice] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      decisionLogRepository.list(),
      decisionLogRepository.listEvaluations(),
    ]).then(async ([all, evals]) => {
      const checks = new Map<string, boolean>()
      for (const l of all) checks.set(l.id, await verifyLogBody(l))
      const evalChecks = new Map<string, boolean>()
      for (const e of evals) evalChecks.set(e.id, await verifyLogBody(e))
      if (cancelled) return
      setLogs(all)
      setEvaluations(evals)
      setHashOk(checks)
      setEvalHashOk(evalChecks)
    })
    return () => { cancelled = true }
  }, [])

  const selected = useMemo(() => logs.find(l => l.id === selectedId) ?? null, [logs, selectedId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    decisionLogRepository.listEvents(selectedId).then(async items => {
      const checks = new Map<string, boolean>()
      for (const ev of items) checks.set(ev.id, await verifyLogBody(ev))
      if (!cancelled) {
        setEventsState({ logId: selectedId, items })
        setEventHashOk(checks)
      }
    })
    return () => { cancelled = true }
  }, [selectedId])

  const selectedEvals = useMemo(
    () => evaluations.filter(e => e.logId === selectedId),
    [evaluations, selectedId],
  )

  function exportJson() {
    void Promise.all([
      decisionLogRepository.list(),
      decisionLogRepository.listEvaluations(),
    ]).then(async ([all, evals]) => {
      const evts: DecisionLogEvent[] = []
      for (const l of all) evts.push(...await decisionLogRepository.listEvents(l.id))
      download('decision-logs.json', JSON.stringify({
        exportedAt: new Date().toISOString(), decisionLogs: all,
        decisionLogEvents: evts, decisionLogEvaluations: evals,
      }, null, 2), 'application/json')
    })
  }

  function exportCsv() {
    download('decision-logs.csv', decisionLogsToCsv(logs, evaluations), 'text/csv')
  }

  async function handleAddNote() {
    if (!selected || noteText.trim() === '') return
    const ev = await decisionLogRepository.addEvent({
      logId: selected.id, type: noteKind, at: new Date().toISOString(),
      note: noteText.trim(), payload: null,
    })
    setEventsState(prev => prev.logId === selected.id
      ? { logId: prev.logId, items: [...prev.items, ev] }
      : { logId: selected.id, items: [ev] })
    setEventHashOk(prev => new Map(prev).set(ev.id, true))
    setNoteText('')
    showToast(t('decisionLogSaved', lang), 'success')
  }

  async function handleAddEvaluation() {
    if (!selected) return
    // Validation (PR #7 review, BLOCKER 3): the price must be a finite
    // positive number with a real market date, and the elapsed period
    // must match the chosen horizon — otherwise the entry would pose as
    // a period return it is not.
    const badNumber = (s: string, required: boolean) =>
      s.trim() === '' ? required : (!Number.isFinite(Number(s)) || Number(s) <= 0)
    if (badNumber(evalPrice, true) || badNumber(evalBenchPrice, false) || !evalPriceDate) {
      showToast(t('decisionLogInvalidPrice', lang), 'error')
      return
    }
    if (evalPriceDate > localDateString(new Date())) {
      showToast(t('decisionLogFutureDate', lang), 'error')
      return
    }
    const hv = validateEvaluationHorizon(selected.decidedAt, evalPriceDate, Number(horizon))
    if (!hv.ok) {
      showToast(t('decisionLogHorizonMismatch', lang), 'error')
      return
    }
    const nowIso = new Date().toISOString()
    const evalBasis = evalPriceType === 'adjusted' ? (evalAdjustmentBasis.trim() || null) : null
    const benchBasis = benchEvalPriceType === 'adjusted' ? (benchEvalAdjustmentBasis.trim() || null) : null
    const priceNow = {
      ...emptyPriceSnapshot(nowIso),
      price: Number(evalPrice),
      priceDate: evalPriceDate,
      currency: selected.priceAtDecision.currency,
      priceType: evalPriceType,
      adjustmentBasis: evalBasis,
      source: 'manual',
    }
    const benchNow = evalBenchPrice.trim() === '' ? null : {
      ...emptyBenchmarkSnapshot(nowIso),
      price: Number(evalBenchPrice),
      priceDate: evalPriceDate,
      currency: selected.benchmarkPrice.currency,
      priceType: benchEvalPriceType,
      adjustmentBasis: benchBasis,
      source: 'manual',
    }
    const r = computeEvaluationReturns({
      decisionPrice: selected.priceAtDecision, priceNow,
      decisionBenchmark: selected.benchmarkPrice, benchmarkNow: benchNow,
    })
    const note = [evalDelisted ? 'delisting_consideration' : null, r.note]
      .filter(Boolean).join(' · ') || null
    const ev = await decisionLogRepository.addEvaluation({
      logId: selected.id,
      horizonMonths: Number(horizon),
      evaluatedAt: nowIso,
      priceNow, benchmarkPriceNow: benchNow,
      stockReturnPct: r.stockReturnPct,
      benchmarkReturnPct: r.benchmarkReturnPct,
      excessReturnPct: r.excessReturnPct,
      note,
    })
    setEvaluations(prev => [...prev, ev])
    setEvalHashOk(prev => new Map(prev).set(ev.id, true))
    setEvalPrice('')
    setEvalBenchPrice('')
    showToast(t('decisionLogSaved', lang), 'success')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('decisionLogTitle', lang)}
        subtitle="APPEND-ONLY / POINT-IN-TIME"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={exportJson}>{t('decisionLogExportJson', lang)}</Button>
            <Button size="sm" onClick={exportCsv}>{t('decisionLogExportCsv', lang)}</Button>
          </div>
        }
      >
        {logs.length > 0 && (
          <div style={{ fontSize: 11, marginBottom: 12 }}>
            <span style={{
              color: logs.every(l => hashOk.get(l.id)) && evaluations.every(e => evalHashOk.get(e.id))
                ? T.green : T.red,
            }}>
              integrity: {logs.filter(l => hashOk.get(l.id)).length}/{logs.length} records ·{' '}
              {evaluations.filter(e => evalHashOk.get(e.id)).length}/{evaluations.length} evaluations verified
              {selected && events.length > 0 &&
                ` · ${events.filter(ev => eventHashOk.get(ev.id)).length}/${events.length} events (selected)`}
            </span>
            <div style={{ color: T.textDim, marginTop: 2 }}>
              {t('decisionLogIntegrityNote', lang)}
            </div>
          </div>
        )}

        {logs.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12 }}>{t('decisionLogEmpty', lang)}</div>
        ) : (
          logs.map(l => (
            <div
              key={l.id}
              onClick={() => {
                const next = l.id === selectedId ? null : l.id
                setSelectedId(next)
                if (next) {
                  setEvalPriceType(l.priceAtDecision.priceType)
                  setEvalAdjustmentBasis(l.priceAtDecision.adjustmentBasis ?? '')
                  setBenchEvalPriceType(l.benchmarkPrice.priceType)
                  setBenchEvalAdjustmentBasis(l.benchmarkPrice.adjustmentBasis ?? '')
                  setEvalPriceDate(localDateString(new Date()))
                  setEvalDelisted(false)
                }
              }}
              style={{
                border: `1px solid ${l.id === selectedId ? T.cyan : T.borderDim}`,
                padding: '10px 14px', marginBottom: 8, cursor: 'pointer', background: '#080D12',
              }}
            >
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: T.textMid, flexWrap: 'wrap' }}>
                <span style={{ color: T.text, fontWeight: 700 }}>{l.ticker}</span>
                <span>{l.decidedAt.slice(0, 10)}</span>
                <span>{(l.humanFinalDecision ?? '—').toUpperCase()}</span>
                <span>{l.priceAtDecision.price != null ? `${l.priceAtDecision.price} ${l.priceAtDecision.currency}` : '—'}</span>
                <span style={{ color: l.comparisonStatus === 'evaluable' ? T.green : T.orange }}>
                  {l.comparisonStatus === 'evaluable' ? t('decisionLogEvaluable', lang) : t('decisionLogNotEvaluable', lang)}
                </span>
                <span style={{ color: hashOk.get(l.id) ? T.green : T.red }}>
                  {hashOk.get(l.id) ? t('decisionLogHashOk', lang) : t('decisionLogHashNg', lang)}
                </span>
                {l.retrospective && <span style={{ color: T.orange }}>{t('decisionLogRetrospective', lang)}</span>}
              </div>
              {l.id === selectedId && (
                <div style={{ marginTop: 10, fontSize: 11, color: T.textDim }} onClick={e => e.stopPropagation()}>
                  <div>rationale: {l.rationale || '—'}</div>
                  <div>
                    expectedCagr: {l.expectedCagr ?? '—'} · gate: {l.cagrGate ?? '—'} ·
                    risk: {l.riskLevel ?? '—'} · verdict: {l.verdictResult ?? '—'}
                  </div>
                  <div>
                    sections:&nbsp;
                    {(['dataAnalysis', 'valuation', 'thesis', 'review'] as const).map(k => (
                      <span key={k} style={{ marginRight: 8 }}>{k}={l.sourceRefs[k].asOfStatus}</span>
                    ))}
                  </div>
                  {l.comparisonExclusions.length > 0 && (
                    <div>exclusions: {l.comparisonExclusions.join(', ')}</div>
                  )}

                  <SectionHeader label="EVENTS" color={T.cyan} />
                  {events.map(ev => (
                    <div key={ev.id} style={{ padding: '2px 0' }}>
                      {ev.at.slice(0, 16)} · {ev.type}{ev.note ? ` — ${ev.note}` : ''}
                      {eventHashOk.get(ev.id) === false &&
                        <span style={{ color: T.red }}> ⚠ hash mismatch</span>}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
                    <Select value={noteKind} onChange={v => setNoteKind(v as 'note_added' | 'correction_note')}
                      options={[
                        { value: 'note_added', label: t('decisionLogAddNote', lang) },
                        { value: 'correction_note', label: t('decisionLogAddCorrection', lang) },
                      ]} />
                    <div style={{ flex: 1 }}>
                      <Textarea value={noteText} onChange={setNoteText} rows={2} />
                    </div>
                    <Button size="sm" accent={T.cyan} onClick={handleAddNote}>
                      {t('decisionLogAddNote', lang)}
                    </Button>
                  </div>

                  <SectionHeader label="EVALUATIONS" color={T.cyan} />
                  {selectedEvals.map(ev => (
                    <div key={ev.id} style={{ padding: '2px 0' }}>
                      {ev.horizonMonths}m · stock {ev.stockReturnPct?.toFixed(1) ?? '—'}% ·
                      SPY {ev.benchmarkReturnPct?.toFixed(1) ?? '—'}% ·
                      excess {ev.excessReturnPct?.toFixed(1) ?? '—'}%
                      {ev.note ? ` (${ev.note})` : ''}
                      {evalHashOk.get(ev.id) === false &&
                        <span style={{ color: T.red }}> ⚠ hash mismatch</span>}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                    <Select value={horizon} onChange={setHorizon}
                      options={[3, 6, 12, 24, 36, 60].map(h => ({ value: String(h), label: `${h}m` }))} />
                    <Input label={t('decisionLogPrice', lang)} type="number" value={evalPrice}
                      onChange={setEvalPrice} />
                    <Input label={t('decisionLogBenchmarkPrice', lang)} type="number" value={evalBenchPrice}
                      onChange={setEvalBenchPrice} />
                    <Select label={t('decisionLogPriceType', lang)} value={evalPriceType}
                      onChange={v => setEvalPriceType(v as PriceType)}
                      options={[
                        { value: 'raw', label: 'raw' },
                        { value: 'adjusted', label: 'adjusted' },
                      ]} />
                    {evalPriceType === 'adjusted' && (
                      <Input label="adjustmentBasis" value={evalAdjustmentBasis}
                        placeholder="split_dividend_adjusted"
                        onChange={setEvalAdjustmentBasis} />
                    )}
                    <Select label={`SPY ${t('decisionLogPriceType', lang)}`} value={benchEvalPriceType}
                      onChange={v => setBenchEvalPriceType(v as PriceType)}
                      options={[
                        { value: 'raw', label: 'raw' },
                        { value: 'adjusted', label: 'adjusted' },
                      ]} />
                    {benchEvalPriceType === 'adjusted' && (
                      <Input label="SPY adjustmentBasis" value={benchEvalAdjustmentBasis}
                        placeholder="split_dividend_adjusted"
                        onChange={setBenchEvalAdjustmentBasis} />
                    )}
                    <Input label={t('decisionLogPriceDate', lang)} type="date" value={evalPriceDate}
                      onChange={setEvalPriceDate} />
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: T.textDim }}>
                      <input type="checkbox" checked={evalDelisted}
                        onChange={e => setEvalDelisted(e.target.checked)} />
                      {t('decisionLogDelisted', lang)}
                    </label>
                    <Button size="sm" accent={T.cyan} onClick={handleAddEvaluation}>
                      {t('decisionLogAddEvaluation', lang)}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </PageLayout>
    </div>
  )
}
