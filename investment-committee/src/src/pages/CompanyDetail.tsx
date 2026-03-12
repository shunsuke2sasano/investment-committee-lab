import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, NavLink } from 'react-router-dom'
import { T, hexRgb, SectionHeader, Button, VerdictBadge, InfoRow } from '../components/common/ui'
import { useStore } from '../state/store'
import { thesisRepository, verdictRepository } from '../db/repositories'
import { t } from '../lib/i18n'
import type { ThesisAnalysis, VerdictReport } from '../types/domain'

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const companies = useStore(s => s.companies)
  const lang = useStore(s => s.lang)
  const company = companies.find(c => c.id === id)

  const [thesis, setThesis] = useState<ThesisAnalysis | null>(null)
  const [verdict, setVerdict] = useState<VerdictReport | null>(null)

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
    thesisRepository.getLatest(id).then(t => setThesis(t ?? null))
    verdictRepository.getLatest(id).then(v => setVerdict(v ?? null))
  }, [id])

  if (!company) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontSize: 12, letterSpacing: 3 }}>
        {t('caseNotFound', lang)}
      </div>
    )
  }

  const statusColor: Record<string, string> = { draft: T.textDim, active: T.cyan, archived: T.slate }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${T.borderDim}`, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'rgba(6,10,14,0.6)', overflowY: 'auto' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${T.borderDim}` }}>
          <div style={{ color: T.cyan, fontSize: 16, fontWeight: 700, letterSpacing: 3, marginBottom: 2 }}>{company.ticker}</div>
          <div style={{ color: T.textDim, fontSize: 10, lineHeight: 1.4 }}>{company.companyName}</div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: statusColor[company.status], fontSize: 9, letterSpacing: 2 }}>{company.status.toUpperCase()}</span>
            {verdict && <VerdictBadge verdict={verdict.verdict} />}
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

        {TABS.map(tab => (
          <NavLink key={tab.key} to={`/companies/${id}/${tab.key}`} style={({ isActive }) => ({
            padding: '11px 16px', borderBottom: `1px solid ${T.borderDim}`,
            borderLeft: `2px solid ${isActive ? tab.color : 'transparent'}`,
            background: isActive ? `rgba(${hexRgb(tab.color)},0.06)` : 'transparent',
            color: isActive ? T.text : T.textDim, fontSize: 11, textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s',
          })}>
            <span style={{ color: T.textMid, fontSize: 9 }}>{tab.num}</span>
            {tab.label}
          </NavLink>
        ))}

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
              <InfoRow label="Price" value={company.currentPrice ? `$${company.currentPrice}` : '—'} />
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

          <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', background: '#080D12' }}>
            <SectionHeader label={t('analysisPipeline', lang)} color={T.orange} />
            <div style={{ display: 'flex', gap: 0 }}>
              {TABS.map((tab, i) => (
                <div key={tab.key} style={{ display: 'flex', alignItems: 'center' }}>
                  <div onClick={() => navigate(`/companies/${id}/${tab.key}`)} title={tab.label}
                    style={{ width: 28, height: 28, border: `1px solid ${tab.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textMid, fontSize: 10, cursor: 'pointer', background: `rgba(${hexRgb(tab.color)},0.04)`, transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tab.color; (e.currentTarget as HTMLElement).style.color = tab.color }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = `${tab.color}33`; (e.currentTarget as HTMLElement).style.color = T.textMid }}>
                    {tab.num}
                  </div>
                  {i < TABS.length - 1 && <div style={{ width: 16, height: 1, background: T.borderDim }} />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
