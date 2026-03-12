import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, Input, Textarea, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { thesisRepository } from '../db/repositories'
import type { ThesisAnalysis, CollapseCondition } from '../types/domain'

function uid() { return crypto.randomUUID() }

export default function ThesisPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [thesis, setThesis] = useState<ThesisAnalysis | null>(null)
  const [thesisText, setThesisText] = useState('')
  const [drivers, setDrivers] = useState<string[]>(['', '', ''])
  const [collapseConditions, setCollapseConditions] = useState<CollapseCondition[]>([
    { id: uid(), label: '', metricKey: null, operator: 'manual', threshold: null, unit: null, note: null }
  ])
  const [confidenceNote, setConfidenceNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    thesisRepository.getLatest(companyId).then(t => {
      if (t) {
        setThesis(t)
        setThesisText(t.thesisText)
        setDrivers(t.drivers.length > 0 ? t.drivers : ['', '', ''])
        setCollapseConditions(t.collapseConditions.length > 0 ? t.collapseConditions : [
          { id: uid(), label: '', metricKey: null, operator: 'manual', threshold: null, unit: null, note: null }
        ])
        setConfidenceNote(t.confidenceNote ?? '')
      }
    })
  }, [companyId])

  async function handleSave() {
    if (!companyId || !thesisText.trim()) {
      showToast(t('err_ticker', lang) + ' — thesis', 'error'); return
    }
    setLoading(true)
    try {
      const input = {
        companyId,
        thesisText: thesisText.trim(),
        drivers: drivers.filter(d => d.trim()),
        collapseConditions: collapseConditions.filter(c => c.label.trim()),
        monitoringMetrics: thesis?.monitoringMetrics ?? [],
        confidenceNote: confidenceNote || null,
      }
      const saved = thesis
        ? await thesisRepository.update(thesis.id, input)
        : await thesisRepository.create(input)
      setThesis(saved ?? null)
      showToast('Thesis saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  function addCollapse() {
    setCollapseConditions(p => [...p, { id: uid(), label: '', metricKey: null, operator: 'manual', threshold: null, unit: null, note: null }])
  }
  function removeCollapse(id: string) {
    setCollapseConditions(p => p.filter(c => c.id !== id))
  }
  function updateCollapse(id: string, patch: Partial<CollapseCondition>) {
    setCollapseConditions(p => p.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('thesisTitle', lang)} subtitle={`${company?.ticker ?? ''} / THESIS`}>
        <div style={{ border: `1px solid ${T.purple}22`, borderLeft: `2px solid ${T.purple}`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(T.purple)},0.04)` }}>
          <div style={{ color: T.purple, fontSize: 9, letterSpacing: 4, marginBottom: 4 }}>{t('thesisLaneNote', lang)}</div>
          <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.7 }}>
            {t('thesisLaneNoteBody', lang)}
          </div>
        </div>

        <SectionHeader label="INVESTMENT THESIS" color={T.purple} />
        <Textarea
          label="Investment Thesis（1行で。なぜこの会社が市場に勝つか）"
          value={thesisText}
          onChange={setThesisText}
          rows={3}
          placeholder="NvidiaはCUDAというAIインフラのOSを通じて、ソフトウェアレベルの価格決定権と10年以上のモートを持つ"
          accent={T.purple}
        />

        <SectionHeader label="DRIVERS（仮説を支える3つの根拠）" color={T.purple} />
        {drivers.map((d, i) => (
          <Input key={i} label={`Driver ${i + 1}`} value={d}
            onChange={v => setDrivers(p => { const n = [...p]; n[i] = v; return n })}
            placeholder={['CUDAエコシステムのスイッチングコスト', 'データセンター需要の構造的成長', 'ソフトウェア事業の拡大'][i]}
            accent={T.purple} />
        ))}

        <SectionHeader label="COLLAPSE CONDITIONS（仮説崩壊条件）" color={T.red} />
        <div style={{ marginBottom: 8, color: T.textDim, fontSize: 10, lineHeight: 1.6 }}>
          この仮説が崩れる条件を具体的に定義する。曖昧な表現は禁止。数値トリガーを優先する。
        </div>
        {collapseConditions.map((c, i) => (
          <div key={c.id} style={{ border: `1px solid ${T.borderDim}`, padding: '12px 16px', marginBottom: 10, background: '#080D12' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3 }}>CONDITION {i + 1}</div>
              {collapseConditions.length > 1 && (
                <span style={{ color: T.red, fontSize: 10, cursor: 'pointer' }} onClick={() => removeCollapse(c.id)}>REMOVE</span>
              )}
            </div>
            <Input label="条件ラベル" value={c.label}
              onChange={v => updateCollapse(c.id, { label: v })}
              placeholder="AMDがROCmのCUDA互換を主要クラウド3社で採用" accent={T.red} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>演算子</label>
                <select value={c.operator} onChange={e => updateCollapse(c.id, { operator: e.target.value as any })}
                  style={{ width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '9px 12px', outline: 'none' }}>
                  {['manual', '<', '<=', '>', '>=', '='].map(o => <option key={o} value={o} style={{ background: '#0A1520' }}>{o === 'manual' ? 'manual（定性）' : o}</option>)}
                </select>
              </div>
              <Input label="閾値（数値）" value={c.threshold?.toString() ?? ''}
                onChange={v => updateCollapse(c.id, { threshold: v ? parseFloat(v) : null })}
                placeholder="3" accent={T.red} />
              <Input label="単位" value={c.unit ?? ''}
                onChange={v => updateCollapse(c.id, { unit: v || null })}
                placeholder="社, %, x" accent={T.red} />
            </div>
          </div>
        ))}
        <Button onClick={addCollapse} variant="ghost" size="sm" accent={T.red}>{t('addCondition', lang)}</Button>

        <SectionHeader label="CONFIDENCE NOTE" color={T.textDim} />
        <Textarea label="確信度メモ（なぜこのThesisを信じるか）" value={confidenceNote} onChange={setConfidenceNote} rows={3}
          placeholder="実際にNvidiaのMLエンジニアと話した。CUDAからの移行コストは2年分の開発工数に相当する..." accent={T.textDim} />

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <Button onClick={handleSave} loading={loading} accent={T.purple}>{t('saveThesis', lang)}</Button>
        </div>
        {thesis && <div style={{ color: T.textDim, fontSize: 10, marginTop: 8 }}>Last saved: {thesis.updatedAt.slice(0, 16)} | Version: {thesis.version}</div>}
      </PageLayout>
    </div>
  )
}
