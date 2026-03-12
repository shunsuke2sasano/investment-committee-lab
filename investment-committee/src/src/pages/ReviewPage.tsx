import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  T, Button, PageLayout, SectionHeader, hexRgb
} from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import {
  thesisRepository, dataAnalysisRepository, marketAnalysisRepository,
  valuationRepository, reviewRepository
} from '../db/repositories'
import { runReviewEngine } from '../features/reviewEngine/service'
import type { ReviewReport, ReviewRisk } from '../types/domain'

const RISK_CATEGORY_LABEL: Record<string, string> = {
  demand_risk: 'Demand Risk',
  competition_risk: 'Competition Risk',
  margin_risk: 'Margin Risk',
  balance_sheet_risk: 'Balance Sheet Risk',
  execution_risk: 'Execution Risk',
  regulation_risk: 'Regulation Risk',
  multiple_compression: 'Multiple Compression',
  narrative_risk: 'Narrative Risk',
}

const SEVERITY_COLOR = (s: number) =>
  s >= 4 ? T.red : s >= 3 ? T.orange : s >= 2 ? T.yellow : T.textDim

const MISMATCH_COLOR: Record<string, string> = {
  thesis_data: T.yellow,
  data_market: T.orange,
  thesis_market: T.red,
}

const MISMATCH_LABEL: Record<string, string> = {
  thesis_data: 'Thesis ↔ Data',
  data_market: 'Data ↔ Market',
  thesis_market: 'Thesis ↔ Market',
}

export default function ReviewPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [report, setReport] = useState<ReviewReport | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    reviewRepository.getLatest(companyId).then(r => setReport(r ?? null))
  }, [companyId])

  async function handleRun() {
    if (!companyId || !company) return
    setLoading(true)
    try {
      const [thesis, dataLane, marketLane, valuation] = await Promise.all([
        thesisRepository.getLatest(companyId),
        dataAnalysisRepository.getLatest(companyId),
        marketAnalysisRepository.getLatest(companyId),
        valuationRepository.getLatest(companyId),
      ])
      const payload = {
        company: {
          ticker: company.ticker,
          name: company.companyName,
          sector: company.sector,
          horizonMonths: company.investmentHorizonMonths,
        },
        thesis: thesis ?? null,
        dataLane: dataLane ?? null,
        marketLane: marketLane ?? null,
        valuation: valuation ?? null,
      }
      const result = await runReviewEngine(payload)
      const saved = await reviewRepository.save({ ...result, companyId })
      setReport(saved)
      showToast('AI Review complete', 'success')
    } catch (e: any) {
      showToast(`Error: ${e.message}`, 'error')
    }
    setLoading(false)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('reviewTitle', lang)}
        subtitle={`${company?.ticker ?? ''} / STRUCTURED REVIEWER`}
        actions={
          <Button onClick={handleRun} loading={loading} accent={T.red}>
            {report ? t('reRunReview', lang) : t('runReview', lang)}
          </Button>
        }
      >
        {/* Role explanation */}
        <div style={{ border: `1px solid ${T.red}33`, borderLeft: `2px solid ${T.red}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.red)},0.04)` }}>
          <div style={{ color: T.red, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>{t('reviewNoteTitle', lang)}</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            AIは3レーン（Thesis/Data/Market）を独立して査読します。BUY/SELL判断はしません。
            欠損情報の特定・レーン間の矛盾検出・見落としリスクの抽出のみを行います。
          </div>
        </div>

        {!report && !loading && (
          <div style={{ color: T.textDim, fontSize: 12, letterSpacing: 3, textAlign: 'center', marginTop: 60 }}>
            Thesis / Data / Market Laneを入力後、RUN REVIEWを実行してください
          </div>
        )}

        {report && (
          <>
            <div style={{ color: T.textDim, fontSize: 10, marginBottom: 20 }}>
              Generated: {report.createdAt.slice(0, 16)} | Model: {report.model}
            </div>

            {/* Missing items */}
            {report.missingItems.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionHeader label="MISSING ITEMS" color={T.orange} />
                {report.missingItems.map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 14px', borderBottom: `1px solid ${T.borderDim}`, alignItems: 'flex-start' }}>
                    <span style={{ color: T.orange, fontSize: 10, marginTop: 2, flexShrink: 0 }}>⚠</span>
                    <span style={{ color: T.text, fontSize: 12, lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Mismatches */}
            {report.mismatches.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionHeader label="LANE MISMATCHES（矛盾検出）" color={T.yellow} />
                <div style={{ marginBottom: 10, color: T.textDim, fontSize: 10 }}>
                  どちらのレーンが疑わしいかを確認し、入力値を見直してください。
                </div>
                {report.mismatches.map((m, i) => (
                  <div key={i} style={{ border: `1px solid ${MISMATCH_COLOR[m.type]}33`, borderLeft: `3px solid ${MISMATCH_COLOR[m.type]}`, padding: '12px 16px', marginBottom: 10, background: `rgba(${hexRgb(MISMATCH_COLOR[m.type])},0.04)` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ color: MISMATCH_COLOR[m.type], fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                        {MISMATCH_LABEL[m.type]}
                      </span>
                      <span style={{ color: T.textDim, fontSize: 9, border: `1px solid ${T.borderDim}`, padding: '2px 8px' }}>
                        疑わしい側: {m.likelySource}
                      </span>
                    </div>
                    <div style={{ color: T.text, fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{m.title}</div>
                    <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>{m.detail}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Risks */}
            {report.risks.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionHeader label="RISK REGISTER" color={T.red} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {report.risks
                    .sort((a, b) => b.severity - a.severity)
                    .map((risk, i) => (
                      <RiskCard key={i} risk={risk} />
                    ))}
                </div>
              </div>
            )}

            {/* Scenario notes */}
            {report.scenarioNotes.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionHeader label="SCENARIO NOTES" color={T.cyan} />
                {report.scenarioNotes.map((note, i) => (
                  <div key={i} style={{ padding: '8px 14px', borderBottom: `1px solid ${T.borderDim}`, color: T.text, fontSize: 12, lineHeight: 1.6 }}>
                    {note}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </PageLayout>
    </div>
  )
}

function RiskCard({ risk }: { risk: ReviewRisk }) {
  const col = SEVERITY_COLOR(risk.severity)
  return (
    <div style={{ border: `1px solid ${col}33`, padding: '14px 16px', background: `rgba(${hexRgb(col)},0.04)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: T.textDim, fontSize: 9, letterSpacing: 2 }}>
          {RISK_CATEGORY_LABEL[risk.category] ?? risk.category}
        </span>
        <span style={{ color: col, fontSize: 11, fontWeight: 700 }}>
          SEV {risk.severity}/5
        </span>
      </div>
      <div style={{ color: T.text, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{risk.title}</div>
      <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>{risk.detail}</div>
    </div>
  )
}
