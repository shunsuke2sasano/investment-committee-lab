import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  T, Button, PageLayout, SectionHeader, VerdictBadge, ScoreBadge,
  hexRgb, Textarea
} from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import {
  verdictRepository, valuationRepository, dataAnalysisRepository,
  marketAnalysisRepository, thesisRepository, reviewRepository,
} from '../db/repositories'
import { calculateVerdict, cagrGateFor, DEFAULT_CAGR_GATE_MIN } from '../lib/calculators'
import type { VerdictAxes, AxisScore, VerdictReport, DataAnalysis, MarketAnalysis } from '../types/domain'
import { VERDICT_PROFILES } from '../types/domain'
import { generateVerdictDraft, applyDraftToAxes } from '../features/verdictEngine/service'
import { generateStyleReview, type StyleReviewResult } from '../features/styleReview/service'

// ── Investment style ──────────────────────────────────────────────────────
type InvestmentStyle = 'oracle' | 'navigator' | 'visionary' | 'compounder'

interface StyleDef {
  image: string
  name: string
  subtitle: string
  descEn: string
  descJa: string
  profileId: 'conservative' | 'standard' | 'aggressive'
  axisWeights: Partial<Record<keyof VerdictAxes, number>>
}

const STYLE_CONFIG: Record<InvestmentStyle, StyleDef> = {
  oracle: {
    image: '/oracle.png', name: 'THE ORACLE', subtitle: 'VALUE',
    descEn: 'Find undervalued quality and hold', descJa: '割安な優良企業を見極め長く持つ',
    profileId: 'conservative',
    axisWeights: { valuationAttractiveness: 1.5, balanceSheetSafety: 1.3, growthQuality: 0.8 },
  },
  navigator: {
    image: '/navigator.png', name: 'THE NAVIGATOR', subtitle: 'GARP',
    descEn: 'Balance growth and valuation', descJa: '成長性と割安性のバランスを見る',
    profileId: 'standard',
    axisWeights: { growthQuality: 1.2, valuationAttractiveness: 1.2, marketExpectationGap: 1.2 },
  },
  visionary: {
    image: '/visionary.png', name: 'THE VISIONARY', subtitle: 'GROWTH',
    descEn: 'Bet boldly on future growth themes', descJa: '未来の成長テーマに強く賭ける',
    profileId: 'aggressive',
    axisWeights: { growthQuality: 1.5, businessQuality: 1.3, valuationAttractiveness: 0.7 },
  },
  compounder: {
    image: '/compounder.png', name: 'THE COMPOUNDER', subtitle: 'DIVIDEND',
    descEn: 'Compounding through patience and quality', descJa: '複利・忍耐・優良企業の長期保有',
    profileId: 'conservative',
    axisWeights: { capitalEfficiency: 1.5, balanceSheetSafety: 1.3, governance: 1.3, growthQuality: 0.8 },
  },
}

const PROFILE_TO_STYLE: Record<string, InvestmentStyle> = {
  conservative: 'oracle', standard: 'navigator', aggressive: 'visionary',
}

// ── Feed types ─────────────────────────────────────────────────────────────
type FeedSource = 'data' | 'market'

interface FeedSuggestion {
  score: 1 | 2 | 3 | 4 | 5
  source: FeedSource
  detail: string  // short note shown in badge
}

type LaneFeed = Partial<Record<keyof VerdictAxes, FeedSuggestion>>

function gapToScore(gap: number): 1 | 2 | 3 | 4 | 5 {
  if (gap >= 10) return 5
  if (gap >= 5)  return 4
  if (gap >= 0)  return 3
  if (gap >= -5) return 2
  return 1
}

function buildFeed(data: DataAnalysis | null | undefined, market: MarketAnalysis | null | undefined): LaneFeed {
  const feed: LaneFeed = {}
  if (data) {
    feed.businessQuality    = { score: data.scores.businessQuality,    source: 'data',   detail: `BQ ${data.scores.businessQuality}/5` }
    feed.capitalEfficiency  = { score: data.scores.capitalEfficiency,  source: 'data',   detail: `CE ${data.scores.capitalEfficiency}/5` }
    feed.balanceSheetSafety = { score: data.scores.balanceSheetSafety, source: 'data',   detail: `BS ${data.scores.balanceSheetSafety}/5` }
  }
  if (market?.outputs.marketExpectationGap != null) {
    const gap = market.outputs.marketExpectationGap
    const score = gapToScore(gap)
    const sign = gap >= 0 ? '+' : ''
    feed.marketExpectationGap = { score, source: 'market', detail: `Gap ${sign}${gap.toFixed(1)}%` }
  }
  return feed
}

