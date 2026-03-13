import React, { useEffect, useState } from 'react'
import { T, PageLayout, SectionHeader } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { lessonRepository, verdictRepository } from '../db/repositories'
import type { LessonRecord, DecisionQuality, VerdictResult } from '../types/domain'
import type { TranslationKey } from '../lib/i18n'

const DQ_I18N_KEY: Record<DecisionQuality, TranslationKey> = {
  good_process_good_outcome: 'dq_good_process_good_outcome',
  good_process_bad_outcome:  'dq_good_process_bad_outcome',
  bad_process_good_outcome:  'dq_bad_process_good_outcome',
  bad_process_bad_outcome:   'dq_bad_process_bad_outcome',
}

// ── Types ──────────────────────────────────────────────────────────────────
interface Metrics {
  total: number
  buyTotal: number
  passTotal: number
  buyHitRate: number | null
  passMissRate: number | null
  avgConfidence: number | null
  processScore: number | null
  distribution: Record<DecisionQuality, number>
}

// ── Calculation ────────────────────────────────────────────────────────────
function calcMetrics(
  lessons: LessonRecord[],
  verdictMap: Map<string, VerdictResult>,
): Metrics {
  const EMPTY_DIST: Record<DecisionQuality, number> = {
    good_process_good_outcome: 0,
    good_process_bad_outcome:  0,
    bad_process_good_outcome:  0,
    bad_process_bad_outcome:   0,
  }
  const total = lessons.length
  if (total === 0) {
    return { total: 0, buyTotal: 0, passTotal: 0, buyHitRate: null, passMissRate: null, avgConfidence: null, processScore: null, distribution: EMPTY_DIST }
  }

  const distribution = { ...EMPTY_DIST }
  lessons.forEach(l => { distribution[l.decisionQuality]++ })

  const avgConfidence = lessons.reduce((s, l) => s + l.confidence, 0) / total

  const goodProcessCount = lessons.filter(l => l.decisionQuality.startsWith('good_process')).length
  const processScore = goodProcessCount / total

  const buyLessons  = lessons.filter(l => verdictMap.get(l.companyId) === 'BUY')
  const buyGood     = buyLessons.filter(l => l.decisionQuality.endsWith('good_outcome')).length
  const buyHitRate  = buyLessons.length > 0 ? buyGood / buyLessons.length : null

  const passLessons  = lessons.filter(l => verdictMap.get(l.companyId) === 'PASS')
  const passMissed   = passLessons.filter(l => l.actualReturn !== null && l.actualReturn > 0).length
  const passMissRate = passLessons.length > 0 ? passMissed / passLessons.length : null

  return {
    total,
    buyTotal:    buyLessons.length,
    passTotal:   passLessons.length,
    buyHitRate,
    passMissRate,
    avgConfidence,
    processScore,
    distribution,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, color = T.cyan,
}: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      border: `1px solid ${T.borderDim}`, background: '#080D12',
      padding: '20px 24px', flex: 1, minWidth: 160,
    }}>
      <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 10, fontFamily: "'Courier New',monospace" }}>
        {label}
      </div>
      <div style={{ color, fontSize: 28, fontWeight: 700, fontFamily: "'Courier New',monospace", lineHeight: 1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ color: T.textDim, fontSize: 10, marginTop: 8, fontFamily: "'Courier New',monospace" }}>
          {sub}
        </div>
      )}
    </div>
  )
}

