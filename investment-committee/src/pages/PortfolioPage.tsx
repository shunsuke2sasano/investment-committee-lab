import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { T, hexRgb, VerdictBadge, PageLayout } from '../components/common/ui'
import { useStore } from '../state/store'
import { verdictRepository, valuationRepository } from '../db/repositories'
import type { VerdictReport, ValuationReport, VerdictResult } from '../types/domain'
import { t } from '../lib/i18n'

type SortKey = 'score' | 'cagr' | 'ticker'
type SortDir = 'asc' | 'desc'
type FilterTab = 'ALL' | VerdictResult

const AXIS_KEYS = [
  'businessQuality', 'growthQuality', 'capitalEfficiency', 'balanceSheetSafety',
  'valuationAttractiveness', 'marketExpectationGap', 'executionRisk', 'governance',
] as const

function axisColor(score: number): string {
  if (score >= 5) return T.green
  if (score >= 4) return T.yellow
  if (score >= 3) return T.orange
  return T.red
}

function AxisMiniBar({ axisScores }: { axisScores: VerdictReport['axisScores'] }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {AXIS_KEYS.map(key => {
        const axis = axisScores[key]
        const col = axisColor(axis.score)
        return (
          <div
            key={key}
            title={`${key}: ${axis.score}/5${axis.veto ? ' [VETO]' : ''}`}
            style={{
              width: 16, height: 16,
              background: `rgba(${hexRgb(col)},0.2)`,
              border: `1px solid ${axis.veto ? T.red : col}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 8, color: col, fontFamily: "'Courier New',monospace",
              flexShrink: 0,
            }}
          >
            {axis.score}
          </div>
        )
      })}
    </div>
  )
}

function DistBar({ label, count, max, color = T.cyan }: {
  label: string; count: number; max: number; color?: string
}) {
  const pct = max === 0 ? 0 : (count / max) * 100
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: T.textDim, fontSize: 10, letterSpacing: 1, fontFamily: "'Courier New',monospace" }}>{label}</span>
        <span style={{ color: T.text, fontSize: 10, fontFamily: "'Courier New',monospace" }}>{count}</span>
      </div>
      <div style={{ height: 3, background: T.borderDim, width: '100%' }}>
        <div style={{ height: 3, width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

const TAB_COLOR: Record<string, string> = {
  ALL: T.cyan, BUY: T.green, WATCH: T.yellow, PASS: T.red,
}

export default function PortfolioPage() {
  const navigate = useNavigate()
  const { companies, lang } = useStore()
  const [verdictMap, setVerdictMap] = useState<Map<string, VerdictReport>>(new Map())
  const [valuationMap, setValuationMap] = useState<Map<string, ValuationReport>>(new Map())
  const [filter, setFilter] = useState<FilterTab>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    Promise.all([
      verdictRepository.listLatestAll(),
      valuationRepository.listLatestAll(),
    ]).then(([vMap, valMap]) => {
      setVerdictMap(vMap)
      setValuationMap(valMap)
    })
  }, [companies])

  const rows = companies.map(c => ({
    company: c,
    verdict: verdictMap.get(c.id) ?? null,
    valuation: valuationMap.get(c.id) ?? null,
  }))

  const filtered = filter === 'ALL'
    ? rows
    : rows.filter(r => r.verdict?.verdict === filter)

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'ticker') {
      const cmp = a.company.ticker.localeCompare(b.company.ticker)
      return sortDir === 'asc' ? cmp : -cmp
    }
    const va = sortKey === 'score'
      ? (a.verdict?.totalScore ?? -1)
      : (a.valuation?.expectedCagr ?? -999)
    const vb = sortKey === 'score'
      ? (b.verdict?.totalScore ?? -1)
      : (b.valuation?.expectedCagr ?? -999)
    return sortDir === 'asc' ? va - vb : vb - va
  })

  const counts: Record<string, number> = {
    ALL: rows.length,
    BUY: rows.filter(r => r.verdict?.verdict === 'BUY').length,
    WATCH: rows.filter(r => r.verdict?.verdict === 'WATCH').length,
    PASS: rows.filter(r => r.verdict?.verdict === 'PASS').length,
  }

  // Sector distribution
  const sectorCounts = new Map<string, number>()
  filtered.forEach(r => {
    const s = r.company.sector ?? '—'
    sectorCounts.set(s, (sectorCounts.get(s) ?? 0) + 1)
  })
  const sectorEntries = [...sectorCounts.entries()].sort((a, b) => b[1] - a[1])
  const maxSector = Math.max(...sectorEntries.map(e => e[1]), 1)

  // Score distribution
  const scoreBuckets: Record<string, number> = { '35+': 0, '30-34': 0, '25-29': 0, '<25': 0 }
  filtered.forEach(r => {
    const s = r.verdict?.totalScore
    if (s == null) return
    if (s >= 35) scoreBuckets['35+']++
    else if (s >= 30) scoreBuckets['30-34']++
    else if (s >= 25) scoreBuckets['25-29']++
    else scoreBuckets['<25']++
  })
  const maxScore = Math.max(...Object.values(scoreBuckets), 1)

  // CAGR distribution
  const cagrBuckets: Record<string, number> = { '>20%': 0, '12-20%': 0, '<12%': 0, '—': 0 }
  filtered.forEach(r => {
    const c = r.valuation?.expectedCagr
    if (c == null) { cagrBuckets['—']++; return }
    if (c > 20) cagrBuckets['>20%']++
    else if (c >= 12) cagrBuckets['12-20%']++
    else cagrBuckets['<12%']++
  })
  const maxCagr = Math.max(...Object.values(cagrBuckets), 1)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const TABS: FilterTab[] = ['ALL', 'BUY', 'WATCH', 'PASS']

  const COL_GRID = '100px 1fr 120px 100px 64px 80px 68px 1fr'

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('portfolioTitle', lang)} subtitle={t('portfolioSubtitle', lang)}>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {TABS.map(tab => {
            const isActive = filter === tab
            const col = TAB_COLOR[tab]
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                style={{
                  background: isActive ? `rgba(${hexRgb(col)},0.1)` : 'transparent',
                  border: `1px solid ${isActive ? col : T.borderDim}`,
                  color: isActive ? col : T.textDim,
                  padding: '6px 16px',
                  cursor: 'pointer',
                  fontFamily: "'Courier New',monospace",
                  fontSize: 10,
                  letterSpacing: 3,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                {tab === 'ALL' ? t('portfolioFilterAll', lang) : tab}
                <span style={{
                  background: isActive ? `rgba(${hexRgb(col)},0.2)` : T.borderDim,
                  color: isActive ? col : T.textMid,
                  fontSize: 9,
                  padding: '1px 6px',
                  fontFamily: "'Courier New',monospace",
                }}>
                  {counts[tab]}
                </span>
              </button>
            )
          })}
        </div>

        {companies.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12, letterSpacing: 3, textAlign: 'center', marginTop: 60 }}>
            {t('portfolioEmpty', lang)}
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 16, marginBottom: 28 }}>
              {/* Sector */}
              <div style={{ border: `1px solid ${T.borderDim}`, background: '#080D12', padding: '16px 20px' }}>
                <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 14, fontFamily: "'Courier New',monospace" }}>
                  {t('portfolioSectorDist', lang)}
                </div>
                {sectorEntries.length === 0
                  ? <div style={{ color: T.textDim, fontSize: 10 }}>—</div>
                  : sectorEntries.slice(0, 6).map(([sector, count]) => (
                    <DistBar key={sector} label={sector} count={count} max={maxSector} color={T.cyan} />
                  ))
                }
              </div>

              {/* Score */}
              <div style={{ border: `1px solid ${T.borderDim}`, background: '#080D12', padding: '16px 20px' }}>
                <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 14, fontFamily: "'Courier New',monospace" }}>
                  {t('portfolioScoreDist', lang)}
                </div>
                {(['35+', '30-34', '25-29', '<25'] as const).map(b => (
                  <DistBar key={b} label={b} count={scoreBuckets[b]} max={maxScore} color={
                    b === '35+' ? T.green : b === '30-34' ? T.cyan : b === '25-29' ? T.yellow : T.red
                  } />
                ))}
              </div>

              {/* CAGR */}
              <div style={{ border: `1px solid ${T.borderDim}`, background: '#080D12', padding: '16px 20px' }}>
                <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 14, fontFamily: "'Courier New',monospace" }}>
                  {t('portfolioCAGRDist', lang)}
                </div>
                {(['>20%', '12-20%', '<12%', '—'] as const).map(b => (
                  <DistBar key={b} label={b} count={cagrBuckets[b]} max={maxCagr} color={
                    b === '>20%' ? T.green : b === '12-20%' ? T.yellow : b === '<12%' ? T.red : T.textDim
                  } />
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ border: `1px solid ${T.borderDim}` }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: COL_GRID,
                padding: '10px 16px',
                borderBottom: `1px solid ${T.borderDim}`,
                background: T.surface,
                alignItems: 'center',
              }}>
                {([
                  { key: 'ticker' as SortKey, label: t('portfolioColTicker', lang) },
                  { key: null, label: t('portfolioColCompany', lang) },
                  { key: null, label: t('portfolioColSector', lang) },
                  { key: null, label: t('portfolioColVerdict', lang) },
                  { key: 'score' as SortKey, label: t('portfolioColScore', lang) },
                  { key: 'cagr' as SortKey, label: t('portfolioColCAGR', lang) },
                  { key: null, label: t('portfolioColHorizon', lang) },
                  { key: null, label: t('portfolioColAxes', lang) },
                ] as { key: SortKey | null; label: string }[]).map((col, i) => (
                  <div
                    key={i}
                    onClick={() => col.key && handleSort(col.key)}
                    style={{
                      color: col.key && sortKey === col.key ? T.cyan : T.textMid,
                      fontSize: 9, letterSpacing: 3,
                      cursor: col.key ? 'pointer' : 'default',
                      userSelect: 'none',
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontFamily: "'Courier New',monospace",
                    }}
                  >
                    {col.label}
                    {col.key && sortKey === col.key && (
                      <span style={{ fontSize: 7 }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {sorted.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: T.textDim, fontSize: 11, letterSpacing: 3, fontFamily: "'Courier New',monospace" }}>
                  {t('noResults', lang)}
                </div>
              ) : sorted.map(({ company, verdict, valuation }) => {
                const cagr = valuation?.expectedCagr
                const cagrColor = cagr != null
                  ? (cagr >= 20 ? T.green : cagr >= 12 ? T.yellow : T.red)
                  : T.textMid
                return (
                  <div
                    key={company.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: COL_GRID,
                      padding: '11px 16px',
                      borderBottom: `1px solid ${T.borderDim}`,
                      cursor: 'pointer',
                      transition: 'background 0.15s',
                      alignItems: 'center',
                    }}
                    onClick={() => navigate(`/companies/${company.id}`)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `rgba(${hexRgb(T.cyan)},0.04)` }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <div style={{ color: T.cyan, fontWeight: 700, fontSize: 13, fontFamily: "'Courier New',monospace" }}>
                      {company.ticker}
                    </div>
                    <div style={{ color: T.text, fontSize: 11 }}>{company.companyName}</div>
                    <div style={{ color: T.textDim, fontSize: 11 }}>{company.sector ?? '—'}</div>
                    <div>
                      {verdict
                        ? <VerdictBadge verdict={verdict.verdict} />
                        : <span style={{ color: T.textMid, fontSize: 10 }}>—</span>
                      }
                    </div>
                    <div style={{
                      color: verdict ? T.text : T.textMid,
                      fontSize: 13, fontWeight: verdict ? 700 : 400,
                      fontFamily: "'Courier New',monospace",
                    }}>
                      {verdict?.totalScore ?? '—'}
                    </div>
                    <div style={{ color: cagrColor, fontSize: 12, fontFamily: "'Courier New',monospace" }}>
                      {cagr != null ? `${cagr.toFixed(1)}%` : '—'}
                    </div>
                    <div style={{ color: T.textDim, fontSize: 11, fontFamily: "'Courier New',monospace" }}>
                      {company.investmentHorizonMonths}m
                    </div>
                    <div>
                      {verdict
                        ? <AxisMiniBar axisScores={verdict.axisScores} />
                        : <span style={{ color: T.textMid, fontSize: 10 }}>—</span>
                      }
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </PageLayout>
    </div>
  )
}
