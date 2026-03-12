import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, Button, Input, Textarea, Select, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import { lessonRepository } from '../db/repositories'
import type { LessonRecord, DecisionQuality, LessonPhase } from '../types/domain'

const QUALITY_COLOR: Record<DecisionQuality, string> = {
  good_process_good_outcome: T.green,
  good_process_bad_outcome:  T.yellow,
  bad_process_good_outcome:  T.orange,
  bad_process_bad_outcome:   T.red,
}

const QUALITY_LABEL: Record<DecisionQuality, string> = {
  good_process_good_outcome: '良プロセス・良結果',
  good_process_bad_outcome:  '良プロセス・悪結果（運）',
  bad_process_good_outcome:  '悪プロセス・良結果（運）',
  bad_process_bad_outcome:   '悪プロセス・悪結果',
}

const PHASE_COLOR: Record<LessonPhase, string> = {
  candidate:      T.textDim,
  pattern:        T.yellow,
  validated_rule: T.green,
}

type ActiveTab = 'lessons' | 'rules'

export default function LessonPage() {
  const { id: companyId } = useParams<{ id?: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [lessons, setLessons] = useState<LessonRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<ActiveTab>('lessons')

  const [form, setForm] = useState({
    ticker: company?.ticker ?? '',
    entryThesis: '',
    entryPrice: null as number | null,
    exitPrice: null as number | null,
    actualReturn: null as number | null,
    benchmarkReturn: null as number | null,
    benchmarkLabel: 'S&P500',
    decisionQuality: 'good_process_bad_outcome' as DecisionQuality,
    rootCause: '',
    missedSignal: '',
    ruleCandidate: '',
    confidence: 3 as 1|2|3|4|5,
    counterfactual: '',
  })

  useEffect(() => {
    if (companyId) {
      lessonRepository.listByCompany(companyId).then(setLessons)
    } else {
      lessonRepository.list().then(setLessons)
    }
  }, [companyId])

  async function handleSave() {
    if (!form.rootCause.trim()) { showToast(t('rootCauseRequired', lang), 'error'); return }
    setLoading(true)
    try {
      const lesson = await lessonRepository.create({
        companyId: companyId ?? 'global',
        ticker: form.ticker || company?.ticker || '—',
        entryThesis: form.entryThesis,
        entryPrice: form.entryPrice,
        exitPrice: form.exitPrice,
        actualReturn: form.actualReturn,
        benchmarkReturn: form.benchmarkReturn,
        benchmarkLabel: form.benchmarkLabel,
        decisionQuality: form.decisionQuality,
        rootCause: form.rootCause,
        missedSignal: form.missedSignal || null,
        ruleCandidate: form.ruleCandidate || null,
        confidence: form.confidence,
        phase: 'candidate',
        counterfactual: form.counterfactual || null,
      })
      setLessons(p => [lesson, ...p])
      setShowForm(false)
      showToast(t('lessonSaved', lang), 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  async function promotePhase(lesson: LessonRecord) {
    const next: Record<LessonPhase, LessonPhase | null> = {
      candidate: 'pattern', pattern: 'validated_rule', validated_rule: null
    }
    const nextPhase = next[lesson.phase]
    if (!nextPhase) return
    const updated = await lessonRepository.update(lesson.id, { phase: nextPhase })
    if (updated) setLessons(p => p.map(l => l.id === lesson.id ? updated : l))
    showToast(`Phase: ${nextPhase}`, 'success')
  }

  const validatedRules = lessons.filter(l => l.phase === 'validated_rule')

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={companyId ? 'LESSONS' : 'LESSON LIBRARY'}
        subtitle={company ? `${company.ticker} / LESSONS` : 'ALL CASES / LESSONS'}
        actions={
          activeTab === 'lessons'
            ? <Button onClick={() => setShowForm(!showForm)} accent={T.slate} size="sm">{showForm ? t('cancelBtn', lang) : t('newLesson', lang)}</Button>
            : undefined
        }
      >
        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.borderDim}` }}>
          {([
            ['lessons', t('tabAllLessons', lang), lessons.length],
            ['rules',   t('tabRuleLibrary', lang), validatedRules.length],
          ] as [ActiveTab, string, number][]).map(([key, label, count]) => (
            <button key={key} onClick={() => { setActiveTab(key); setShowForm(false) }}
              style={{
                padding: '9px 20px', cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: `2px solid ${activeTab === key ? T.slate : 'transparent'}`,
                color: activeTab === key ? T.text : T.textDim,
                fontFamily: "'Courier New',monospace", fontSize: 10, letterSpacing: 3,
                transition: 'all 0.15s',
              }}>
              {label}
              <span style={{ marginLeft: 6, color: activeTab === key ? T.slate : T.textMid, fontSize: 9 }}>({count})</span>
            </button>
          ))}
        </div>

        {/* ── ALL LESSONS tab ────────────────────────────────────── */}
        {activeTab === 'lessons' && (
          <>
            {/* New lesson form */}
            {showForm && (
              <div style={{ border: `1px solid ${T.borderDim}`, padding: '20px 24px', marginBottom: 24, background: '#080D12' }}>
                <SectionHeader label="NEW LESSON" color={T.slate} />
                <div style={{ marginBottom: 12, background: `rgba(${hexRgb(T.yellow)},0.06)`, border: `1px solid ${T.yellow}22`, padding: '10px 14px' }}>
                  <div style={{ color: T.yellow, fontSize: 9, letterSpacing: 3, marginBottom: 4 }}>PROCESS / OUTCOME SEPARATION</div>
                  <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.6 }}>
                    プロセスと結果を切り離して記録する。良いプロセスで悪い結果（unlucky）を誤ってルール化しない。
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <Input label="Ticker" value={form.ticker} onChange={v => setForm(p => ({ ...p, ticker: v }))} placeholder="NVDA" accent={T.slate} />
                    <Textarea label="Entry Thesis（当時の投資仮説）" value={form.entryThesis} onChange={v => setForm(p => ({ ...p, entryThesis: v }))} rows={2} placeholder="NvidiaはCUDAで..." accent={T.slate} />
                    <Select label="Decision Quality" value={form.decisionQuality}
                      onChange={v => setForm(p => ({ ...p, decisionQuality: v as DecisionQuality }))}
                      options={Object.entries(QUALITY_LABEL).map(([k, v]) => ({ value: k, label: v }))} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {([
                        ['entryPrice',     'Entry Price',         '480'],
                        ['exitPrice',      'Exit Price',          '320'],
                        ['actualReturn',   'Actual Return (%)',   '-33'],
                        ['benchmarkReturn','Benchmark Return (%)','+8'],
                      ] as const).map(([field, label, ph]) => (
                        <div key={field}>
                          <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>{label}</label>
                          <input type="number" value={(form[field] as number | null) ?? ''}
                            onChange={e => setForm(p => ({ ...p, [field]: e.target.value ? parseFloat(e.target.value) : null }))}
                            placeholder={ph} style={{ width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' as const }} />
                        </div>
                      ))}
                    </div>
                    <Input label="Benchmark" value={form.benchmarkLabel} onChange={v => setForm(p => ({ ...p, benchmarkLabel: v }))} placeholder="S&P500" accent={T.slate} />
                  </div>
                  <div>
                    <Textarea label="Root Cause *（必須：なぜこの判断になったか）" value={form.rootCause} onChange={v => setForm(p => ({ ...p, rootCause: v }))} rows={3} placeholder="バリュエーションリスクを過小評価。IC-06.5で計算したCAGRが楽観バイアスに汚染されていた" accent={T.slate} />
                    <Textarea label="Missed Signal（見落としたシグナル）" value={form.missedSignal} onChange={v => setForm(p => ({ ...p, missedSignal: v }))} rows={2} placeholder="競合のROCM採用速度が想定より速かった" accent={T.slate} />
                    <Textarea label="Rule Candidate（ルール化できる教訓）" value={form.ruleCandidate} onChange={v => setForm(p => ({ ...p, ruleCandidate: v }))} rows={2} placeholder="半導体サイクル銘柄のBear CAGRは必ず-20%以下でシミュレーションする" accent={T.slate} />
                    <Textarea label="Counterfactual（反事実：もし〜していたら）" value={form.counterfactual} onChange={v => setForm(p => ({ ...p, counterfactual: v }))} rows={2} placeholder="もしBear CAGRが-20%でブロックされていたら、このポジションは取らなかった" accent={T.slate} />
                    <div>
                      <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>CONFIDENCE (1-5)</label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[1,2,3,4,5].map(s => (
                          <button key={s} onClick={() => setForm(p => ({ ...p, confidence: s as 1|2|3|4|5 }))}
                            style={{ flex: 1, padding: '8px 0', border: `1px solid ${form.confidence === s ? T.slate : T.borderDim}`, background: form.confidence === s ? `rgba(${hexRgb(T.slate)},0.15)` : 'transparent', color: form.confidence === s ? T.slate : T.textDim, cursor: 'pointer', fontFamily: "'Courier New',monospace", fontSize: 12 }}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <Button onClick={handleSave} loading={loading} accent={T.slate}>{t('saveLesson', lang)}</Button>
                </div>
              </div>
            )}

            {/* Lessons list */}
            {lessons.length === 0 ? (
              <div style={{ color: T.textDim, fontSize: 12, letterSpacing: 3, textAlign: 'center', marginTop: 60 }}>{t('noLessons', lang)}</div>
            ) : (
              lessons.map(lesson => (
                <LessonCard key={lesson.id} lesson={lesson} lang={lang} onPromote={() => promotePhase(lesson)} />
              ))
            )}
          </>
        )}

        {/* ── RULE LIBRARY tab ───────────────────────────────────── */}
        {activeTab === 'rules' && (
          <>
            {validatedRules.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: 60 }}>
                <div style={{ color: T.green, fontSize: 28, marginBottom: 16 }}>☐</div>
                <div style={{ color: T.textDim, fontSize: 12, letterSpacing: 3, marginBottom: 8 }}>{t('noRules', lang)}</div>
                <div style={{ color: T.textMid, fontSize: 10, letterSpacing: 1 }}>
                  ALL LESSONS タブで Lesson を → PATTERN → VALIDATED_RULE に昇格してください
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {validatedRules.map(rule => (
                  <RuleCard key={rule.id} rule={rule} lang={lang} />
                ))}
              </div>
            )}
          </>
        )}
      </PageLayout>
    </div>
  )
}

// ── Lesson card (ALL LESSONS tab) ─────────────────────────────────────────
function LessonCard({ lesson, lang, onPromote }: {
  lesson: LessonRecord
  lang: Lang
  onPromote: () => void
}) {
  const qCol = QUALITY_COLOR[lesson.decisionQuality]
  return (
    <div style={{ border: `1px solid ${qCol}33`, borderLeft: `3px solid ${qCol}`, padding: '16px 20px', marginBottom: 12, background: '#080D12' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <span style={{ color: T.cyan, fontWeight: 700, fontSize: 13, marginRight: 10 }}>{lesson.ticker}</span>
          <span style={{ color: qCol, fontSize: 10 }}>{QUALITY_LABEL[lesson.decisionQuality]}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ color: PHASE_COLOR[lesson.phase], border: `1px solid ${PHASE_COLOR[lesson.phase]}`, padding: '2px 8px', fontSize: 9, letterSpacing: 2 }}>{lesson.phase.toUpperCase()}</span>
          {lesson.phase !== 'validated_rule' && (
            <span style={{ color: T.textDim, fontSize: 9, cursor: 'pointer' }} onClick={onPromote}>{t('promoteBtn', lang)}</span>
          )}
        </div>
      </div>
      <div style={{ color: T.text, fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
        <strong style={{ color: T.textDim, fontSize: 9, letterSpacing: 2 }}>ROOT CAUSE</strong><br />
        {lesson.rootCause}
      </div>
      {lesson.ruleCandidate && (
        <div style={{ color: T.yellow, fontSize: 11, lineHeight: 1.6, padding: '8px 12px', background: `rgba(${hexRgb(T.yellow)},0.05)`, border: `1px solid ${T.yellow}22` }}>
          <strong style={{ fontSize: 9, letterSpacing: 2 }}>RULE CANDIDATE: </strong>{lesson.ruleCandidate}
        </div>
      )}
      <div style={{ display: 'flex', gap: 20, marginTop: 10, color: T.textDim, fontSize: 10 }}>
        {lesson.actualReturn !== null && (
          <span>Return: <strong style={{ color: lesson.actualReturn >= 0 ? T.green : T.red }}>{lesson.actualReturn > 0 ? '+' : ''}{lesson.actualReturn}%</strong></span>
        )}
        {lesson.benchmarkReturn !== null && (
          <span>vs {lesson.benchmarkLabel}: <strong style={{ color: T.textDim }}>{lesson.benchmarkReturn > 0 ? '+' : ''}{lesson.benchmarkReturn}%</strong></span>
        )}
        <span>Confidence: {lesson.confidence}/5</span>
        <span>{lesson.createdAt.slice(0, 10)}</span>
      </div>
    </div>
  )
}

// ── Rule card (RULE LIBRARY tab) ──────────────────────────────────────────
function RuleCard({ rule, lang: _lang }: { rule: LessonRecord; lang: Lang }) {
  const qCol = QUALITY_COLOR[rule.decisionQuality]
  const ruleText = rule.ruleCandidate ?? rule.rootCause

  return (
    <div style={{
      border: `1px solid ${T.green}44`,
      borderLeft: `4px solid ${T.green}`,
      background: '#080D12',
      padding: '18px 20px',
    }}>
      {/* Rule text — prominent */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ color: T.green, fontSize: 8, letterSpacing: 3, marginBottom: 8 }}>
          {t('ruleLabel', _lang)} #{rule.confidence}/5 CONFIDENCE
        </div>
        <div style={{ color: T.text, fontSize: 13, lineHeight: 1.7, fontWeight: 500 }}>
          {ruleText}
        </div>
      </div>

      {/* Root cause (only if ruleCandidate was used above) */}
      {rule.ruleCandidate && (
        <div style={{
          borderTop: `1px solid ${T.borderDim}`, paddingTop: 10, marginBottom: 10,
        }}>
          <div style={{ color: T.textMid, fontSize: 8, letterSpacing: 2, marginBottom: 4 }}>ROOT CAUSE</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.6 }}>{rule.rootCause}</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: T.cyan, fontWeight: 700, fontSize: 11 }}>{rule.ticker}</span>
          <span style={{
            color: qCol,
            border: `1px solid ${qCol}44`,
            background: `rgba(${hexRgb(qCol)},0.08)`,
            fontSize: 8, letterSpacing: 1, padding: '2px 7px',
          }}>
            {QUALITY_LABEL[rule.decisionQuality]}
          </span>
        </div>
        <div style={{ color: T.textMid, fontSize: 9 }}>{rule.createdAt.slice(0, 10)}</div>
      </div>
    </div>
  )
}