function DistBar({ count, total, color }: { count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 4, background: T.borderDim, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
      </div>
      <div style={{ color, fontFamily: "'Courier New',monospace", fontSize: 11, minWidth: 48, textAlign: 'right' }}>
        {pct.toFixed(1)}%
      </div>
      <div style={{ color: T.textDim, fontFamily: "'Courier New',monospace", fontSize: 10, minWidth: 24, textAlign: 'right' }}>
        {count}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function MetricsPage() {
  const lang = useStore(s => s.lang)
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  useEffect(() => {
    async function load() {
      const [lessons, verdictMap] = await Promise.all([
        lessonRepository.list(),
        verdictRepository.listLatestAll(),
      ])
      const vmap = new Map<string, VerdictResult>()
      verdictMap.forEach((v, k) => vmap.set(k, v.verdict))
      setMetrics(calcMetrics(lessons, vmap))
    }
    load()
  }, [])

  if (!metrics) {
    return (
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PageLayout title={t('metricsTitle', lang)} subtitle="PERFORMANCE ANALYSIS">
          <div />
        </PageLayout>
      </div>
    )
  }

  const QUALITY_ROWS: { key: DecisionQuality; color: string }[] = [
    { key: 'good_process_good_outcome', color: T.green },
    { key: 'good_process_bad_outcome',  color: T.yellow },
    { key: 'bad_process_good_outcome',  color: T.orange },
    { key: 'bad_process_bad_outcome',   color: T.red },
  ]

  const fmtPct = (v: number | null, fallback: string) =>
    v === null ? fallback : `${(v * 100).toFixed(1)}%`

  const avgConf = metrics.avgConfidence !== null
    ? metrics.avgConfidence.toFixed(2)
    : '—'

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('metricsTitle', lang)} subtitle={t('metricsSubtitle', lang)}>

        {metrics.total === 0 ? (
          <div style={{
            border: `1px solid ${T.borderDim}`, padding: '60px 40px',
            textAlign: 'center', color: T.textDim,
            fontFamily: "'Courier New',monospace", fontSize: 12, letterSpacing: 3,
          }}>
            {t('metricsEmpty', lang)}
          </div>
        ) : (
          <>
            {/* ── KPI row ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatCard
                label={t('metricsTotal', lang)}
                value={String(metrics.total)}
                color={T.text}
              />
              <StatCard
                label={t('metricsBuyHitRate', lang)}
                value={fmtPct(metrics.buyHitRate, '—')}
                sub={metrics.buyTotal > 0
                  ? t('metricsBasedOnN', lang, { n: metrics.buyTotal })
                  : t('metricsNoBuyLessons', lang)}
                color={metrics.buyHitRate === null ? T.textDim : metrics.buyHitRate >= 0.6 ? T.green : metrics.buyHitRate >= 0.4 ? T.yellow : T.red}
              />
              <StatCard
                label={t('metricsPassMissRate', lang)}
                value={fmtPct(metrics.passMissRate, '—')}
                sub={metrics.passTotal > 0
                  ? t('metricsBasedOnN', lang, { n: metrics.passTotal })
                  : t('metricsNoPassLessons', lang)}
                color={metrics.passMissRate === null ? T.textDim : metrics.passMissRate <= 0.2 ? T.green : metrics.passMissRate <= 0.4 ? T.yellow : T.red}
              />
              <StatCard
                label={t('metricsAvgConfidence', lang)}
                value={avgConf}
                sub="/ 5"
                color={metrics.avgConfidence === null ? T.textDim : metrics.avgConfidence >= 4 ? T.green : metrics.avgConfidence >= 3 ? T.yellow : T.red}
              />
              <StatCard
                label={t('metricsProcessScore', lang)}
                value={fmtPct(metrics.processScore, '—')}
                sub={t('metricsGoodProcessRatio', lang)}
                color={metrics.processScore === null ? T.textDim : metrics.processScore >= 0.7 ? T.green : metrics.processScore >= 0.5 ? T.yellow : T.red}
              />
            </div>

            {/* ── Distribution ── */}
            <SectionHeader label={t('metricsDistribution', lang)} color={T.purple} />
            <div style={{ border: `1px solid ${T.borderDim}`, background: '#080D12', padding: '20px 24px' }}>
              <div style={{ display: 'grid', gap: 16 }}>
                {QUALITY_ROWS.map(({ key, color }) => (
                  <div key={key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ color, fontSize: 10, letterSpacing: 2, fontFamily: "'Courier New',monospace" }}>
                        {t(DQ_I18N_KEY[key], lang)}
                      </div>
                    </div>
                    <DistBar count={metrics.distribution[key]} total={metrics.total} color={color} />
                  </div>
                ))}
              </div>

              <div style={{ height: 1, background: T.borderDim, margin: '20px 0' }} />

              {/* Summary table */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '8px 24px', fontSize: 10, fontFamily: "'Courier New',monospace" }}>
                <div style={{ color: T.textMid, letterSpacing: 2 }}>CATEGORY</div>
                <div style={{ color: T.textMid, letterSpacing: 2, textAlign: 'right' }}>COUNT</div>
                <div style={{ color: T.textMid, letterSpacing: 2, textAlign: 'right' }}>RATIO</div>
                {QUALITY_ROWS.map(({ key, color }) => (
                  <React.Fragment key={key}>
                    <div style={{ color }}>{t(DQ_I18N_KEY[key], lang)}</div>
                    <div style={{ color: T.text, textAlign: 'right' }}>{metrics.distribution[key]}</div>
                    <div style={{ color: T.textDim, textAlign: 'right' }}>
                      {metrics.total > 0 ? ((metrics.distribution[key] / metrics.total) * 100).toFixed(1) : '0.0'}%
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* ── Note ── */}
            <div style={{
              marginTop: 16, border: `1px solid ${T.borderDim}22`,
              borderLeft: `2px solid ${T.textMid}`,
              padding: '10px 16px', color: T.textDim, fontSize: 10,
              fontFamily: "'Courier New',monospace", letterSpacing: 1, lineHeight: 1.8,
            }}>
              {t('metricsNote', lang)}
            </div>
          </>
        )}
      </PageLayout>
    </div>
  )
}
