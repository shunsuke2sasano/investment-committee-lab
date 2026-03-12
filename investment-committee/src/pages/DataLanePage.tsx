import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, NumericInput, Button, PageLayout, SectionHeader, ScoreBadge, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { dataAnalysisRepository } from '../db/repositories'
import { calculateDataScores, buildDataSummary } from '../lib/calculators'
import type { DataLaneInput, DataAnalysis } from '../types/domain'

const EMPTY_INPUT: DataLaneInput = {
  revenueGrowthYoy: null, revenueGrowth3y: null,
  grossMargin: null, operatingMargin: null, fcfMargin: null,
  roic: null, debtToEbitda: null, netDebtToEquity: null,
  shareDilutionAnnual: null, reinvestmentRate: null, currentRatio: null,
}

export default function DataLanePage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()
  const [input, setInput] = useState<DataLaneInput>(EMPTY_INPUT)
  const [saved, setSaved] = useState<DataAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    dataAnalysisRepository.getLatest(companyId).then(d => {
      if (d) { setSaved(d); setInput(d.input) }
    })
  }, [companyId])

  const liveScores = calculateDataScores(input)
  const filledCount = Object.values(input).filter(v => v !== null).length

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const scores = calculateDataScores(input)
      const summary = buildDataSummary(scores, input)
      const d = await dataAnalysisRepository.save({ companyId, input, scores, summary, computedAt: new Date().toISOString() })
      setSaved(d)
      showToast('Data Lane saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  function upd(key: keyof DataLaneInput) { return (v: number | null) => setInput(p => ({ ...p, [key]: v })) }

  const scoreColor = (s: number) => s >= 4 ? T.green : s >= 3 ? T.yellow : T.red

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('dataTitle', lang)} subtitle={`${company?.ticker ?? ''} / DATA`}>
        <div style={{ border: `1px solid ${T.yellow}22`, borderLeft: `2px solid ${T.yellow}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.yellow)},0.03)` }}>
          <div style={{ color: T.yellow, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>{t('dataLaneNoteTitle', lang)}</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            財務データから独立してスコアを算出します。Thesisの内容はスコア計算に影響しません。
            入力値 {filledCount}/11 — 欠損値はスコアに反映されません。
          </div>
        </div>

        {/* Live scores */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Business Quality', score: liveScores.businessQuality },
            { label: 'Capital Efficiency', score: liveScores.capitalEfficiency },
            { label: 'Balance Sheet Safety', score: liveScores.balanceSheetSafety },
            { label: 'Cash Generation', score: liveScores.cashGeneration },
          ].map(({ label, score }) => (
            <div key={label} style={{ border: `1px solid ${scoreColor(score)}33`, padding: '14px 16px', background: `rgba(${hexRgb(scoreColor(score))},0.05)`, textAlign: 'center' }}>
              <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>{label}</div>
              <ScoreBadge score={score} />
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <SectionHeader label={t('growth', lang)} color={T.yellow} />
            <NumericInput label="Revenue Growth YoY" value={input.revenueGrowthYoy} onChange={upd('revenueGrowthYoy')} unit="%" placeholder="22.5" accent={T.yellow} />
            <NumericInput label="Revenue Growth 3Y CAGR" value={input.revenueGrowth3y} onChange={upd('revenueGrowth3y')} unit="%" placeholder="35.0" accent={T.yellow} />
            <NumericInput label="Gross Margin" value={input.grossMargin} onChange={upd('grossMargin')} unit="%" placeholder="78.0" accent={T.yellow} />
            <NumericInput label="Operating Margin" value={input.operatingMargin} onChange={upd('operatingMargin')} unit="%" placeholder="54.0" accent={T.yellow} />

            <SectionHeader label={t('cashFlow', lang)} color={T.green} />
            <NumericInput label="FCF Margin" value={input.fcfMargin} onChange={upd('fcfMargin')} unit="%" placeholder="35.0" accent={T.green} />
            <NumericInput label="Reinvestment Rate" value={input.reinvestmentRate} onChange={upd('reinvestmentRate')} unit="%" placeholder="30.0" accent={T.green} />
          </div>
          <div>
            <SectionHeader label={t('capitalEfficiency', lang)} color={T.cyan} />
            <NumericInput label="ROIC" value={input.roic} onChange={upd('roic')} unit="%" placeholder="45.0" accent={T.cyan} />
            <NumericInput label="Share Dilution Annual" value={input.shareDilutionAnnual} onChange={upd('shareDilutionAnnual')} unit="% / yr" placeholder="1.2" accent={T.cyan} />

            <SectionHeader label={t('balanceSheet', lang)} color={T.red} />
            <NumericInput label="Net Debt / EBITDA" value={input.debtToEbitda} onChange={upd('debtToEbitda')} unit="x" placeholder="-1.5 (net cash)" accent={T.red} />
            <NumericInput label="Net Debt / Equity" value={input.netDebtToEquity} onChange={upd('netDebtToEquity')} unit="x" placeholder="-0.3" accent={T.red} />
            <NumericInput label="Current Ratio" value={input.currentRatio} onChange={upd('currentRatio')} unit="x" placeholder="4.2" accent={T.red} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={handleSave} loading={loading} accent={T.yellow}>{t('saveDataLane', lang)}</Button>
        </div>
        {saved && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {saved.computedAt.slice(0, 16)}</div>}
      </PageLayout>
    </div>
  )
}
