import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, NumericInput, Button, PageLayout, SectionHeader, ScoreBadge, Select, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { dataAnalysisRepository } from '../db/repositories'
import { calculateDataScores, buildDataSummary, calculateYoY, detectTrend } from '../lib/calculators'
import type { DataLaneInput, DataAnalysis, FiscalPeriodData } from '../types/domain'
import { isJapaneseStock, fetchFmpFinancials } from '../lib/fmpClient'
import {
  INDUSTRY_PRESETS, PRESET_LIST, inferPresetFromSector,
  getFieldLabel, FIELD_UNITS, FIELD_PLACEHOLDERS,
  type PresetId, type IndustryPreset, type PresetFieldGroup, type ColorToken,
} from '../lib/industryPresets'
import type { TranslationKey } from '../lib/i18n'

const EMPTY_INPUT: DataLaneInput = {
  revenueGrowthYoy: null, revenueGrowth3y: null,
  grossMargin: null, operatingMargin: null, fcfMargin: null,
  roic: null, debtToEbitda: null, netDebtToEquity: null,
  shareDilutionAnnual: null, reinvestmentRate: null, currentRatio: null,
}

function defaultFiscalYear() {
  return `FY${new Date().getFullYear() - 1}`
}

const COLOR_MAP: Record<ColorToken, string> = {
  yellow: T.yellow, green: T.green, cyan: T.cyan, red: T.red,
  orange: T.orange, purple: T.purple, slate: T.slate, sky: T.sky,
}

// ── Sparkline ──────────────────────────────────────────────────────────────
function Sparkline({ values, width = 96, height = 32 }: {
  values: (number | null)[]
  width?: number
  height?: number
}) {
  const indexed = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v !== null)

  if (indexed.length < 2) {
    return <span style={{ color: T.textDim, fontSize: 10, display: 'block', lineHeight: `${height}px` }}>—</span>
  }

  const trend = detectTrend(values)
  const color = trend === 'up' ? T.green : trend === 'down' ? T.red : T.yellow
  const vals = indexed.map(x => x.v)
  const minV = Math.min(...vals)
  const maxV = Math.max(...vals)
  const range = maxV - minV || 1
  const n = values.length
  const toX = (i: number) => ((i / Math.max(n - 1, 1)) * (width - 6) + 3).toFixed(1)
  const toY = (v: number) => (height - 3 - ((v - minV) / range) * (height - 8)).toFixed(1)
  const points = indexed.map(({ v, i }) => `${toX(i)},${toY(v)}`).join(' ')

  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      {indexed.map(({ v, i }) => (
        <circle key={i} cx={toX(i)} cy={toY(v)} r={2.5} fill={color} />
      ))}
    </svg>
  )
}

// ── YoY badge ─────────────────────────────────────────────────────────────
function YoYBadge({ current, prev }: { current: number | null; prev: number | null }) {
  const delta = calculateYoY(current, prev)
  if (delta === null) return null
  const color = delta > 0 ? T.green : delta < 0 ? T.red : T.yellow
  return (
    <span style={{ fontSize: 9, color, marginLeft: 6, fontFamily: "'Courier New', monospace" }}>
      ({delta > 0 ? '+' : ''}{delta.toFixed(1)}pt)
    </span>
  )
}

