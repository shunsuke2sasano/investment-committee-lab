import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, NumericInput, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
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
  const [horizonAutoFillMonths, setHorizonAutoFillMonths] = useState<number | null>(null)

  useEffect(() => {
    if (!companyId) return
    Promise.all([
      valuationRepository.getLatest(companyId),
      companyRepository.get(companyId),
    ]).then(([v, c]) => {
      if (v) {
        setAssumptions(v.assumptions)
        setSavedAt(v.createdAt)
      }
      // Always sync EV from company master
      if (c?.enterpriseValue) {
        setAssumptions(p => ({ ...p, currentEnterpriseValue: c.enterpriseValue! }))
      }
      // Auto-fill years from Thesis Horizon only when no saved valuation
      if (!v && c?.investmentHorizonMonths) {
        const horizonYears = Math.max(1, Math.round(c.investmentHorizonMonths / 12))
        setAssumptions(p => ({ ...p, years: horizonYears }))
        setHorizonAutoFillMonths(c.investmentHorizonMonths)
      }
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
      <PageLayout title={t('valuationTitle', lang)} subtitle={`${company?.ticker ?? ''} / VALUATION`} backTo={`/companies/${companyId}`}>
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
            {horizonAutoFillMonths !== null && (
              <div style={{ color: T.amber, fontSize: 9, letterSpacing: 2, marginTop: -10, marginBottom: 12, paddingLeft: 2 }}>
                {t('horizonAutoFilled', lang, { months: horizonAutoFillMonths, years: Math.max(1, Math.round(horizonAutoFillMonths / 12)) })}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={handleSave} loading={loading} accent={T.amber}>{t('saveValuation', lang)}</Button>
        </div>
        {savedAt && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {savedAt.slice(0, 16)}</div>}

        {/* Sensitivity table */}
        <SensitivityTable assumptions={assumptions} lang={lang} />
      </PageLayout>
    </div>
  )
}

// ── Sensitivity helpers ───────────────────────────────────────────────────

function computePointCagr(a: ValuationAssumptions, growth: number, multiple: number): number | null {
  const { currentRevenue, currentEnterpriseValue, baseFcfMargin, years } = a
  if (
    currentRevenue === null || currentEnterpriseValue === null ||
    baseFcfMargin === null || currentEnterpriseValue <= 0 ||
    years <= 0 || multiple <= 0
  ) return null
  const futureRev = currentRevenue * Math.pow(1 + growth / 100, years)
  const futureEV  = futureRev * (baseFcfMargin / 100) * multiple
  if (futureEV <= 0) return null
  return (Math.pow(futureEV / currentEnterpriseValue, 1 / years) - 1) * 100
}

function cagrColor(cagr: number | null): string {
  if (cagr === null) return T.textMid
  if (cagr >= 20) return T.green
  if (cagr >= 12) return T.yellow
  return T.red
}

// ── Sensitivity table component ───────────────────────────────────────────

function SensitivityTable({ assumptions, lang }: { assumptions: ValuationAssumptions; lang: Lang }) {
  const { baseRevenueGrowth, exitMultiple } = assumptions

  const hasData =
    assumptions.currentRevenue !== null &&
    assumptions.currentEnterpriseValue !== null &&
    assumptions.baseFcfMargin !== null &&
    baseRevenueGrowth !== null &&
    exitMultiple !== null

  const growthSteps = hasData
    ? [-10, -5, 0, +5, +10].map(d => Math.round((baseRevenueGrowth! + d) * 10) / 10)
    : []
  const multipleSteps = hasData
    ? [-10, -5, 0, +5, +10].map(d => Math.round((exitMultiple! + d) * 10) / 10)
    : []

  const CELL_H = 38
  const ROW_HEADER_W = 68
  const COL_W = '1fr'

  return (
    <div style={{ marginTop: 32 }}>
      <SectionHeader label={t('sensitivityTitle', lang)} color={T.amber} />

      {!hasData ? (
        <div style={{
          border: `1px solid ${T.borderDim}`, padding: '20px 24px',
          color: T.textDim, fontSize: 11, textAlign: 'center',
          background: '#080D12', letterSpacing: 1,
        }}>
          {t('sensitivityNoData', lang)}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          {/* Column axis label */}
          <div style={{ color: T.textMid, fontSize: 8, letterSpacing: 3, textAlign: 'center', marginBottom: 4 }}>
            EXIT EV/FCF MULTIPLE →
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: `${ROW_HEADER_W}px repeat(5, ${COL_W})`, gap: 2 }}>
            {/* Top-left corner */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 4, paddingRight: 6 }}>
              <span style={{ color: T.textMid, fontSize: 8, letterSpacing: 1 }}>GROWTH ↓</span>
            </div>

            {/* Column headers (multiples) */}
            {multipleSteps.map(m => (
              <div key={m} style={{
                textAlign: 'center', padding: '4px 2px',
                color: m === exitMultiple ? T.amber : T.textDim,
                fontSize: 9, fontFamily: "'Courier New',monospace",
                fontWeight: m === exitMultiple ? 700 : 400,
                borderBottom: m === exitMultiple ? `1px solid ${T.amber}` : `1px solid ${T.borderDim}`,
              }}>
                {m > 0 ? `${m}x` : '—'}
              </div>
            ))}

            {/* Data rows */}
            {growthSteps.map(g => (
              <React.Fragment key={g}>
                {/* Row header (growth) */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 8, height: CELL_H,
                  color: g === baseRevenueGrowth ? T.amber : T.textDim,
                  fontSize: 9, fontFamily: "'Courier New',monospace",
                  fontWeight: g === baseRevenueGrowth ? 700 : 400,
                  borderRight: g === baseRevenueGrowth ? `1px solid ${T.amber}` : `1px solid ${T.borderDim}`,
                }}>
                  {g.toFixed(1)}%
                </div>

                {/* CAGR cells */}
                {multipleSteps.map(m => {
                  const cagr = computePointCagr(assumptions, g, m)
                  const col = cagrColor(cagr)
                  const isBase = g === baseRevenueGrowth && m === exitMultiple

                  return (
                    <div key={m} style={{
                      height: CELL_H,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: isBase ? `2px solid ${T.amber}` : `1px solid ${col}22`,
                      background: isBase
                        ? `rgba(${hexRgb(T.amber)},0.12)`
                        : `rgba(${hexRgb(col)},0.06)`,
                      color: m > 0 ? col : T.textMid,
                      fontSize: 11, fontWeight: isBase ? 700 : 400,
                      fontFamily: "'Courier New',monospace",
                      transition: 'all 0.1s',
                    }}>
                      {m > 0 && cagr !== null ? `${cagr.toFixed(1)}%` : '—'}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, marginTop: 10, justifyContent: 'flex-end' }}>
            {([['≥20%', T.green, 'BUY'], ['≥12%', T.yellow, 'WATCH'], ['<12%', T.red, 'BLOCK']] as const).map(([label, col, gate]) => (
              <div key={gate} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, background: `rgba(${hexRgb(col)},0.3)`, border: `1px solid ${col}` }} />
                <span style={{ color: T.textDim, fontSize: 9 }}>{label} {gate}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, border: `2px solid ${T.amber}` }} />
              <span style={{ color: T.textDim, fontSize: 9 }}>BASE</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
