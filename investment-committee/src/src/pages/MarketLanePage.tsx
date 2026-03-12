import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, NumericInput, Textarea, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { marketAnalysisRepository } from '../db/repositories'
import { calculateMarketOutputs, buildMarketSummary } from '../lib/calculators'
import type { MarketLaneInput, MarketAnalysis } from '../types/domain'

const EMPTY: MarketLaneInput = {
  analystRevenueConsensusGrowth: null, analystEpsConsensus: null, analystCount: null,
  currentEvEbitda: null, currentPer: null, historicalEvEbitdaMin: null, historicalEvEbitdaMax: null,
  shortInterestPct: null, institutionalOwnershipPct: null, ownershipNote: null,
  userRevenueGrowthForecast: null,
}

const PRESSURE_COLOR: Record<string, string> = { low: T.green, medium: T.yellow, high: T.red }

export default function MarketLanePage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()
  const [input, setInput] = useState<MarketLaneInput>(EMPTY)
  const [saved, setSaved] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    marketAnalysisRepository.getLatest(companyId).then(d => {
      if (d) { setSaved(d); setInput(d.input) }
    })
  }, [companyId])

  const liveOutputs = calculateMarketOutputs(input)

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const outputs = calculateMarketOutputs(input)
      const summary = buildMarketSummary(input, outputs)
      const d = await marketAnalysisRepository.save({ companyId, input, outputs, summary, computedAt: new Date().toISOString() })
      setSaved(d)
      showToast('Market Lane saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  function upd(key: keyof MarketLaneInput) {
    return (v: number | null) => setInput(p => ({ ...p, [key]: v }))
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('marketTitle', lang)} subtitle={`${company?.ticker ?? ''} / MARKET`}>
        <div style={{ border: `1px solid ${T.green}22`, borderLeft: `2px solid ${T.green}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.green)},0.03)` }}>
          <div style={{ color: T.green, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>EXPECTATION GAP</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            Edge = ユーザー予測 − 市場コンセンサス。コンセンサスはBloomberg/FactSet等から手動入力。
          </div>
        </div>

        {/* Live outputs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Expectation Gap', value: liveOutputs.marketExpectationGap !== null ? `${liveOutputs.marketExpectationGap > 0 ? '+' : ''}${liveOutputs.marketExpectationGap.toFixed(1)}%` : '—', color: liveOutputs.marketExpectationGap !== null ? (liveOutputs.marketExpectationGap > 5 ? T.green : liveOutputs.marketExpectationGap < -5 ? T.red : T.yellow) : T.textDim },
            { label: 'Valuation Pressure', value: liveOutputs.valuationPressure.toUpperCase(), color: PRESSURE_COLOR[liveOutputs.valuationPressure] },
            { label: 'Sentiment Risk', value: liveOutputs.sentimentRisk.toUpperCase(), color: PRESSURE_COLOR[liveOutputs.sentimentRisk] },
            { label: 'Consensus Dependency', value: liveOutputs.consensusDependency.toUpperCase(), color: PRESSURE_COLOR[liveOutputs.consensusDependency] },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ border: `1px solid ${color}33`, padding: '14px 16px', background: `rgba(${hexRgb(color)},0.05)`, textAlign: 'center' }}>
              <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>{label}</div>
              <div style={{ color, fontSize: 14, fontWeight: 700, fontFamily: "'Courier New',monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <SectionHeader label="CONSENSUS（アナリスト予測）" color={T.green} />
            <NumericInput label="Revenue Growth Consensus" value={input.analystRevenueConsensusGrowth} onChange={upd('analystRevenueConsensusGrowth')} unit="% YoY" placeholder="18.0" accent={T.green} />
            <NumericInput label="EPS Consensus" value={input.analystEpsConsensus} onChange={upd('analystEpsConsensus')} unit="$" placeholder="2.85" accent={T.green} />
            <NumericInput label="Analyst Count" value={input.analystCount} onChange={upd('analystCount')} unit="人" placeholder="42" accent={T.green} />

            <SectionHeader label="USER FORECAST（自分の予測）" color={T.cyan} />
            <NumericInput label="Revenue Growth Forecast" value={input.userRevenueGrowthForecast} onChange={upd('userRevenueGrowthForecast')} unit="% YoY" placeholder="28.0" accent={T.cyan} />
            <div style={{ color: T.textDim, fontSize: 10, marginTop: -8, marginBottom: 14, lineHeight: 1.6 }}>
              Gap = 自分の予測 − コンセンサス。正値＝強気、負値＝弱気
            </div>
          </div>
          <div>
            <SectionHeader label="VALUATION（バリュエーション水準）" color={T.amber} />
            <NumericInput label="Current EV/EBITDA" value={input.currentEvEbitda} onChange={upd('currentEvEbitda')} unit="x" placeholder="65.0" accent={T.amber} />
            <NumericInput label="Current PER" value={input.currentPer} onChange={upd('currentPer')} unit="x" placeholder="45.0" accent={T.amber} />
            <NumericInput label="Historical EV/EBITDA Min" value={input.historicalEvEbitdaMin} onChange={upd('historicalEvEbitdaMin')} unit="x" placeholder="20.0" accent={T.amber} />
            <NumericInput label="Historical EV/EBITDA Max" value={input.historicalEvEbitdaMax} onChange={upd('historicalEvEbitdaMax')} unit="x" placeholder="80.0" accent={T.amber} />

            <SectionHeader label="SENTIMENT" color={T.red} />
            <NumericInput label="Short Interest" value={input.shortInterestPct} onChange={upd('shortInterestPct')} unit="%" placeholder="2.1" accent={T.red} />
            <NumericInput label="Institutional Ownership" value={input.institutionalOwnershipPct} onChange={upd('institutionalOwnershipPct')} unit="%" placeholder="78.0" accent={T.red} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={handleSave} loading={loading} accent={T.green}>{t('saveMarketLane', lang)}</Button>
        </div>
        {saved && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {saved.computedAt.slice(0, 16)}</div>}
      </PageLayout>
    </div>
  )
}