// ── Axis definitions ──────────────────────────────────────────────────────
const AXES: {
  key: keyof VerdictAxes
  label: string
  description: string
  color: string
  vetoExample: string
}[] = [
  { key: 'businessQuality',       label: 'Business Quality',       color: T.cyan,   description: 'モート・業界構造・競争優位の持続性',        vetoExample: '理解不能な事業 / 流砂構造' },
  { key: 'growthQuality',         label: 'Growth Quality',         color: T.green,  description: '成長の質・需要の裏付け・再現性',             vetoExample: '数字だけの成長 / スカットルバット不可' },
  { key: 'capitalEfficiency',     label: 'Capital Efficiency',     color: T.yellow, description: 'ROIC・FCF変換率・資本配分の質',              vetoExample: 'ROIC < WACC継続 / 過剰希薄化' },
  { key: 'balanceSheetSafety',    label: 'Balance Sheet Safety',   color: T.orange, description: '負債水準・流動性・金利耐性',                 vetoExample: 'Net Debt/EBITDA > 4 / 流動性危機' },
  { key: 'valuationAttractiveness', label: 'Valuation',            color: T.amber,  description: '期待リターン・安全域・マルチプル水準',        vetoExample: '期待CAGR < 12% / 過去最高水準の評価倍率' },
  { key: 'marketExpectationGap',  label: 'Market Expectation Gap', color: T.purple, description: 'コンセンサスとの乖離・Edge有無',             vetoExample: 'Edgeゼロ / コンセンサスの繰り返し' },
  { key: 'executionRisk',         label: 'Execution Risk',         color: T.red,    description: '経営陣の質・実行リスク・引き返せない構造',   vetoExample: '引き返せない大型投資 / 経営交代リスク' },
  { key: 'governance',            label: 'Governance',             color: T.slate,  description: '株主還元・情報開示・インセンティブ設計',    vetoExample: '歪んだインセンティブ / 不透明な関連取引' },
]

function emptyAxis(): AxisScore {
  return { score: 3, veto: false, comment: '', evidenceMetrics: [] }
}

function emptyAxes(): VerdictAxes {
  return Object.fromEntries(AXES.map(a => [a.key, emptyAxis()])) as unknown as VerdictAxes
}

