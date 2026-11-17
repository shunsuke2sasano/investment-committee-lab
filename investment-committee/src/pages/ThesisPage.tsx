import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { T, Input, Textarea, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { thesisRepository, valuationRepository, companyRepository, settingsRepository } from '../db/repositories'
import { estimateTimeToValidate, generateHorizonExplanation } from '../features/horizonEngine/service'
import { inferHorizonFromConditions, findValuationOptimalHorizon, calcHorizonConfidence } from '../lib/horizonCalculator'
import { generateThesisDraft, type ThesisGuideDraft } from '../features/thesisGuide/service'
import { t } from '../lib/i18n'
import type { ThesisAnalysis, CollapseCondition, CollapseOperator, HorizonInference } from '../types/domain'

function uid() { return crypto.randomUUID() }

function emptyCondition(): CollapseCondition {
  return {
    id: uid(), label: '', metricKey: null,
    operator: 'manual', threshold: null, unit: null, note: null,
    timeToValidate: null, isPrimary: false,
  }
}

const BASIS_LABEL: Record<string, { en: string; ja: string }> = {
  primary_condition: { en: 'Primary collapse condition', ja: 'Primary崩壊条件から算出' },
  median_conditions: { en: 'Median of all conditions',  ja: '全崩壊条件の中央値' },
  valuation_optimal: { en: 'Valuation optimal',         ja: 'Valuation逆算の最適値' },
  fallback:          { en: 'Default (no data)',          ja: 'デフォルト（データ不足）' },
}

const CONFIDENCE_COLOR = (c: number) =>
  c >= 4 ? T.green : c >= 3 ? T.yellow : T.red

export default function ThesisPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [thesis, setThesis] = useState<ThesisAnalysis | null>(null)
  const [thesisText, setThesisText] = useState('')
  const [drivers, setDrivers] = useState<string[]>([''])
  const [conditions, setConditions] = useState<CollapseCondition[]>([emptyCondition()])
  const [confidenceNote, setConfidenceNote] = useState('')
  const [valuationOptimalMonths, setValuationOptimalMonths] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const [generatingExplanation, setGeneratingExplanation] = useState(false)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)

  // ── AI Guide state ─────────────────────────────────────────────────────
  const [guideOpen, setGuideOpen] = useState(false)
  const [guideMemo, setGuideMemo] = useState('')
  const [guideLoading, setGuideLoading] = useState(false)
  const [guideError, setGuideError] = useState<string | null>(null)
  const [guideDraft, setGuideDraft] = useState<ThesisGuideDraft | null>(null)
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    if (!companyId) return
    thesisRepository.getLatest(companyId).then(t => {
      if (t) {
        setThesis(t)
        setThesisText(t.thesisText)
        setDrivers(t.drivers.length > 0 ? t.drivers : [''])
        setConditions(t.collapseConditions.length > 0
          ? t.collapseConditions.map(c => ({
              ...c,
              timeToValidate: c.timeToValidate ?? null,
              isPrimary: c.isPrimary ?? false,
            }))
          : [emptyCondition()])
        setConfidenceNote(t.confidenceNote ?? '')
      }
    })
  }, [companyId])

  // Valuationは初回のみ取得
  useEffect(() => {
    if (!companyId) return
    valuationRepository.getLatest(companyId).then(v => {
      if (v) setValuationOptimalMonths(findValuationOptimalHorizon(v.assumptions))
    })
  }, [companyId])

  // APIキー確認
  useEffect(() => {
    settingsRepository.get().then(s => {
      const dbKey = (s.anthropicApiKey ?? '').trim()
      const envKey = (import.meta.env.VITE_ANTHROPIC_API_KEY ?? '').trim()
      setHasApiKey(!!(dbKey || envKey))
    })
  }, [])

  // Horizon計算 — conditionsが変わるたびに同期的に再計算
  const horizon = useMemo(() => {
    return inferHorizonFromConditions(conditions, valuationOptimalMonths)
  }, [conditions, valuationOptimalMonths])

  async function handleSave() {
    if (!companyId || !thesisText.trim()) {
      showToast(lang === 'ja' ? 'Thesisは必須です' : 'Thesis is required', 'error')
      return
    }
    setLoading(true)
    try {
      const input = {
        companyId,
        thesisText: thesisText.trim(),
        drivers: drivers.filter(d => d.trim()),
        collapseConditions: conditions.filter(c => c.label.trim()),
        monitoringMetrics: thesis?.monitoringMetrics ?? [],
        confidenceNote: confidenceNote || null,
      }
      const saved = thesis
        ? await thesisRepository.update(thesis.id, input)
        : await thesisRepository.create(input)
      setThesis(saved ?? null)

      // Horizonが確定していたらCompanyのhorizonも更新
      if (horizon && companyId) {
        await companyRepository.update(companyId, {
          investmentHorizonMonths: horizon.recommendedMonths
        })
      }
      showToast(lang === 'ja' ? 'Thesisを保存しました' : 'Thesis saved', 'success')
    } catch {
      showToast(t('saveFailed', lang), 'error')
    }
    setLoading(false)
  }

  // ── AI推定 ────────────────────────────────────────────────────────────
  async function handleEstimate() {
    if (!thesisText.trim()) {
      showToast(lang === 'ja' ? '先にThesisを入力してください' : 'Enter thesis first', 'error')
      return
    }
    const targets = conditions.filter(c => c.timeToValidate === null && c.label.trim())
    if (targets.length === 0) {
      showToast(lang === 'ja' ? '推定対象の条件がありません' : 'No conditions to estimate', 'info')
      return
    }
    setEstimating(true)
    try {
      const result = await estimateTimeToValidate(conditions, thesisText)
      setConditions(prev => prev.map(c => {
        const est = result.get(c.id)
        return est ? { ...c, timeToValidate: est } : c
      }))
      showToast(
        lang === 'ja' ? `${result.size}件推定完了` : `${result.size} conditions estimated`,
        'success'
      )
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setEstimating(false)
  }

  async function handleGenerateExplanation() {
    if (!horizon || !thesisText.trim()) return
    setGeneratingExplanation(true)
    try {
      const explanation = await generateHorizonExplanation({
        thesisText,
        conditions,
        recommendedMonths: horizon.recommendedMonths,
        valuationOptimalMonths: horizon.valuationOptimalMonths,
        basis: horizon.basis,
        lang,
      })
      setAiExplanation(explanation)
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setGeneratingExplanation(false)
  }

  // ── AI Guide handlers ──────────────────────────────────────────────────
  function openGuide() {
    setGuideMemo('')
    setGuideError(null)
    setGuideDraft(null)
    setGuideOpen(true)
  }

  async function handleGenerate() {
    if (!company) return
    setGuideLoading(true)
    setGuideError(null)
    try {
      const draft = await generateThesisDraft(
        company.ticker,
        company.companyName,
        company.sector,
        guideMemo,
      )
      setGuideDraft(draft)
    } catch (e) {
      if (e instanceof Error && e.message === 'NO_API_KEY') {
        setGuideError(t('thesisGuideNoKey', lang))
      } else if (e instanceof Error && e.message === 'PARSE_ERROR') {
        setGuideError(t('thesisGuideError', lang))
      } else {
        setGuideError(t('thesisGuideError', lang))
      }
    }
    setGuideLoading(false)
  }

  function handleApplyDraft() {
    if (!guideDraft) return
    const hasExisting = thesisText.trim() || drivers.some(d => d.trim()) || conditions.some(c => c.label.trim())
    if (hasExisting && !confirm(t('thesisGuideOverwrite', lang))) return

    setThesisText(guideDraft.thesisText)
    setDrivers(guideDraft.drivers.length > 0 ? guideDraft.drivers : [''])
    setConditions(guideDraft.collapseConditions.map(cc => ({
      id: uid(),
      label: cc.label,
      note: cc.note,
      metricKey: null,
      operator: 'manual' as const,
      threshold: null,
      unit: null,
      timeToValidate: null,
      isPrimary: false,
    })))
    setGuideOpen(false)
  }

  function addCondition() { setConditions(p => [...p, emptyCondition()]) }
  function removeCondition(id: string) { setConditions(p => p.filter(c => c.id !== id)) }
  function updateCondition(id: string, patch: Partial<CollapseCondition>) {
    setConditions(p => p.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  function setPrimary(id: string) {
    // primaryは1つだけ
    setConditions(p => p.map(c => ({ ...c, isPrimary: c.id === id })))
  }

  const horizonConfidence = calcHorizonConfidence(conditions)

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('thesisTitle', lang)} subtitle={`${company?.ticker ?? ''} / THESIS`} backTo={`/companies/${companyId}`}>

        {/* Lane independence note */}
        <div style={{ border: `1px solid ${T.purple}22`, borderLeft: `2px solid ${T.purple}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.purple)},0.04)` }}>
          <div style={{ color: T.purple, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>{t('thesisLaneNote', lang)}</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>{t('thesisLaneNoteBody', lang)}</div>
        </div>

        <SectionHeader label={t('thesisSectionLabel', lang)} color={T.purple} />
        <Textarea
          label={t('thesisInputLabel', lang)}
          value={thesisText}
          onChange={setThesisText}
          rows={3}
          placeholder={t('thesisPlaceholder', lang)}
          accent={T.purple}
        />

        <SectionHeader label={t('driversLabel', lang)} color={T.purple} />
        {drivers.map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <Input
                label={`Driver ${i + 1}`}
                value={d}
                onChange={v => setDrivers(p => { const n = [...p]; n[i] = v; return n })}
                placeholder={['CUDA ecosystem switching cost', 'Structural growth in data center demand', 'Software business expansion'][i] ?? ''}
                accent={T.purple}
              />
            </div>
            {drivers.length > 1 && (
              <button
                onClick={() => setDrivers(p => p.filter((_, idx) => idx !== i))}
                style={{
                  marginTop: 22, background: 'transparent', border: 'none',
                  color: T.textDim, cursor: 'pointer', fontSize: 12, padding: '4px 6px',
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {drivers.length < 5 && (
          <Button
            onClick={() => setDrivers(p => [...p, ''])}
            variant="ghost"
            size="sm"
            accent={T.purple}
          >
            {t('addDriver', lang)}
          </Button>
        )}

        {/* ── Collapse Conditions ──────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 3, height: 3, background: T.red }} />
            <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 5, fontFamily: "'Courier New',monospace" }}>
              {t('collapseLabel', lang)}
            </div>
            <div style={{ flex: 1, height: 1, background: T.borderDim, width: 60 }} />
          </div>
          {hasApiKey && (
            <Button
              onClick={handleEstimate}
              loading={estimating}
              variant="ghost"
              size="sm"
              accent={T.orange}
            >
              ⚡ {lang === 'ja' ? 'AI判明期間推定' : 'AI Estimate Timelines'}
            </Button>
          )}
        </div>

        <div style={{ color: T.textDim, fontSize: 10, marginBottom: 12, lineHeight: 1.6 }}>
          {t('collapseNote', lang)}
        </div>

        {conditions.map((c, i) => (
          <CollapseConditionCard
            key={c.id}
            index={i}
            condition={c}
            onUpdate={patch => updateCondition(c.id, patch)}
            onRemove={() => removeCondition(c.id)}
            onSetPrimary={() => setPrimary(c.id)}
            canRemove={conditions.length > 1}
            lang={lang}
          />
        ))}

        <Button onClick={addCondition} variant="ghost" size="sm" accent={T.red}>
          {t('addCondition', lang)}
        </Button>

        {/* ── Horizon Inference Panel ──────────────────────────────────── */}
        {horizon && (
          <HorizonPanel
            horizon={{ ...horizon, aiExplanation: aiExplanation ?? horizon.aiExplanation }}
            confidence={horizonConfidence}
            onGenerateExplanation={handleGenerateExplanation}
            generatingExplanation={generatingExplanation}
            hasApiKey={hasApiKey}
            lang={lang}
          />
        )}

        {/* ── Confidence Note ──────────────────────────────────────────── */}
        <SectionHeader label={t('confidenceNote', lang)} color={T.textDim} />
        <Textarea
          label={t('confidenceLabel', lang)}
          value={confidenceNote}
          onChange={setConfidenceNote}
          rows={3}
          placeholder={lang === 'ja'
            ? '実際にNvidiaのMLエンジニアと話した。CUDAからの移行コストは2年分の開発工数に相当する...'
            : 'Talked directly with Nvidia ML engineers. Migration cost from CUDA equates to 2 years of dev work...'}
          accent={T.textDim}
        />

        <div style={{ display: 'flex', gap: 12, marginTop: 24, alignItems: 'center' }}>
          <Button
            onClick={openGuide}
            variant="ghost"
            size="sm"
            accent={T.cyan}
            disabled={!hasApiKey}
          >
            ✦ {t('thesisGuideBtn', lang)}
          </Button>
          {!hasApiKey && (
            <span style={{ color: T.textDim, fontSize: 10 }}>
              ({t('thesisGuideNoKey', lang)})
            </span>
          )}
          <div style={{ flex: 1 }} />
          <Button onClick={handleSave} loading={loading} accent={T.purple}>
            {t('saveThesis', lang)}
          </Button>
        </div>
        {thesis && (
          <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>
            {t('lastSaved', lang)} {thesis.updatedAt.slice(0, 16)} | {t('version', lang)} {thesis.version}
          </div>
        )}
      </PageLayout>

      {/* ── AI Guide Modal ────────────────────────────────────────────── */}
      {guideOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setGuideOpen(false) }}
        >
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            padding: '32px 36px',
            width: '100%',
            maxWidth: 520,
            fontFamily: "'Courier New',monospace",
          }}>
            {/* Title */}
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 5, marginBottom: 6 }}>
              {guideDraft ? t('thesisGuideResultTitle', lang) : t('thesisGuideModalTitle', lang)}
            </div>
            <div style={{ width: 40, height: 1, background: T.cyan, marginBottom: 20 }} />

            {!guideDraft ? (
              /* ── Input phase ── */
              <>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 8 }}>
                  {t('thesisGuideMemoLabel', lang).replace('{ticker}', company?.ticker ?? '')}
                </label>
                <textarea
                  autoFocus
                  value={guideMemo}
                  onChange={e => setGuideMemo(e.target.value)}
                  placeholder={t('thesisGuideMemoPlaceholder', lang)}
                  rows={4}
                  style={{
                    width: '100%', background: '#080D12',
                    border: `1px solid ${T.borderDim}`,
                    color: T.text, fontFamily: "'Courier New',monospace", fontSize: 13,
                    padding: '10px 12px', outline: 'none', resize: 'vertical',
                    boxSizing: 'border-box', marginBottom: 16,
                  }}
                  onFocus={e => { e.target.style.borderColor = T.cyan }}
                  onBlur={e => { e.target.style.borderColor = T.borderDim }}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) handleGenerate() }}
                />

                {guideError && (
                  <div style={{ color: T.red, fontSize: 11, marginBottom: 14, letterSpacing: 1 }}>
                    ✗ {guideError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button
                    onClick={() => setGuideOpen(false)}
                    variant="ghost"
                    size="sm"
                    accent={T.textDim}
                  >
                    {t('cancelBtn', lang)}
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    loading={guideLoading}
                    size="sm"
                    accent={T.cyan}
                  >
                    {guideLoading ? t('thesisGuideGenerating', lang) : t('thesisGuideGenerateBtn', lang)}
                  </Button>
                </div>
              </>
            ) : (
              /* ── Result phase ── */
              <>
                {/* Thesis text */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ color: T.cyan, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>
                    ▼ {lang === 'ja' ? '投資仮説（1行）' : 'INVESTMENT THESIS'}
                  </div>
                  <div style={{
                    color: T.text, fontSize: 13, lineHeight: 1.7,
                    padding: '10px 14px', background: '#080D12',
                    border: `1px solid ${T.borderDim}`,
                  }}>
                    {guideDraft.thesisText}
                  </div>
                </div>

                {/* Drivers */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ color: T.purple, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>
                    ▼ {lang === 'ja' ? 'ドライバー' : 'DRIVERS'}
                  </div>
                  {guideDraft.drivers.map((d, i) => (
                    <div key={i} style={{
                      color: T.text, fontSize: 12, lineHeight: 1.7,
                      padding: '6px 14px', marginBottom: 4,
                      background: '#080D12', border: `1px solid ${T.borderDim}`,
                    }}>
                      {i + 1}. {d}
                    </div>
                  ))}
                </div>

                {/* Collapse conditions */}
                <div style={{ marginBottom: 18 }}>
                  <div style={{ color: T.red, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>
                    ▼ {lang === 'ja' ? '崩壊条件' : 'COLLAPSE CONDITIONS'}
                  </div>
                  {guideDraft.collapseConditions.map((cc, i) => (
                    <div key={i} style={{
                      padding: '8px 14px', marginBottom: 4,
                      background: '#080D12', border: `1px solid ${T.borderDim}`,
                    }}>
                      <div style={{ color: T.text, fontSize: 12, marginBottom: 3 }}>
                        · {cc.label}
                      </div>
                      {cc.note && (
                        <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.6 }}>
                          {cc.note}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Disclaimer */}
                <div style={{
                  color: T.textDim, fontSize: 10, lineHeight: 1.7,
                  padding: '8px 12px', marginBottom: 20,
                  background: `rgba(${hexRgb(T.yellow)},0.04)`,
                  border: `1px solid ${T.yellow}33`,
                }}>
                  {t('thesisGuideDisclaimer', lang)}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button
                    onClick={() => { setGuideDraft(null); setGuideError(null) }}
                    variant="ghost"
                    size="sm"
                    accent={T.textDim}
                  >
                    {t('cancelBtn', lang)}
                  </Button>
                  <Button
                    onClick={handleApplyDraft}
                    size="sm"
                    accent={T.cyan}
                  >
                    {t('thesisGuideApplyBtn', lang)}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── CollapseConditionCard ─────────────────────────────────────────────────
function CollapseConditionCard({
  index, condition, onUpdate, onRemove, onSetPrimary, canRemove, lang,
}: {
  index: number
  condition: CollapseCondition
  onUpdate: (patch: Partial<CollapseCondition>) => void
  onRemove: () => void
  onSetPrimary: () => void
  canRemove: boolean
  lang: 'en' | 'ja'
}) {
  const ttv = condition.timeToValidate
  const borderColor = condition.isPrimary ? T.orange : ttv ? T.green : T.borderDim

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${borderColor}`,
      padding: '14px 16px', marginBottom: 12, background: '#080D12',
      transition: 'all 0.15s',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: T.textMid, fontSize: 9, letterSpacing: 3 }}>
            {lang === 'ja' ? '条件' : 'CONDITION'} {index + 1}
          </span>
          {condition.isPrimary && (
            <span style={{ color: T.orange, border: `1px solid ${T.orange}`, padding: '1px 6px', fontSize: 8, letterSpacing: 2 }}>
              PRIMARY
            </span>
          )}
          {ttv && (
            <span style={{ color: CONFIDENCE_COLOR(ttv.confidence), fontSize: 9 }}>
              {ttv.months}{lang === 'ja' ? 'ヶ月' : 'mo'}
              <span style={{ color: T.textDim }}> conf:{ttv.confidence}/5</span>
              {ttv.source === 'ai' && <span style={{ color: T.cyan, marginLeft: 4 }}>AI</span>}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!condition.isPrimary && (
            <span
              style={{ color: T.orange, fontSize: 9, cursor: 'pointer', letterSpacing: 1 }}
              onClick={onSetPrimary}
            >
              {lang === 'ja' ? 'Primaryにする' : 'Set Primary'}
            </span>
          )}
          {canRemove && (
            <span style={{ color: T.red, fontSize: 9, cursor: 'pointer' }} onClick={onRemove}>
              {t('removeBtn', lang)}
            </span>
          )}
        </div>
      </div>

      {/* Main fields */}
      <Input
        label={t('conditionLabelField', lang)}
        value={condition.label}
        onChange={v => onUpdate({ label: v })}
        placeholder={lang === 'ja'
          ? 'AMDがROCmのCUDA互換を主要クラウド3社で採用'
          : 'AMD achieves CUDA-compatible ROCm adoption at 3 major cloud providers'}
        accent={T.red}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>
            {t('operator', lang)}
          </label>
          <select
            value={condition.operator}
            onChange={e => onUpdate({ operator: e.target.value as CollapseOperator })}
            style={{ width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '9px 12px', outline: 'none' }}
          >
            {['manual', '<', '<=', '>', '>=', '='].map(o => (
              <option key={o} value={o} style={{ background: '#0A1520' }}>
                {o === 'manual' ? (lang === 'ja' ? 'manual（定性）' : 'manual (qualitative)') : o}
              </option>
            ))}
          </select>
        </div>
        <Input
          label={t('threshold', lang)}
          value={condition.threshold?.toString() ?? ''}
          onChange={v => onUpdate({ threshold: v ? parseFloat(v) : null })}
          placeholder="3"
          accent={T.red}
        />
        <Input
          label={t('unit', lang)}
          value={condition.unit ?? ''}
          onChange={v => onUpdate({ unit: v || null })}
          placeholder={lang === 'ja' ? '社, %, x' : 'firms, %, x'}
          accent={T.red}
        />
      </div>

      {/* timeToValidate section */}
      <div style={{ borderTop: `1px solid ${T.borderDim}`, paddingTop: 10, marginTop: 4 }}>
        <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>
          {lang === 'ja' ? '判明期間（市場・業績上で観測可能になるまで）' : 'TIME TO VALIDATE (months until observable in market/earnings)'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {/* Months input */}
          <div>
            <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>
              {lang === 'ja' ? '期間（月）' : 'Months'}
            </label>
            <input
              type="number"
              value={ttv?.months ?? ''}
              onChange={e => {
                const v = e.target.value
                if (v === '') {
                  onUpdate({ timeToValidate: null })
                } else {
                  onUpdate({
                    timeToValidate: {
                      months: parseInt(v),
                      source: 'user',
                      confidence: ttv?.confidence ?? 3,
                      aiReasoning: ttv?.aiReasoning ?? null,
                    }
                  })
                }
              }}
              placeholder={lang === 'ja' ? 'AI推定 or 手入力' : 'AI estimate or manual'}
              style={{ width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${ttv?.source === 'user' ? T.cyan : T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {/* Confidence */}
          <div>
            <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>
              {lang === 'ja' ? '確信度 (1-5)' : 'Confidence (1-5)'}
            </label>
            <div style={{ display: 'flex', gap: 4 }}>
              {([1, 2, 3, 4, 5] as const).map(s => (
                <button
                  key={s}
                  onClick={() => ttv && onUpdate({ timeToValidate: { ...ttv, confidence: s, source: 'user' } })}
                  disabled={!ttv}
                  style={{
                    flex: 1, padding: '6px 0', cursor: ttv ? 'pointer' : 'not-allowed',
                    border: `1px solid ${ttv?.confidence === s ? CONFIDENCE_COLOR(s) : T.borderDim}`,
                    background: ttv?.confidence === s ? `rgba(${hexRgb(CONFIDENCE_COLOR(s))},0.15)` : 'transparent',
                    color: ttv?.confidence === s ? CONFIDENCE_COLOR(s) : T.textDim,
                    fontFamily: "'Courier New',monospace", fontSize: 11,
                    transition: 'all 0.1s',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Source badge */}
          <div>
            <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>
              {lang === 'ja' ? 'ソース' : 'Source'}
            </label>
            <div style={{ padding: '7px 10px', border: `1px solid ${T.borderDim}`, color: ttv?.source === 'user' ? T.cyan : ttv?.source === 'ai' ? T.orange : T.textDim, fontSize: 10, letterSpacing: 2 }}>
              {ttv ? (ttv.source === 'user' ? 'USER' : 'AI') : (lang === 'ja' ? '未設定' : 'NOT SET')}
            </div>
          </div>
        </div>

        {/* AI reasoning */}
        {ttv?.aiReasoning && (
          <div style={{ marginTop: 8, color: T.textDim, fontSize: 10, lineHeight: 1.6, padding: '6px 10px', background: `rgba(${hexRgb(T.orange)},0.04)`, borderLeft: `2px solid ${T.orange}33` }}>
            <span style={{ color: T.orange, fontSize: 9, letterSpacing: 2 }}>AI: </span>
            {ttv.aiReasoning}
          </div>
        )}
      </div>
    </div>
  )
}

// ── HorizonPanel ──────────────────────────────────────────────────────────
function HorizonPanel({
  horizon, confidence, onGenerateExplanation, generatingExplanation, hasApiKey, lang,
}: {
  horizon: HorizonInference
  confidence: number | null
  onGenerateExplanation: () => void
  generatingExplanation: boolean
  hasApiKey: boolean
  lang: 'en' | 'ja'
}) {
  const basisLabel = BASIS_LABEL[horizon.basis]?.[lang] ?? horizon.basis

  return (
    <div style={{ border: `2px solid ${T.orange}`, padding: '20px 24px', marginTop: 20, marginBottom: 20, background: `rgba(${hexRgb(T.orange)},0.05)` }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ color: T.orange, fontSize: 9, letterSpacing: 4, marginBottom: 6 }}>
            {lang === 'ja' ? '推奨投資期間（自動算出）' : 'RECOMMENDED HORIZON (AUTO-CALCULATED)'}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 48, fontWeight: 700, color: T.orange, fontFamily: "'Courier New',monospace", lineHeight: 1 }}>
              {horizon.recommendedMonths}
            </span>
            <span style={{ color: T.textDim, fontSize: 14 }}>
              {lang === 'ja' ? 'ヶ月' : 'months'}
            </span>
            <span style={{ color: T.textDim, fontSize: 11 }}>
              ({lang === 'ja' ? '範囲: ' : 'range: '}
              {horizon.rangeMin}–{horizon.rangeMax}{lang === 'ja' ? 'ヶ月' : 'mo'})
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: T.textDim, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
            {lang === 'ja' ? '算出根拠' : 'BASIS'}
          </div>
          <div style={{ color: T.orange, fontSize: 11, marginBottom: 8 }}>{basisLabel}</div>
          {confidence !== null && (
            <div style={{ color: CONFIDENCE_COLOR(Math.round(confidence)), fontSize: 10 }}>
              {lang === 'ja' ? '条件確信度平均' : 'Avg confidence'}: {confidence}/5
            </div>
          )}
        </div>
      </div>

      {/* Sub-metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ border: `1px solid ${T.borderDim}`, padding: '10px 14px', background: '#080D12' }}>
          <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
            {lang === 'ja' ? 'Thesis崩壊条件から' : 'FROM COLLAPSE CONDITIONS'}
          </div>
          <div style={{ color: horizon.basis === 'primary_condition' || horizon.basis === 'median_conditions' ? T.text : T.textDim, fontSize: 13 }}>
            {horizon.primaryConditionLabel
              ? `Primary: "${horizon.primaryConditionLabel.slice(0, 40)}…"`
              : horizon.basis === 'median_conditions'
                ? `${lang === 'ja' ? '中央値' : 'Median'}: ${horizon.recommendedMonths}mo`
                : `—`}
          </div>
        </div>
        <div style={{ border: `1px solid ${T.borderDim}`, padding: '10px 14px', background: '#080D12' }}>
          <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
            {lang === 'ja' ? 'Valuation逆算（補助）' : 'VALUATION OPTIMAL (SUPPLEMENT)'}
          </div>
          <div style={{ color: horizon.valuationOptimalMonths ? T.text : T.textDim, fontSize: 13 }}>
            {horizon.valuationOptimalMonths
              ? `${horizon.valuationOptimalMonths}${lang === 'ja' ? 'ヶ月' : 'mo'}`
              : lang === 'ja' ? 'Valuation未入力' : 'Valuation not entered'}
          </div>
        </div>
      </div>

      {/* AI explanation */}
      {horizon.aiExplanation ? (
        <div style={{ color: T.text, fontSize: 12, lineHeight: 1.8, padding: '10px 14px', background: `rgba(${hexRgb(T.cyan)},0.04)`, borderLeft: `2px solid ${T.cyan}33` }}>
          <span style={{ color: T.cyan, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>
            {lang === 'ja' ? 'AI説明' : 'AI EXPLANATION'}
          </span>
          {horizon.aiExplanation}
        </div>
      ) : hasApiKey ? (
        <Button
          onClick={onGenerateExplanation}
          loading={generatingExplanation}
          variant="ghost"
          size="sm"
          accent={T.cyan}
        >
          {lang === 'ja' ? '💬 AI説明を生成' : '💬 Generate AI explanation'}
        </Button>
      ) : (
        <div style={{ color: T.textDim, fontSize: 10 }}>
          {lang === 'ja' ? '（APIキー設定でAI説明が利用可能）' : '(Set API key to enable AI explanation)'}
        </div>
      )}

      {/* Note about auto-update */}
      <div style={{ marginTop: 12, color: T.textDim, fontSize: 10, letterSpacing: 1 }}>
        {lang === 'ja'
          ? '* 保存時にCompanyの投資期間を自動更新します'
          : '* Saving will auto-update the company investment horizon'}
      </div>
    </div>
  )
}

