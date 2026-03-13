import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import { T, hexRgb, SectionHeader, Button, VerdictBadge, InfoRow } from '../components/common/ui'
import { useStore } from '../state/store'
import {
  thesisRepository, verdictRepository,
  dataAnalysisRepository, marketAnalysisRepository,
  reviewRepository, valuationRepository, monitoringRepository,
  companyRepository,
} from '../db/repositories'
import { t } from '../lib/i18n'
import type { ThesisAnalysis, VerdictReport, ThesisStatus } from '../types/domain'
import { isJapaneseStock, fetchFmpProfile } from '../lib/fmpClient'

// Pipeline lanes that get completion badges (excludes Monitoring / Lessons)
const PIPELINE_KEYS = ['thesis', 'data', 'market', 'review', 'valuation', 'verdict'] as const
type PipelineKey = typeof PIPELINE_KEYS[number]

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const companies = useStore(s => s.companies)
  const lang = useStore(s => s.lang)
  const { settings, upsertCompany, showToast } = useStore()
  const company = companies.find(c => c.id === id)
  const [priceLoading, setPriceLoading] = useState(false)

  const fmpKey = settings?.fmpApiKey ?? ''
  const hasFmpKey = fmpKey.trim().length > 0

  async function handleUpdatePrice() {
    if (!company) return
    if (isJapaneseStock(company.ticker)) { showToast(t('fmpJpSkip', lang), 'error'); return }
    setPriceLoading(true)
    try {
      const profile = await fetchFmpProfile(company.ticker, fmpKey)
      if (profile.price != null) {
        const updated = await companyRepository.update(company.id, { currentPrice: profile.price })
        if (updated) upsertCompany(updated)
        showToast(t('fmpFetchSuccess', lang), 'success')
      }
    } catch {
      showToast(t('fmpFetchError', lang), 'error')
    }
    setPriceLoading(false)
  }

  const [thesis, setThesis] = useState<ThesisAnalysis | null>(null)
  const [verdict, setVerdict] = useState<VerdictReport | null>(null)
  const [completion, setCompletion] = useState<Record<PipelineKey, boolean>>({
    thesis: false, data: false, market: false,
    review: false, valuation: false, verdict: false,
  })
  const [thesisStatus, setThesisStatus] = useState<ThesisStatus | null>(null)

  const TABS = [
    { key: 'thesis',     label: t('tab_thesis', lang),     color: T.purple, num: '①' },
    { key: 'data',       label: t('tab_data', lang),       color: T.yellow, num: '②' },
    { key: 'market',     label: t('tab_market', lang),     color: T.green,  num: '③' },
    { key: 'review',     label: t('tab_review', lang),     color: T.red,    num: '④' },
    { key: 'valuation',  label: t('tab_valuation', lang),  color: T.amber,  num: '⑤' },
    { key: 'verdict',    label: t('tab_verdict', lang),    color: T.pink,   num: '⑥' },
    { key: 'monitoring', label: t('tab_monitoring', lang), color: T.sky,    num: '⑦' },
    { key: 'lessons',    label: t('tab_lessons', lang),    color: T.slate,  num: '⑧' },
  ]

  useEffect(() => {
    if (!id) return
    Promise.all([
      thesisRepository.getLatest(id),
      dataAnalysisRepository.getLatest(id),
      marketAnalysisRepository.getLatest(id),
      reviewRepository.getLatest(id),
      valuationRepository.getLatest(id),
      verdictRepository.getLatest(id),
      monitoringRepository.get(id),
    ]).then(([thesisData, data, market, review, valuation, verdictData, monitoring]) => {
      setThesis(thesisData ?? null)
      setVerdict(verdictData ?? null)
      setCompletion({
        thesis:    !!thesisData,
        data:      !!data,
        market:    !!market,
        review:    !!review,
        valuation: !!valuation,
        verdict:   !!verdictData,
      })
      setThesisStatus(monitoring?.thesisStatus ?? null)
    })
  }, [id])

  if (!company) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontSize: 12, letterSpacing: 3 }}>
        {t('caseNotFound', lang)}
      </div>
    )
  }

  const statusColor: Record<string, string> = { draft: T.textDim, active: T.cyan, archived: T.slate }
  const doneCount = PIPELINE_KEYS.filter(k => completion[k]).length
  const totalCount = PIPELINE_KEYS.length
  const progressPct = (doneCount / totalCount) * 100
  const progressColor = doneCount === totalCount ? T.green : doneCount >= 4 ? T.yellow : T.amber

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${T.borderDim}`, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(6,10,14,0.6)', overflowY: 'auto' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${T.borderDim}` }}>
          <div style={{ color: T.cyan, fontSize: 16, fontWeight: 700, letterSpacing: 3, marginBottom: 2 }}>{company.ticker}</div>
          <div style={{ color: T.textDim, fontSize: 10, lineHeight: 1.4 }}>{company.companyName}</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: statusColor[company.status], fontSize: 9, letterSpacing: 2 }}>{company.status.toUpperCase()}</span>
            {verdict && <VerdictBadge verdict={verdict.verdict} />}
          </div>
          {(thesisStatus === 'broken' || thesisStatus === 'warning') && (
            <div style={{
              marginTop: 8,
              color: thesisStatus === 'broken' ? T.red : T.yellow,
              border: `1px solid ${thesisStatus === 'broken' ? T.red : T.yellow}`,
              background: `rgba(${hexRgb(thesisStatus === 'broken' ? T.red : T.yellow)},0.1)`,
              fontSize: 9, letterSpacing: 2, padding: '3px 8px',
              fontFamily: "'Courier New',monospace",
              display: 'inline-block',
            }}>
              {thesisStatus === 'broken' ? t('thesisBroken', lang) : t('thesisAtRisk', lang)}
            </div>
          )}
          {/* Mini progress in sidebar header */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: T.textMid, fontSize: 8, letterSpacing: 2 }}>PIPELINE</span>
              <span style={{ color: progressColor, fontSize: 8, fontFamily: "'Courier New',monospace" }}>{doneCount}/{totalCount}</span>
            </div>
            <div style={{ height: 2, background: T.borderDim, borderRadius: 1 }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: progressColor, borderRadius: 1, transition: 'width 0.3s' }} />
            </div>
          </div>
        </div>

        <NavLink to={`/companies/${id}`} end style={({ isActive }) => ({
          padding: '11px 16px', borderBottom: `1px solid ${T.borderDim}`,
          borderLeft: `2px solid ${isActive ? T.cyan : 'transparent'}`,
          background: isActive ? `rgba(${hexRgb(T.cyan)},0.06)` : 'transparent',
          color: isActive ? T.text : T.textDim, fontSize: 11, textDecoration: 'none',
          display: 'block', transition: 'all 0.15s',
        })}>
          {t('overview', lang)}
        </NavLink>

        {TABS.map(tab => {
          const isPipeline = (PIPELINE_KEYS as readonly string[]).includes(tab.key)
          const done = isPipeline ? completion[tab.key as PipelineKey] : undefined
          return (
            <NavLink key={tab.key} to={`/companies/${id}/${tab.key}`} style={({ isActive }) => ({
              padding: '11px 16px', borderBottom: `1px solid ${T.borderDim}`,
              borderLeft: `2px solid ${isActive ? tab.color : 'transparent'}`,
              background: isActive ? `rgba(${hexRgb(tab.color)},0.06)` : 'transparent',
              color: isActive ? T.text : T.textDim, fontSize: 11, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
            })}>
              <span style={{ color: T.textMid, fontSize: 9 }}>{tab.num}</span>
              <span style={{ flex: 1 }}>{tab.label}</span>
              {isPipeline && (
                <span style={{
                  color: done ? T.green : T.textMid,
                  fontSize: 10, lineHeight: 1,
                  transition: 'color 0.15s',
                }}>
                  {done ? '✓' : '○'}
                </span>
              )}
            </NavLink>
          )
        })}

        <div style={{ marginTop: 'auto', padding: 12, borderTop: `1px solid ${T.borderDim}` }}>
          <Button onClick={() => navigate('/companies')} variant="ghost" size="sm" accent={T.slate} fullWidth>
            {t('backToCases', lang)}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '28px 36px' }}>
          <div style={{ marginBottom: 8, color: T.textDim, fontSize: 9, letterSpacing: 5 }}>{t('overviewSubtitle', lang)}</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, margin: '0 0 24px', color: T.text }}>{company.ticker} — {company.companyName}</h1>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', background: '#080D12' }}>
              <SectionHeader label={t('companyInfo', lang)} color={T.cyan} />
              <InfoRow label="Sector" value={company.sector ?? '—'} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <InfoRow label="Price" value={company.currentPrice ? `$${company.currentPrice}` : '—'} />
                <button
                  type="button"
                  onClick={hasFmpKey ? handleUpdatePrice : undefined}
                  disabled={!hasFmpKey || priceLoading || isJapaneseStock(company.ticker)}
                  title={hasFmpKey ? t('fmpUpdatePriceBtn', lang) : t('fmpKeyMissing', lang)}
                  style={{
                    padding: '3px 10px', cursor: hasFmpKey ? 'pointer' : 'not-allowed',
                    background: 'transparent',
                    border: `1px solid ${hasFmpKey ? T.green : T.borderDim}`,
                    color: hasFmpKey ? T.green : T.textDim,
                    fontFamily: "'Courier New', monospace",
                    fontSize: 8, letterSpacing: 1,
                    opacity: hasFmpKey ? 1 : 0.4,
                    flexShrink: 0,
                  }}
                >
                  {priceLoading ? '…' : t('fmpUpdatePriceBtn', lang)}
                </button>
              </div>
              <InfoRow label="Mkt Cap" value={company.marketCap ? `$${(company.marketCap / 1000).toFixed(1)}B` : '—'} />
              <InfoRow label="EV" value={company.enterpriseValue ? `$${(company.enterpriseValue / 1000).toFixed(1)}B` : '—'} />
              <InfoRow label="Horizon" value={`${company.investmentHorizonMonths}mo`} />
            </div>

            <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', background: '#080D12' }}>
              <SectionHeader label={t('verdictLabel', lang)} color={T.pink} />
              {verdict ? (
                <>
                  <div style={{ marginBottom: 12 }}><VerdictBadge verdict={verdict.verdict} /></div>
                  <InfoRow label={t('totalScore', lang)} value={`${verdict.totalScore}/40`} />
                  <InfoRow label={t('vetoCount', lang)} value={`${verdict.vetoCount}`} color={verdict.vetoCount >= 2 ? T.red : T.text} />
                  <InfoRow label={t('profile', lang)} value={verdict.profileUsed.label} />
                  <div style={{ color: T.textDim, fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>{verdict.rationale.slice(0, 120)}…</div>
                </>
              ) : <div style={{ color: T.textDim, fontSize: 11, marginTop: 8 }}>{t('verdictNotCreated', lang)}</div>}
            </div>
          </div>

          <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', background: '#080D12', marginBottom: 24 }}>
            <SectionHeader label={t('investmentThesis', lang)} color={T.purple} />
            {thesis ? (
              <>
                <div style={{ color: T.text, fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>{thesis.thesisText}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {thesis.drivers.map((d, i) => (
                    <span key={i} style={{ border: `1px solid ${T.borderDim}`, color: T.textDim, fontSize: 10, padding: '2px 10px' }}>{d}</span>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ color: T.textDim, fontSize: 11 }}>
                {t('thesisNotCreated', lang)}
                <span style={{ color: T.cyan, cursor: 'pointer' }} onClick={() => navigate(`/companies/${id}/thesis`)}>
                  {t('createThesis', lang)}
                </span>
              </div>
            )}
          </div>

          {/* Analysis Pipeline with progress */}
          <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', background: '#080D12' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <SectionHeader label={t('analysisPipeline', lang)} color={T.orange} />
              <span style={{ color: progressColor, fontSize: 10, fontFamily: "'Courier New',monospace", letterSpacing: 2, marginTop: -8 }}>
                {t('pipelineProgress', lang, { done: doneCount, total: totalCount })}
              </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: T.borderDim, marginBottom: 16, borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: progressColor, borderRadius: 2, transition: 'width 0.4s' }} />
            </div>

            {/* Pipeline lane tiles (only 6 pipeline lanes) */}
            <div style={{ display: 'flex', gap: 0 }}>
              {TABS.filter(tab => (PIPELINE_KEYS as readonly string[]).includes(tab.key)).map((tab, i, arr) => {
                const done = completion[tab.key as PipelineKey]
                return (
                  <div key={tab.key} style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                      onClick={() => navigate(`/companies/${id}/${tab.key}`)}
                      title={tab.label}
                      style={{
                        width: 52, padding: '8px 4px',
                        border: `1px solid ${done ? tab.color : `${tab.color}33`}`,
                        background: done ? `rgba(${hexRgb(tab.color)},0.1)` : `rgba(${hexRgb(tab.color)},0.03)`,
                        cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tab.color }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = done ? tab.color : `${tab.color}33` }}
                    >
                      <div style={{ color: done ? tab.color : T.textMid, fontSize: 9, marginBottom: 4 }}>{tab.num}</div>
                      <div style={{ color: done ? T.green : T.textMid, fontSize: 13, lineHeight: 1 }}>
                        {done ? '✓' : '○'}
                      </div>
                      <div style={{ color: done ? tab.color : T.textMid, fontSize: 8, marginTop: 4, letterSpacing: 0.5 }}>
                        {tab.label.split(' ')[0]}
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div style={{ width: 12, height: 1, background: done ? `${tab.color}66` : T.borderDim, transition: 'background 0.15s' }} />
                    )}
                  </div>
                )
              })}

              {/* Supplementary tabs (Monitoring / Lessons) — no badge, compact */}
              {TABS.filter(tab => !(PIPELINE_KEYS as readonly string[]).includes(tab.key)).map((tab, i, arr) => (
                <div key={tab.key} style={{ display: 'flex', alignItems: 'center' }}>
                  {i === 0 && <div style={{ width: 20, height: 1, background: T.borderDim, borderStyle: 'dashed' }} />}
                  <div
                    onClick={() => navigate(`/companies/${id}/${tab.key}`)}
                    title={tab.label}
                    style={{
                      width: 36, padding: '8px 4px',
                      border: `1px solid ${tab.color}22`,
                      background: 'transparent',
                      cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${tab.color}66` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${tab.color}22` }}
                  >
                    <div style={{ color: T.textMid, fontSize: 9, marginBottom: 2 }}>{tab.num}</div>
                    <div style={{ color: T.textMid, fontSize: 8, letterSpacing: 0.5 }}>{tab.label.split(' ')[0]}</div>
                  </div>
                  {i < arr.length - 1 && <div style={{ width: 4, height: 1, background: T.borderDim }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
