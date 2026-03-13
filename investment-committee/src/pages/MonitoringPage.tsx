import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  T, Button, Input, Textarea, Select, PageLayout, SectionHeader,
  hexRgb, NumericInput, InfoRow
} from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { monitoringRepository, thesisRepository } from '../db/repositories'
import { evaluateMonitorItemStatus, calculateThesisStatus } from '../lib/calculators'
import type { MonitoringPlan, MonitorItem, CollapseOperator, ThesisStatus } from '../types/domain'

function uid() { return crypto.randomUUID() }

function emptyItem(): MonitorItem {
  return {
    id: uid(), label: '', metricKey: null,
    currentValue: null, threshold: null, operator: '<',
    status: 'manual_check', note: null, updatedAt: new Date().toISOString(),
  }
}

const STATUS_COLOR: Record<string, string> = {
  ok: T.green, warning: T.yellow, breach: T.red, manual_check: T.textDim,
}

const THESIS_STATUS_COLOR: Record<ThesisStatus, string> = {
  intact: T.green, warning: T.yellow, broken: T.red,
}

export default function MonitoringPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [items, setItems] = useState<MonitorItem[]>([emptyItem()])
  const [nextReview, setNextReview] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    monitoringRepository.get(companyId).then(m => {
      if (m) {
        setItems(m.monitorItems.length > 0 ? m.monitorItems : [emptyItem()])
        setNextReview(m.nextReviewDate ?? '')
        setSavedAt(m.updatedAt)
      }
    })
    // Import collapse conditions from thesis
    thesisRepository.getLatest(companyId).then(t => {
      if (t && t.collapseConditions.length > 0) {
        setItems(t.collapseConditions.map(c => ({
          id: c.id, label: c.label, metricKey: c.metricKey,
          currentValue: null, threshold: c.threshold,
          operator: c.operator === 'manual' ? '<' : c.operator as CollapseOperator,
          status: 'manual_check' as const, note: c.note, updatedAt: new Date().toISOString(),
        })))
      }
    })
  }, [companyId])

  const evaluatedItems = items.map(item => ({
    ...item,
    status: evaluateMonitorItemStatus(item),
  }))
  const thesisStatus = calculateThesisStatus(evaluatedItems)

  function addItem() { setItems(p => [...p, emptyItem()]) }
  function removeItem(id: string) { setItems(p => p.filter(i => i.id !== id)) }
  function updateItem(id: string, patch: Partial<MonitorItem>) {
    setItems(p => p.map(i => i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i))
  }

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const evaluated = items.map(item => ({ ...item, status: evaluateMonitorItemStatus(item) }))
      const status = calculateThesisStatus(evaluated)
      const saved = await monitoringRepository.save({
        companyId, thesisStatus: status, monitorItems: evaluated,
        nextReviewDate: nextReview || null,
      })
      setSavedAt(saved?.updatedAt ?? null)
      showToast('Monitoring saved', 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('monitoringTitle', lang)}
        subtitle={`${company?.ticker ?? ''} / MONITORING`}
        backTo={`/companies/${companyId}`}
        actions={<Button onClick={handleSave} loading={loading} accent={T.sky}>SAVE</Button>}
      >
        {/* Thesis status */}
        <div style={{ border: `2px solid ${THESIS_STATUS_COLOR[thesisStatus]}`, padding: '16px 20px', marginBottom: 24, background: `rgba(${hexRgb(THESIS_STATUS_COLOR[thesisStatus])},0.06)`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 4, marginBottom: 6 }}>{t("thesisStatus", lang)}</div>
            <div style={{ color: THESIS_STATUS_COLOR[thesisStatus], fontSize: 22, fontWeight: 700, letterSpacing: 4 }}>
              {thesisStatus.toUpperCase()}
            </div>
          </div>
          <div style={{ textAlign: 'right', color: T.textDim, fontSize: 10 }}>
            <div>Breach: {evaluatedItems.filter(i => i.status === 'breach').length}</div>
            <div>Warning: {evaluatedItems.filter(i => i.status === 'warning').length}</div>
            <div>OK: {evaluatedItems.filter(i => i.status === 'ok').length}</div>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>{t("nextReviewDate", lang)}</label>
          <input type="date" value={nextReview} onChange={e => setNextReview(e.target.value)}
            style={{ background: '#080D12', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '9px 12px', outline: 'none' }} />
        </div>

        <SectionHeader label="MONITOR ITEMS" color={T.sky} />
        {evaluatedItems.map((item) => (
          <div key={item.id} style={{ border: `1px solid ${STATUS_COLOR[item.status]}33`, borderLeft: `3px solid ${STATUS_COLOR[item.status]}`, padding: '14px 16px', marginBottom: 10, background: '#080D12' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ color: STATUS_COLOR[item.status], fontSize: 10, fontWeight: 700, letterSpacing: 2 }}>
                {item.status.toUpperCase().replace('_', ' ')}
              </span>
              <button onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 10 }}>REMOVE</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>{t("conditionLabelMonitor", lang)}</label>
                <input value={item.label} onChange={e => updateItem(item.id, { label: e.target.value })}
                  placeholder="Revenue growth < 5%" style={{ width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>OPERATOR</label>
                <select value={item.operator} onChange={e => updateItem(item.id, { operator: e.target.value as CollapseOperator })}
                  style={{ width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none' }}>
                  {['<', '<=', '>', '>=', '=', 'manual'].map(o => <option key={o} value={o} style={{ background: '#0A1520' }}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>THRESHOLD</label>
                <input type="number" value={item.threshold ?? ''} onChange={e => updateItem(item.id, { threshold: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="5" style={{ width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
              <div>
                <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, display: 'block', marginBottom: 4 }}>CURRENT VALUE</label>
                <input type="number" value={item.currentValue ?? ''} onChange={e => updateItem(item.id, { currentValue: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="実測値" style={{ width: '100%', background: 'rgba(8,13,18,0.8)', border: `1px solid ${T.borderDim}`, color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12, padding: '7px 10px', outline: 'none', boxSizing: 'border-box' as const }} />
              </div>
            </div>
          </div>
        ))}
        <Button onClick={addItem} variant="ghost" size="sm" accent={T.sky}>{t('addItem', lang)}</Button>

        {savedAt && <div style={{ color: T.textDim, fontSize: 10, marginTop: 16 }}>Last saved: {savedAt.slice(0, 16)}</div>}
      </PageLayout>
    </div>
  )
}