export default function VerdictPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, activeProfile, lang, settings } = useStore()

  const [axes, setAxes] = useState<VerdictAxes>(emptyAxes())
  const [rationale, setRationale] = useState('')
  const [saved, setSaved] = useState<VerdictReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [valuationCagr, setValuationCagr] = useState<number | null>(null)
  const [investmentStyle, setInvestmentStyle] = useState<InvestmentStyle>(PROFILE_TO_STYLE[activeProfile.id] ?? 'navigator')
  const [feed, setFeed] = useState<LaneFeed>({})
  const [styleReviews, setStyleReviews] = useState<Partial<Record<InvestmentStyle, StyleReviewResult>>>({})
  const [styleAxes, setStyleAxes] = useState<Partial<Record<InvestmentStyle, VerdictAxes>>>({})
  const [styleReviewLoading, setStyleReviewLoading] = useState<InvestmentStyle | null>(null)
  const [allStylesLoading, setAllStylesLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    Promise.all([
      verdictRepository.getLatest(companyId),
      valuationRepository.getLatest(companyId),
      dataAnalysisRepository.getLatest(companyId),
      marketAnalysisRepository.getLatest(companyId),
    ]).then(([verdict, valuation, data, market]) => {
      if (verdict) {
        setAxes(verdict.axisScores)
        setRationale(verdict.rationale)
        setSaved(verdict)
        setInvestmentStyle(PROFILE_TO_STYLE[verdict.profileUsed.id] ?? 'navigator')
      }
      setValuationCagr(valuation?.expectedCagr ?? null)
      setFeed(buildFeed(data, market))
    })
  }, [companyId])

  const currentStyle   = STYLE_CONFIG[investmentStyle]
  const currentProfile = VERDICT_PROFILES[currentStyle.profileId]
  const currentWeights = currentStyle.axisWeights
  // Re-derive the gate from the saved expected CAGR and the *current*
  // Settings minimum, so changing cagrGateMin takes effect without
  // re-saving the valuation. No valuation yet → gate is null → no block.
  const cagrGateMin = settings?.cagrGateMin ?? DEFAULT_CAGR_GATE_MIN
  const cagrGate    = cagrGateFor(valuationCagr, cagrGateMin)
  const cagrBlocked = cagrGate === 'block'
  const { totalScore, vetoCount, verdict } = calculateVerdict(axes, currentProfile, currentWeights, { cagrGate })

  function updateAxis(key: keyof VerdictAxes, patch: Partial<AxisScore>) {
    setAxes(p => ({ ...p, [key]: { ...p[key], ...patch } }))
  }

  function applyAllSuggestions() {
    setAxes(p => {
      const next = { ...p }
      ;(Object.entries(feed) as [keyof VerdictAxes, FeedSuggestion][]).forEach(([key, suggestion]) => {
        next[key] = { ...next[key], score: suggestion.score }
      })
      return next
    })
  }

  async function handleAiScore() {
    if (!companyId || !company) return
    const hasScores = Object.values(axes).some(a => a.comment !== '' || a.veto)
    if (hasScores && !window.confirm(t('verdictAiOverwrite', lang))) return
    setAiLoading(true)
    try {
      const [thesis, dataLane, marketLane, valuation, review] = await Promise.all([
        thesisRepository.getLatest(companyId),
        dataAnalysisRepository.getLatest(companyId),
        marketAnalysisRepository.getLatest(companyId),
        valuationRepository.getLatest(companyId),
        reviewRepository.getLatest(companyId),
      ])
      const payload = {
        company: { ticker: company.ticker, name: company.companyName, sector: company.sector, horizonMonths: company.investmentHorizonMonths },
        thesis:     thesis     ?? null,
        dataLane:   dataLane   ?? null,
        marketLane: marketLane ?? null,
        valuation:  valuation  ?? null,
        review:     review     ?? null,
      }
      const draft = await generateVerdictDraft(payload)
      setAxes(applyDraftToAxes(draft.axes, axes))
      setRationale(draft.rationale)
      showToast(t('verdictAiSuccess', lang), 'success')
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setAiLoading(false)
  }

  async function loadLaneData() {
    if (!companyId || !company) return null
    const [thesis, dataLane, marketLane, valuation, review] = await Promise.all([
      thesisRepository.getLatest(companyId),
      dataAnalysisRepository.getLatest(companyId),
      marketAnalysisRepository.getLatest(companyId),
      valuationRepository.getLatest(companyId),
      reviewRepository.getLatest(companyId),
    ])
    return { thesis: thesis ?? null, dataLane: dataLane ?? null, marketLane: marketLane ?? null, valuation: valuation ?? null, review: review ?? null }
  }

  async function handleStyleReview(style: InvestmentStyle) {
    if (!companyId || !company) return
    setStyleReviewLoading(style)
    try {
      const lanes = await loadLaneData()
      if (!lanes) return
      const verdictPayload = {
        company: { ticker: company.ticker, name: company.companyName, sector: company.sector, horizonMonths: company.investmentHorizonMonths },
        ...lanes,
      }
      const stylePayload = {
        company: { ticker: company.ticker, name: company.companyName, sector: company.sector },
        ...lanes,
      }
      const [styleResult, verdictDraft] = await Promise.all([
        generateStyleReview(style, stylePayload, lang),
        generateVerdictDraft(verdictPayload, style),
      ])
      setStyleReviews(prev => ({ ...prev, [style]: styleResult }))
      const newAxes = applyDraftToAxes(verdictDraft.axes, emptyAxes())
      setStyleAxes(prev => ({ ...prev, [style]: newAxes }))
      if (style === investmentStyle) {
        setAxes(newAxes)
        setRationale(verdictDraft.rationale)
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setStyleReviewLoading(null)
  }

  async function handleAllStyleReviews() {
    if (!companyId || !company) return
    setAllStylesLoading(true)
    try {
      const lanes = await loadLaneData()
      if (!lanes) return
      const verdictPayload = {
        company: { ticker: company.ticker, name: company.companyName, sector: company.sector, horizonMonths: company.investmentHorizonMonths },
        ...lanes,
      }
      const stylePayload = {
        company: { ticker: company.ticker, name: company.companyName, sector: company.sector },
        ...lanes,
      }
      const styles: InvestmentStyle[] = ['oracle', 'navigator', 'visionary', 'compounder']
      const allResults = await Promise.all(
        styles.map(s => Promise.all([
          generateStyleReview(s, stylePayload, lang),
          generateVerdictDraft(verdictPayload, s),
        ]))
      )
      const newStyleReviews: Partial<Record<InvestmentStyle, StyleReviewResult>> = {}
      const newStyleAxes: Partial<Record<InvestmentStyle, VerdictAxes>> = {}
      allResults.forEach(([styleResult, verdictDraft]) => {
        const s = styleResult.style as InvestmentStyle
        newStyleReviews[s] = styleResult
        newStyleAxes[s] = applyDraftToAxes(verdictDraft.axes, emptyAxes())
      })
      setStyleReviews(newStyleReviews)
      setStyleAxes(newStyleAxes)
      if (newStyleAxes[investmentStyle]) {
        setAxes(newStyleAxes[investmentStyle]!)
        const currentResult = allResults.find(([sr]) => sr.style === investmentStyle)
        if (currentResult) setRationale(currentResult[1].rationale)
      }
    } catch (e) {
      showToast(`Error: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    setAllStylesLoading(false)
  }

  function handleStyleChange(style: InvestmentStyle) {
    setInvestmentStyle(style)
    if (styleAxes[style]) {
      setAxes(styleAxes[style]!)
      showToast(t('styleAxesApplied', lang), 'success')
    }
  }

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const { totalScore, vetoCount, verdict } = calculateVerdict(axes, currentProfile, currentWeights, { cagrGate })
      const v = await verdictRepository.save({
        companyId,
        axisScores: axes,
        totalScore,
        vetoCount,
        verdict,
        rationale,
        profileUsed: currentProfile,
        createdAt: new Date().toISOString(),
      })
      setSaved(v)
      showToast(`Verdict: ${verdict}`, 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  const verdictColor = verdict === 'BUY' ? T.green : verdict === 'WATCH' ? T.yellow : T.red
  const feedCount = Object.keys(feed).length

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('verdictTitle', lang)}
        subtitle={`${company?.ticker ?? ''} / VERDICT`}
        backTo={`/companies/${companyId}`}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              onClick={handleAiScore}
              loading={aiLoading}
              accent={T.cyan}
              disabled={!settings?.anthropicApiKey?.trim()}
            >
              {aiLoading ? t('verdictAiGenerating', lang) : t('verdictAiBtn', lang)}
            </Button>
            <Button onClick={handleSave} loading={loading} accent={T.pink}>{t('saveVerdict', lang)}</Button>
          </div>
        }
      >
        {/* Valuation gate warning */}
        {cagrBlocked && (
          <div style={{ border: `2px solid ${T.red}`, background: `rgba(${hexRgb(T.red)},0.08)`, padding: '14px 20px', marginBottom: 20 }}>
            <div style={{ color: T.red, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
              🚫 VALUATION GATE — 期待CAGR &lt; {cagrGateMin}%
            </div>
            <div style={{ color: T.textDim, fontSize: 11, marginTop: 4 }}>
              Valuationページで期待CAGRが{cagrGateMin}%を下回っています。BUYは自動的にWATCHにダウングレードされます。
            </div>
          </div>
        )}

        {/* Investment Style Selector */}
        <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', marginBottom: 20, background: '#080D12' }}>
          <SectionHeader label={t('styleSelectLabel', lang)} color={T.cyan} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            {(Object.keys(STYLE_CONFIG) as InvestmentStyle[]).map(key => (
              <StyleCard
                key={key}
                styleKey={key}
                isSelected={investmentStyle === key}
                isScored={!!styleAxes[key]}
                lang={lang}
                onClick={() => handleStyleChange(key)}
              />
            ))}
          </div>
          <div style={{ color: T.textDim, fontSize: 11 }}>
            {t('styleSelected', lang)}: {currentStyle.name} — {lang === 'ja' ? currentStyle.descJa : currentStyle.descEn}
          </div>
          {/* Style review buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <Button
              onClick={() => handleStyleReview(investmentStyle)}
              loading={styleReviewLoading === investmentStyle}
              accent={T.cyan}
              size="sm"
              disabled={!settings?.anthropicApiKey?.trim() || allStylesLoading}
            >
              {styleReviewLoading === investmentStyle ? t('styleReviewLoading', lang) : t('styleReviewBtn', lang)}
            </Button>
            <Button
              onClick={handleAllStyleReviews}
              loading={allStylesLoading}
              accent={T.purple}
              size="sm"
              disabled={!settings?.anthropicApiKey?.trim() || styleReviewLoading !== null}
            >
              {allStylesLoading ? t('styleReviewLoading', lang) : t('styleReviewAllBtn', lang)}
            </Button>
          </div>
          {/* Style review results */}
          {Object.keys(styleReviews).length > 0 && (
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(Object.keys(STYLE_CONFIG) as InvestmentStyle[]).map(key =>
                styleReviews[key]
                  ? <StyleReviewCard key={key} result={styleReviews[key]!} />
                  : null
              )}
            </div>
          )}
        </div>

        {/* Score summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ border: `2px solid ${verdictColor}`, padding: '18px 20px', background: `rgba(${hexRgb(verdictColor)},0.08)`, textAlign: 'center', gridColumn: 'span 1' }}>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>{t('finalVerdict', lang)}</div>
            <VerdictBadge verdict={verdict} />
          </div>
          <div style={{ border: `1px solid ${T.borderDim}`, padding: '18px 20px', background: '#080D12', textAlign: 'center' }}>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>TOTAL SCORE</div>
            <div style={{ color: T.text, fontSize: 22, fontWeight: 700 }}>{totalScore}<span style={{ color: T.textDim, fontSize: 12 }}>/40</span></div>
          </div>
          <div style={{ border: `1px solid ${vetoCount >= 2 ? T.red : T.borderDim}`, padding: '18px 20px', background: '#080D12', textAlign: 'center' }}>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>VETO COUNT</div>
            <div style={{ color: vetoCount >= 2 ? T.red : T.text, fontSize: 22, fontWeight: 700 }}>{vetoCount}</div>
          </div>
          <div style={{ border: `1px solid ${T.borderDim}`, padding: '14px 16px', background: '#080D12' }}>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 8 }}>PROFILE</div>
            <div style={{ color: T.text, fontSize: 12, marginBottom: 8 }}>{currentProfile.label}</div>
            <div style={{ color: T.textDim, fontSize: 9 }}>
              BUY≥{currentProfile.buyThreshold} | WATCH≥{currentProfile.watchThreshold} | MaxVeto={currentProfile.maxVetoForBuy}
            </div>
          </div>
        </div>

        {/* 8-axis header with Apply All button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ flex: 1 }}>
            <SectionHeader label="8-AXIS EVALUATION" color={T.pink} />
          </div>
          {feedCount > 0 && (
            <Button onClick={applyAllSuggestions} accent={T.cyan} size="sm" variant="ghost">
              {t('feedApplyAll', lang)}
              <span style={{ color: T.textDim, fontSize: 9 }}>({feedCount})</span>
            </Button>
          )}
        </div>
        <div style={{ marginBottom: 10, color: T.textDim, fontSize: 10 }}>
          各軸 1-5点。Vetoはチェックすると即PASS（Conservative/Standard）または判定に影響。根拠を必ず記入。
        </div>

        {/* Axis scoring */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {AXES.map(axis => (
            <AxisCard
              key={axis.key}
              axis={axis}
              value={axes[axis.key]}
              suggestion={feed[axis.key]}
              lang={lang}
              onChange={patch => updateAxis(axis.key, patch)}
            />
          ))}
        </div>

        {/* Rationale */}
        <SectionHeader label="RATIONALE" color={T.pink} />
        <Textarea
          label="最終判断の根拠（なぜこのVerdictか）"
          value={rationale}
          onChange={setRationale}
          rows={4}
          placeholder="Business Quality・Valuationが高水準。Market Gap+8%のEdgeあり。BalanceSheet安全。VETOなし。Conservative profileで33点 → BUY。"
          accent={T.pink}
        />

        {saved && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {saved.createdAt.slice(0, 16)}</div>}
      </PageLayout>
    </div>
  )
}

// ── Axis card ─────────────────────────────────────────────────────────────
function AxisCard({ axis, value, suggestion, lang, onChange }: {
  axis: typeof AXES[0]
  value: AxisScore
  suggestion?: FeedSuggestion
  lang: Lang
  onChange: (patch: Partial<AxisScore>) => void
}) {
  const scoreColor = value.score >= 4 ? T.green : value.score >= 3 ? T.yellow : T.red
  const sugColor = suggestion?.source === 'data' ? T.cyan : T.purple

  return (
    <div style={{
      border: `1px solid ${value.veto ? T.red : T.borderDim}`,
      padding: '14px 16px',
      background: value.veto ? `rgba(${hexRgb(T.red)},0.05)` : '#080D12',
      transition: 'all 0.15s',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ color: axis.color, fontSize: 11, fontWeight: 700 }}>{axis.label}</div>
          <div style={{ color: T.textDim, fontSize: 9, marginTop: 2 }}>{axis.description}</div>
        </div>
        <ScoreBadge score={value.score} />
      </div>

      {/* Score selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: suggestion ? 6 : 10 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} onClick={() => onChange({ score: s as 1|2|3|4|5 })}
            style={{
              flex: 1, padding: '6px 0', cursor: 'pointer',
              border: `1px solid ${value.score === s ? scoreColor : T.borderDim}`,
              background: value.score === s ? `rgba(${hexRgb(scoreColor)},0.15)` : 'transparent',
              color: value.score === s ? scoreColor : T.textDim,
              fontFamily: "'Courier New',monospace", fontSize: 12, fontWeight: 700,
              transition: 'all 0.1s',
            }}>
            {s}
          </button>
        ))}
      </div>

      {/* Feed suggestion badge */}
      {suggestion && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10, padding: '5px 8px',
          background: `rgba(${hexRgb(sugColor)},0.06)`,
          border: `1px solid ${sugColor}33`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: sugColor, fontSize: 9, letterSpacing: 1 }}>
              {suggestion.source === 'data' ? t('feedFromDataLane', lang) : t('feedFromMarketLane', lang)}
            </span>
            <span style={{ color: T.textDim, fontSize: 9 }}>
              {t('feedSuggested', lang, { score: suggestion.score })}
            </span>
            <span style={{ color: sugColor, fontSize: 9, opacity: 0.7 }}>({suggestion.detail})</span>
          </div>
          {value.score !== suggestion.score && (
            <button
              onClick={() => onChange({ score: suggestion.score })}
              style={{
                background: `rgba(${hexRgb(sugColor)},0.12)`,
                border: `1px solid ${sugColor}`,
                color: sugColor,
                padding: '2px 10px', cursor: 'pointer',
                fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: 1,
              }}>
              {t('feedApply', lang)}
            </button>
          )}
          {value.score === suggestion.score && (
            <span style={{ color: sugColor, fontSize: 9, opacity: 0.6 }}>✓</span>
          )}
        </div>
      )}

      {/* Comment */}
      <textarea
        value={value.comment}
        onChange={e => onChange({ comment: e.target.value })}
        placeholder={`根拠を記入（例: ${axis.vetoExample}）`}
        rows={2}
        style={{
          width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${T.borderDim}`,
          color: T.text, fontFamily: "'Courier New',monospace", fontSize: 11,
          padding: '7px 10px', outline: 'none', resize: 'vertical', lineHeight: 1.6,
          boxSizing: 'border-box', marginBottom: 8,
        }}
      />

      {/* Veto toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={value.veto} onChange={e => onChange({ veto: e.target.checked })}
          style={{ accentColor: T.red, width: 14, height: 14 }} />
        <span style={{ color: value.veto ? T.red : T.textDim, fontSize: 10, letterSpacing: 2 }}>
          {t('vetoLabel', lang)}{axis.vetoExample}
        </span>
      </label>
    </div>
  )
}

// ── Style review card ─────────────────────────────────────────────────────
function StyleReviewCard({ result }: { result: StyleReviewResult }) {
  const cfg = STYLE_CONFIG[result.style as InvestmentStyle]
  const signalColor = result.signal === 'bullish' ? T.green : result.signal === 'bearish' ? T.red : T.yellow

  return (
    <div style={{
      border: `1px solid ${signalColor}44`, padding: '14px 16px',
      background: `rgba(${hexRgb(signalColor)},0.04)`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ color: T.cyan, fontSize: 10, fontWeight: 700 }}>{cfg.name}</div>
        <span style={{
          color: signalColor, fontSize: 9, letterSpacing: 2, fontWeight: 700,
          border: `1px solid ${signalColor}`, padding: '2px 8px',
        }}>
          {result.signal.toUpperCase()}
        </span>
      </div>
      <div style={{ color: T.text, fontSize: 11, marginBottom: 10, lineHeight: 1.6 }}>{result.summary}</div>
      {result.strongPoints.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: T.green, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>STRENGTHS</div>
          {result.strongPoints.map((p, i) => (
            <div key={i} style={{ color: T.textDim, fontSize: 10, marginLeft: 8, marginBottom: 2 }}>✓ {p}</div>
          ))}
        </div>
      )}
      {result.concerns.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: T.red, fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>CONCERNS</div>
          {result.concerns.map((c, i) => (
            <div key={i} style={{ color: T.textDim, fontSize: 10, marginLeft: 8, marginBottom: 2 }}>△ {c}</div>
          ))}
        </div>
      )}
      {result.recommendation && (
        <div style={{ color: T.amber, fontSize: 10, fontStyle: 'italic', borderTop: `1px solid ${T.borderDim}`, paddingTop: 8 }}>
          → {result.recommendation}
        </div>
      )}
    </div>
  )
}

// ── Style card ────────────────────────────────────────────────────────────
function StyleCard({ styleKey, isSelected, isScored, lang, onClick }: {
  styleKey: InvestmentStyle
  isSelected: boolean
  isScored: boolean
  lang: Lang
  onClick: () => void
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const cfg = STYLE_CONFIG[styleKey]
  return (
    <div
      onClick={onClick}
      style={{
        width: 110, cursor: 'pointer', padding: '10px 8px',
        border: `${isSelected ? 2 : 1}px solid ${isSelected ? T.cyan : T.borderDim}`,
        background: isSelected ? `rgba(${hexRgb(T.cyan)},0.08)` : 'rgba(8,13,18,0.6)',
        textAlign: 'center', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = T.cyan }}
      onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.borderColor = T.borderDim }}
    >
      {!imgFailed ? (
        <img
          src={cfg.image}
          alt={cfg.name}
          onError={() => setImgFailed(true)}
          style={{
            width: 80, height: 80, objectFit: 'cover', display: 'block', margin: '0 auto 8px',
            filter: isSelected ? 'grayscale(0.3)' : 'grayscale(0.8)',
          }}
        />
      ) : (
        <div style={{
          width: 80, height: 80, margin: '0 auto 8px',
          background: `rgba(${hexRgb(isSelected ? T.cyan : T.textMid)},0.08)`,
          border: `1px solid ${T.borderDim}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ color: isSelected ? T.cyan : T.textDim, fontSize: 24, fontFamily: "'Courier New',monospace" }}>
            {cfg.name.replace('THE ', '')[0]}
          </span>
        </div>
      )}
      <div style={{ color: isSelected ? T.cyan : T.textDim, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>
        {cfg.name.replace('THE ', '')}
      </div>
      <div style={{ color: isSelected ? T.cyan : T.textMid, fontSize: 8, letterSpacing: 2 }}>
        {cfg.subtitle}
      </div>
      {isScored && (
        <div style={{ color: T.green, fontSize: 7, letterSpacing: 1, marginTop: 4 }}>
          {t('styleScored', lang)}
        </div>
      )}
    </div>
  )
}
