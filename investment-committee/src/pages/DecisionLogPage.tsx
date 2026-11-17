import { useEffect, useMemo, useState } from 'react'
import { T, Button, PageLayout, SectionHeader, Input, Select, Textarea } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { decisionLogRepository } from '../db/repositories'
import { verifyLogBody } from '../lib/decisionLogHash'
import { computeEvaluationReturns, emptyBenchmarkSnapshot, emptyPriceSnapshot } from '../lib/decisionLog'
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
  const [chainOk, setChainOk] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [eventsState, setEventsState] = useState<{ logId: string; items: DecisionLogEvent[] }>({ logId: '', items: [] })
  const events = eventsState.logId === selectedId ? eventsState.items : []
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<'note_added' | 'correction_note'>('note_added')

  // Evaluation form
  const [horizon, setHorizon] = useState('12')
  const [evalPrice, setEvalPrice] = useState('')
  const [evalBenchPrice, setEvalBenchPrice] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      decisionLogRepository.list(),
      decisionLogRepository.listEvaluations(),
    ]).then(async ([all, evals]) => {
      const checks = new Map<string, boolean>()
      for (const l of all) checks.set(l.id, await verifyLogBody(l))
      if (cancelled) return
      setLogs(all)
      setEvaluations(evals)
      setHashOk(checks)
      const bySeq = [...all].sort((a, b) => a.seq - b.seq)
      let ok = true
      for (let i = 1; i < bySeq.length; i++) {
        if (bySeq[i].prevLogHash !== bySeq[i - 1].contentHash) { ok = false; break }
      }
      setChainOk(ok)
    })
    return () => { cancelled = true }
  }, [])

  const selected = useMemo(() => logs.find(l => l.id === selectedId) ?? null, [logs, selectedId])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    decisionLogRepository.listEvents(selectedId).then(items => {
      if (!cancelled) setEventsState({ logId: selectedId, items })
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
    setNoteText('')
    showToast(t('decisionLogSaved', lang), 'success')
  }

  async function handleAddEvaluation() {
    if (!selected) return
    const nowIso = new Date().toISOString()
    const priceNow = {
      ...emptyPriceSnapshot(nowIso),
      price: evalPrice.trim() === '' ? null : Number(evalPrice),
      priceDate: nowIso.slice(0, 10),
      currency: selected.priceAtDecision.currency,
      priceType: selected.priceAtDecision.priceType as PriceType,
      adjustmentBasis: selected.priceAtDecision.adjustmentBasis,
      source: 'manual',
    }
    const benchNow = evalBenchPrice.trim() === '' ? null : {
      ...emptyBenchmarkSnapshot(nowIso),
      price: Number(evalBenchPrice),
      priceDate: nowIso.slice(0, 10),
      currency: selected.benchmarkPrice.currency,
      priceType: selected.benchmarkPrice.priceType as PriceType,
      adjustmentBasis: selected.benchmarkPrice.adjustmentBasis,
      source: 'manual',
    }
    const r = computeEvaluationReturns({
      decisionPrice: selected.priceAtDecision, priceNow,
      decisionBenchmark: selected.benchmarkPrice, benchmarkNow: benchNow,
    })
    const ev = await decisionLogRepository.addEvaluation({
      logId: selected.id,
      horizonMonths: Number(horizon),
      evaluatedAt: nowIso,
      priceNow, benchmarkPriceNow: benchNow,
      stockReturnPct: r.stockReturnPct,
      benchmarkReturnPct: r.benchmarkReturnPct,
      excessReturnPct: r.excessReturnPct,
      note: r.note,
    })
    setEvaluations(prev => [...prev, ev])
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
        <div style={{ fontSize: 11, color: chainOk ? T.green : T.red, marginBottom: 12 }}>
          chain: {chainOk ? 'OK' : 'BROKEN'}
        </div>

        {logs.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12 }}>{t('decisionLogEmpty', lang)}</div>
        ) : (
          logs.map(l => (
            <div
              key={l.id}
              onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
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
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
                    <Select value={horizon} onChange={setHorizon}
                      options={[3, 6, 12, 24, 36, 60].map(h => ({ value: String(h), label: `${h}m` }))} />
                    <Input label={t('decisionLogPrice', lang)} type="number" value={evalPrice}
                      onChange={setEvalPrice} />
                    <Input label={t('decisionLogBenchmarkPrice', lang)} type="number" value={evalBenchPrice}
                      onChange={setEvalBenchPrice} />
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
