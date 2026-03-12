import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, NumericInput, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { valuationRepository, companyRepository } from '../db/repositories'
import { calculateValuation } from '../lib/calculators'
import type { ValuationAssumptions } from '../types/domain'

const EMPTY: ValuationAssumptions = {
  currentRevenue: null, currentFcf: null, currentEnterpriseValue: null,
  baseRevenueGrowth: null, baseFcfMargin: null, exitMultiple: null, years: 3,
}

export default function ValuationPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()
  const [assumptions, setAssumptions] = useState<ValuationAssumptions>(EMPTY)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    valuationRepository.getLatest(companyId).then(v => {
      if (v) { setAssumptions(v.assumptions); setSavedAt(v.createdAt) }
    })
    // Pre-fill EV from company data
    companyRepository.get(companyId).then(c => {
      if (c?.enterpriseValue) setAssumptions(p => ({ ...p, currentEnterpriseValue: c.enterpriseValue }))
    })
  }, [companyId])

  const calc = calculateValuation(assumptions)
  const cagrColor = calc.expectedCagr === null ? T.textDim : calc.cagrGate === 'pass' ? T.green : calc.cagrGate === 'watch' ? T.yellow : T.red
  const cagrLabel = calc.cagrGate === 'pass' ? t('buyCandidate', lang) : calc.cagrGate === 'watch' ? t('watchLabel', lang) : t('buyBlocked', lang)

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const { bear, base, bull, expectedCagr, cagrGate, downsideRiskScore } = calculateValuation(assumptions)
      const v = await valuationRepository.save({ companyId, assumptions, scenarios: { bear, base, bull }, expectedCagr, cagrGate, downsideRiskScore, createdAt: new Date().toISOString() })
      setSavedAt(v.createdAt)
      showToast('Valuation saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  function upd(key: keyof ValuationAssumptions) { return (v: number | null) => setAssumptions(p => ({ ...p, [key]: v })) }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('valuationTitle', lang)} subtitle={`${company?.ticker ?? ''} / VALUATION`}>
        <div style={{ border: `1px solid ${T.amber}`, borderLeft: `2px solid ${T.amber}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.amber)},0.04)` }}>
          <div style={{ color: T.amber, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>VALUATION GATE — Investment = Company × Price</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            期待CAGR &lt; 12% → BUY禁止（Verdict画面でブロック）。FCFベースのシナリオ計算。
          </div>
        </div>

        {/* CAGR result */}
        <div style={{ border: `2px solid ${cagrColor}`, padding: '20px 28px', marginBottom: 24, background: `rgba(${hexRgb(cagrColor)},0.06)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 8 }}>EXPECTED CAGR (BASE / {assumptions.years}yr)</div>
            <div style={{ fontSize: 48, fontWeight: 700, color: cagrColor, fontFamily: "'Courier New',monospace" }}>
              {calc.expectedCagr !== null ? `${calc.expectedCagr.toFixed(1)}%` : '—'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: cagrColor, fontSize: 22, fontWeight: 700, letterSpacing: 3, marginBottom: 10 }}>{calc.expectedCagr !== null ? cagrLabel : '—'}</div>
            {calc.expectedCagr !== null && calc.cagrGate === 'block' && (
              <div style={{ color: T.red, border: `1px solid ${T.red}`, padding: '6px 16px', fontSize: 11, letterSpacing: 2 }}>{t('verdictBlocked', lang)}</div>
            )}
            {calc.expectedCagr !== null && calc.cagrGate !== 'block' && (
              <div style={{ color: cagrColor, border: `1px solid ${cagrColor}`, padding: '6px 16px', fontSize: 11, letterSpacing: 2 }}>{t('verdictOk', lang)}</div>
            )}
          </div>
        </div>

        {/* 3 scenarios */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          {([['Bear', T.red, calc.bear], ['Base', T.yellow, calc.base], ['Bull', T.green, calc.bull]] as const).map(([label, color, s]) => (
            <div key={label} style={{ border: `1px solid ${color}33`, padding: '16px', background: `rgba(${hexRgb(color)},0.04)`, textAlign: 'center' }}>
              <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>{label}</div>
              <div style={{ color, fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                {s.expectedCagr !== null ? `${s.expectedCagr.toFixed(1)}%` : '—'}
              </div>
              <div style={{ color: T.textDim, fontSize: 9 }}>
                {s.notes.map((n, i) => <div key={i}>{n}</div>)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <SectionHeader label="CURRENT DATA" color={T.amber} />
            <NumericInput label="Current Revenue" value={assumptions.currentRevenue} onChange={upd('currentRevenue')} unit="$M" placeholder="60922" accent={T.amber} />
            <NumericInput label="Current FCF" value={assumptions.currentFcf} onChange={upd('currentFcf')} unit="$M" placeholder="26000" accent={T.amber} />
            <NumericInput label="Current Enterprise Value" value={assumptions.currentEnterpriseValue} onChange={upd('currentEnterpriseValue')} unit="$M" placeholder="1180000" accent={T.amber} />
          </div>
          <div>
            <SectionHeader label="ASSUMPTIONS (BASE CASE)" color={T.amber} />
            <NumericInput label="Revenue Growth Rate" value={assumptions.baseRevenueGrowth} onChange={upd('baseRevenueGrowth')} unit="% CAGR" placeholder="20.0" accent={T.amber} />
            <NumericInput label="FCF Margin (target)" value={assumptions.baseFcfMargin} onChange={upd('baseFcfMargin')} unit="%" placeholder="35.0" accent={T.amber} />
            <NumericInput label="Exit EV/FCF Multiple" value={assumptions.exitMultiple} onChange={upd('exitMultiple')} unit="x" placeholder="40.0" accent={T.amber} />
            <NumericInput label="Investment Period" value={assumptions.years} onChange={v => upd('years')(v)} unit="years" placeholder="3" accent={T.amber} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={handleSave} loading={loading} accent={T.amber}>{t('saveValuation', lang)}</Button>
        </div>
        {savedAt && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {savedAt.slice(0, 16)}</div>}
      </PageLayout>
    </div>
  )
}