// ── Trend metric card ──────────────────────────────────────────────────────
function TrendCard({ label, values, chronoLabels }: {
  label: string
  values: (number | null)[]
  chronoLabels: string[]
}) {
  const trend = detectTrend(values)
  const color = trend === 'up' ? T.green : trend === 'down' ? T.red : T.yellow
  const arrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'
  const latest = values[values.length - 1]
  const prev   = values[values.length - 2]
  const delta  = calculateYoY(latest, prev)
  return (
    <div style={{ border: `1px solid ${T.borderDim}`, background: T.surface, padding: '10px 14px' }}>
      <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Sparkline values={values} width={88} height={28} />
        <div style={{ textAlign: 'right', minWidth: 40 }}>
          <div style={{ color, fontSize: 20, lineHeight: 1 }}>{arrow}</div>
          {delta !== null && (
            <div style={{ color, fontSize: 9, marginTop: 2, fontFamily: "'Courier New', monospace" }}>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}pt
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {values.map((v, i) => (
          <span key={i} style={{
            fontSize: 9, fontFamily: "'Courier New', monospace",
            color: i === values.length - 1 ? T.text : T.textDim,
          }}>
            {chronoLabels[i]}: {v !== null ? `${v.toFixed(1)}%` : '—'}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Preset form group ──────────────────────────────────────────────────────
function PresetFormGroup({ group, preset, activeInput, prevInput, lang, updPeriod }: {
  group: PresetFieldGroup
  preset: IndustryPreset
  activeInput: DataLaneInput
  prevInput: DataLaneInput | null
  lang: 'en' | 'ja'
  updPeriod: (key: keyof DataLaneInput) => (v: number | null) => void
}) {
  const color = COLOR_MAP[group.color]
  return (
    <div>
      <SectionHeader label={t(group.titleKey as TranslationKey, lang)} color={color} />
      {group.fields.map(field => {
        const isHighlighted = preset.highlights.includes(field)
        const label = getFieldLabel(field, preset, lang)
        const unit  = FIELD_UNITS[field]
        const ph    = FIELD_PLACEHOLDERS[field]
        const prevVal = prevInput?.[field] ?? null
        return (
          <div key={field} style={isHighlighted ? {
            borderLeft: `2px solid ${color}`,
            paddingLeft: 8,
            marginLeft: -8,
            marginBottom: 2,
          } : {}}>
            <NumericInput
              label={isHighlighted ? `★ ${label}` : label}
              value={activeInput[field] as number | null}
              onChange={updPeriod(field)}
              unit={unit}
              placeholder={ph}
              accent={isHighlighted ? color : T.textMid}
            />
            {prevInput && (
              <div style={{ fontSize: 9, color: T.textDim, marginTop: -8, marginBottom: 8, fontFamily: "'Courier New', monospace" }}>
                prev: {prevVal !== null ? `${prevVal}${unit}` : '—'}
                <YoYBadge current={activeInput[field] as number | null} prev={prevVal} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════

export default function DataLanePage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang, settings } = useStore()

  const [periods, setPeriods] = useState<FiscalPeriodData[]>([
    { fiscalYear: defaultFiscalYear(), input: { ...EMPTY_INPUT } },
  ])
  const [activePeriodIdx, setActivePeriodIdx] = useState(0)
  const [saved, setSaved]     = useState<DataAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [fmpLoading, setFmpLoading] = useState(false)
  const [editingYearIdx, setEditingYearIdx] = useState<number | null>(null)
  const [presetId, setPresetId] = useState<PresetId>('generic')
  const [presetAutoSet, setPresetAutoSet] = useState(false)

  const fmpKey    = settings?.fmpApiKey ?? ''
  const hasFmpKey = fmpKey.trim().length > 0

  // ── Load ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!companyId) return
    dataAnalysisRepository.getLatest(companyId).then(d => {
      if (!d) return
      setSaved(d)
      if (d.periods && d.periods.length > 0) {
        setPeriods(d.periods)
      } else {
        setPeriods([{ fiscalYear: defaultFiscalYear(), input: d.input }])
      }
      setActivePeriodIdx(0)
    })
  }, [companyId])

  // Auto-infer preset from sector (runs once when company loads)
  useEffect(() => {
    if (!company || presetAutoSet) return
    const inferred = inferPresetFromSector(company.sector)
    setPresetId(inferred)
    setPresetAutoSet(true)
  }, [company, presetAutoSet])

  // ── Derived ─────────────────────────────────────────────────────────────
  const preset      = INDUSTRY_PRESETS[presetId]
  const activeInput = periods[activePeriodIdx]?.input ?? EMPTY_INPUT
  const prevInput   = periods[activePeriodIdx + 1]?.input ?? null
  const liveScores  = calculateDataScores(activeInput)
  const filledCount = Object.values(activeInput).filter(v => v !== null).length

  const chronoPeriods = [...periods].reverse()
  const chronoLabels  = chronoPeriods.map(p => p.fiscalYear)
  const hasTrend = periods.length >= 2

  const compositeValue = preset.computeComposite?.(activeInput) ?? null

  // ── Handlers ────────────────────────────────────────────────────────────
  function updPeriod(key: keyof DataLaneInput) {
    return (v: number | null) =>
      setPeriods(prev =>
        prev.map((p, i) =>
          i === activePeriodIdx ? { ...p, input: { ...p.input, [key]: v } } : p,
        ),
      )
  }

  function addPeriod() {
    if (periods.length >= 5) return
    const lastFY  = periods[periods.length - 1].fiscalYear
    const lastNum = parseInt(lastFY.replace(/\D/g, '')) || new Date().getFullYear() - 1
    const newFY   = `FY${lastNum - 1}`
    setPeriods(prev => [...prev, { fiscalYear: newFY, input: { ...EMPTY_INPUT } }])
    setActivePeriodIdx(periods.length)
  }

  function updateFiscalYear(idx: number, value: string) {
    setPeriods(prev => prev.map((p, i) => i === idx ? { ...p, fiscalYear: value } : p))
  }

  async function handleFmpFetch() {
    const ticker = company?.ticker ?? ''
    if (!ticker) return
    if (isJapaneseStock(ticker)) { showToast(t('fmpJpSkip', lang), 'error'); return }
    setFmpLoading(true)
    try {
      const data = await fetchFmpFinancials(ticker, fmpKey)
      setPeriods(prev =>
        prev.map((p, i) => {
          if (i !== activePeriodIdx) return p
          return {
            ...p,
            input: {
              ...p.input,
              revenueGrowthYoy: data.revenueGrowthYoy ?? p.input.revenueGrowthYoy,
              revenueGrowth3y:  data.revenueGrowth3y  ?? p.input.revenueGrowth3y,
              grossMargin:      data.grossMargin       ?? p.input.grossMargin,
              operatingMargin:  data.operatingMargin   ?? p.input.operatingMargin,
              fcfMargin:        data.fcfMargin         ?? p.input.fcfMargin,
              roic:             data.roic              ?? p.input.roic,
              debtToEbitda:     data.debtToEbitda      ?? p.input.debtToEbitda,
              currentRatio:     data.currentRatio      ?? p.input.currentRatio,
            },
          }
        }),
      )
      showToast(t('fmpFetchSuccess', lang), 'success')
    } catch {
      showToast(t('fmpFetchError', lang), 'error')
    }
    setFmpLoading(false)
  }

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const latestInput = periods[0].input
      const scores  = calculateDataScores(latestInput)
      const summary = buildDataSummary(scores, latestInput)
      const d = await dataAnalysisRepository.save({
        companyId, input: latestInput, scores, summary,
        computedAt: new Date().toISOString(),
        periods,
      })
      setSaved(d)
      showToast('Data Lane saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  const scoreColor = (s: number) => s >= 4 ? T.green : s >= 3 ? T.yellow : T.red

  // Composite color
  const compositeColor = compositeValue === null
    ? T.textDim
    : compositeValue >= 40 ? T.green : compositeValue >= 30 ? T.yellow : T.red

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('dataTitle', lang)} subtitle={`${company?.ticker ?? ''} / DATA`} backTo={`/companies/${companyId}`}>

        {/* ── Lane independence note ──────────────────────────────────────── */}
        <div style={{ border: `1px solid ${T.yellow}22`, borderLeft: `2px solid ${T.yellow}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.yellow)},0.03)` }}>
          <div style={{ color: T.yellow, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>{t('dataLaneNoteTitle', lang)}</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            財務データから独立してスコアを算出します。Thesisの内容はスコア計算に影響しません。
            入力値 {filledCount}/11 — 欠損値はスコアに反映されません。
          </div>
        </div>

        {/* ── Industry preset selector ─────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 220 }}>
            <Select
              label={t('presetSelector', lang)}
              value={presetId}
              onChange={v => { setPresetId(v as PresetId); setPresetAutoSet(true) }}
              options={PRESET_LIST.map(p => ({ value: p.id, label: lang === 'ja' ? `${p.labelJa}` : p.label }))}
              accent={T.cyan}
            />
          </div>
          {presetAutoSet && company?.sector && (
            <div style={{ fontSize: 9, color: T.textDim, fontFamily: "'Courier New', monospace", paddingBottom: 14, letterSpacing: 1 }}>
              ← {t('presetAutoDetected', lang)}: {company.sector}
            </div>
          )}
          {/* Composite metric badge (e.g. Rule of 40) */}
          {preset.computeComposite && (
            <div style={{
              border: `1px solid ${compositeColor}44`,
              background: `rgba(${hexRgb(compositeColor)},0.06)`,
              padding: '6px 14px',
              fontFamily: "'Courier New', monospace",
              paddingBottom: 14,
            }}>
              <div style={{ color: T.textDim, fontSize: 8, letterSpacing: 2, marginBottom: 4 }}>
                {t('compositeMetricTitle', lang)}
              </div>
              <div style={{ color: compositeColor, fontSize: 16, fontWeight: 'bold' }}>
                {compositeValue !== null ? compositeValue.toFixed(1) : '—'}
              </div>
              <div style={{ color: T.textDim, fontSize: 9, marginTop: 2 }}>
                {lang === 'ja' ? preset.compositeNoteJa : preset.compositeNote}
              </div>
            </div>
          )}
        </div>

        {/* ── Veto hint lines ──────────────────────────────────────────────── */}
        {preset.vetoHints.length > 0 && (
          <div style={{ border: `1px solid ${T.red}22`, borderLeft: `2px solid ${T.red}`, padding: '10px 14px', marginBottom: 20, background: `rgba(${hexRgb(T.red)},0.03)` }}>
            <div style={{ color: T.red, fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>
              {t('vetoHintTitle', lang)}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px' }}>
              {(lang === 'ja' ? preset.vetoHintsJa : preset.vetoHints).map((hint, i) => (
                <span key={i} style={{ color: T.textDim, fontSize: 10, fontFamily: "'Courier New', monospace" }}>
                  · {hint}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Period tabs ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          {periods.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { if (editingYearIdx !== i) setActivePeriodIdx(i) }}
              style={{
                padding: '6px 14px',
                background: i === activePeriodIdx ? `rgba(${hexRgb(T.yellow)},0.12)` : 'transparent',
                border: `1px solid ${i === activePeriodIdx ? T.yellow : T.borderDim}`,
                color: i === activePeriodIdx ? T.yellow : T.textDim,
                fontFamily: "'Courier New', monospace",
                fontSize: 11, cursor: 'pointer', letterSpacing: 1,
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.1s',
              }}
            >
              {editingYearIdx === i ? (
                <input
                  autoFocus
                  value={p.fiscalYear}
                  onChange={e => updateFiscalYear(i, e.target.value)}
                  onBlur={() => setEditingYearIdx(null)}
                  onKeyDown={e => { if (e.key === 'Enter') setEditingYearIdx(null) }}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    color: T.yellow, fontFamily: "'Courier New', monospace",
                    fontSize: 11, width: 58, textAlign: 'center',
                  }}
                />
              ) : (
                <span
                  title="Double-click to rename"
                  onDoubleClick={e => { e.stopPropagation(); setActivePeriodIdx(i); setEditingYearIdx(i) }}
                >
                  {p.fiscalYear}
                </span>
              )}
              {i === 0 && (
                <span style={{ fontSize: 8, color: T.green, letterSpacing: 1 }}>
                  {t('periodLatestBadge', lang)}
                </span>
              )}
            </button>
          ))}
          {periods.length < 5 ? (
            <button
              type="button" onClick={addPeriod}
              style={{
                padding: '6px 12px', background: 'transparent',
                border: `1px dashed ${T.borderDim}`, color: T.textDim,
                fontFamily: "'Courier New', monospace", fontSize: 10,
                letterSpacing: 1, cursor: 'pointer',
              }}
            >
              {t('addPeriod', lang)}
            </button>
          ) : (
            <span style={{ fontSize: 9, color: T.textDim, fontFamily: "'Courier New', monospace" }}>
              {t('maxPeriodsReached', lang)}
            </span>
          )}
        </div>

        {/* ── Live scores ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Business Quality',     score: liveScores.businessQuality },
            { label: 'Capital Efficiency',   score: liveScores.capitalEfficiency },
            { label: 'Balance Sheet Safety', score: liveScores.balanceSheetSafety },
            { label: 'Cash Generation',      score: liveScores.cashGeneration },
          ].map(({ label, score }) => (
            <div key={label} style={{
              border: `1px solid ${scoreColor(score)}33`, padding: '14px 16px',
              background: `rgba(${hexRgb(scoreColor(score))},0.05)`, textAlign: 'center',
            }}>
              <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 8 }}>{label}</div>
              <ScoreBadge score={score} />
            </div>
          ))}
        </div>

        {/* ── Trend charts ─────────────────────────────────────────────────── */}
        {hasTrend && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ color: T.cyan, fontSize: 9, letterSpacing: 4, marginBottom: 10, textTransform: 'uppercase' }}>
              {t('trendAnalysis', lang)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { label: getFieldLabel('revenueGrowthYoy', preset, lang), key: 'revenueGrowthYoy' as keyof DataLaneInput },
                { label: getFieldLabel('fcfMargin',        preset, lang), key: 'fcfMargin'        as keyof DataLaneInput },
                { label: getFieldLabel('roic',             preset, lang), key: 'roic'             as keyof DataLaneInput },
              ].map(({ label, key }) => (
                <TrendCard
                  key={key}
                  label={label}
                  values={chronoPeriods.map(p => p.input[key] as number | null)}
                  chronoLabels={chronoLabels}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Input form (preset-driven) ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            {preset.leftGroups.map(group => (
              <PresetFormGroup
                key={group.titleKey}
                group={group}
                preset={preset}
                activeInput={activeInput}
                prevInput={prevInput}
                lang={lang}
                updPeriod={updPeriod}
              />
            ))}
          </div>
          <div>
            {preset.rightGroups.map(group => (
              <PresetFormGroup
                key={group.titleKey}
                group={group}
                preset={preset}
                activeInput={activeInput}
                prevInput={prevInput}
                lang={lang}
                updPeriod={updPeriod}
              />
            ))}
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={handleSave} loading={loading} accent={T.yellow}>{t('saveDataLane', lang)}</Button>
          <button
            type="button"
            onClick={hasFmpKey ? handleFmpFetch : undefined}
            disabled={!hasFmpKey || fmpLoading}
            title={hasFmpKey ? undefined : t('fmpKeyMissing', lang)}
            style={{
              padding: '9px 18px', cursor: hasFmpKey ? 'pointer' : 'not-allowed',
              background: 'transparent',
              border: `1px solid ${hasFmpKey ? T.green : T.borderDim}`,
              color: hasFmpKey ? T.green : T.textDim,
              fontFamily: "'Courier New', monospace", fontSize: 9, letterSpacing: 2,
              opacity: hasFmpKey ? 1 : 0.5, transition: 'all 0.15s',
            }}
          >
            {fmpLoading ? t('fmpFetching', lang) : t('fmpFetchBtn', lang)}
          </button>
          {!hasFmpKey && (
            <span style={{ color: T.textDim, fontSize: 10 }}>{t('fmpKeyMissing', lang)}</span>
          )}
        </div>
        {saved && (
          <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>
            Last saved: {saved.computedAt.slice(0, 16)}
            {saved.periods && (
              <span style={{ marginLeft: 8 }}>{saved.periods.length} period{saved.periods.length > 1 ? 's' : ''}</span>
            )}
          </div>
        )}
      </PageLayout>
    </div>
  )
}
