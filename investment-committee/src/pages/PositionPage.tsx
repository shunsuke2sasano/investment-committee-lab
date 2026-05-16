import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { T, Button, PageLayout, SectionHeader, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { positionRepository } from '../db/repositories'
import { t } from '../lib/i18n'
import type { PositionRecord, PositionStatus } from '../types/domain'

export default function PositionPage() {
  const { id: companyId } = useParams<{ id: string }>()
  const companies = useStore(s => s.companies)
  const company = companies.find(c => c.id === companyId)
  const { showToast, lang } = useStore()

  const [record, setRecord] = useState<PositionRecord | null>(null)
  const [status, setStatus] = useState<PositionStatus>('watching')
  const [entryDate, setEntryDate] = useState('')
  const [entryPrice, setEntryPrice] = useState('')
  const [shares, setShares] = useState('')
  const [currency, setCurrency] = useState<'USD' | 'JPY'>('USD')
  const [entryEvEbitda, setEntryEvEbitda] = useState('')
  const [entryVerdict, setEntryVerdict] = useState<'BUY' | 'WATCH' | 'PASS' | ''>('')
  const [exitDate, setExitDate] = useState('')
  const [exitPrice, setExitPrice] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!companyId) return
    positionRepository.get(companyId).then(r => {
      if (r) {
        setRecord(r)
        setStatus(r.status)
        setEntryDate(r.entryDate ?? '')
        setEntryPrice(r.entryPrice?.toString() ?? '')
        setShares(r.shares?.toString() ?? '')
        setCurrency(r.entryCurrency)
        setEntryEvEbitda(r.entryEvEbitda?.toString() ?? '')
        setEntryVerdict(r.entryVerdict ?? '')
        setExitDate(r.exitDate ?? '')
        setExitPrice(r.exitPrice?.toString() ?? '')
        setNote(r.note ?? '')
      }
    })
  }, [companyId])

  async function handleSave() {
    if (!companyId) return
    setLoading(true)
    try {
      const saved = await positionRepository.save({
        companyId,
        status,
        entryDate: entryDate || null,
        entryPrice: entryPrice ? parseFloat(entryPrice) : null,
        shares: shares ? parseFloat(shares) : null,
        entryCurrency: currency,
        entryEvEbitda: entryEvEbitda ? parseFloat(entryEvEbitda) : null,
        entryVerdict: entryVerdict || null,
        exitDate: exitDate || null,
        exitPrice: exitPrice ? parseFloat(exitPrice) : null,
        note: note.trim() || null,
      })
      setRecord(saved)
      showToast(t('positionSave', lang), 'success')
    } catch {
      showToast(t('saveFailed', lang), 'error')
    }
    setLoading(false)
  }

  // ── P&L calculations ────────────────────────────────────────────────────
  const ep = entryPrice ? parseFloat(entryPrice) : null
  const sh = shares ? parseFloat(shares) : null
  const cp = company?.currentPrice ?? null
  const xp = exitPrice ? parseFloat(exitPrice) : null

  const entryValue = ep != null && sh != null ? ep * sh : null
  const currentValue = cp != null && sh != null ? cp * sh : null
  const unrealizedPnl = entryValue != null && currentValue != null ? currentValue - entryValue : null
  const unrealizedPct = unrealizedPnl != null && entryValue ? (unrealizedPnl / entryValue) * 100 : null

  const realizedPnl = ep != null && xp != null && sh != null ? (xp - ep) * sh : null
  const realizedPct = ep != null && xp != null && ep !== 0 ? ((xp - ep) / ep) * 100 : null

  const holdingMonths = entryDate
    ? Math.floor((Date.now() - new Date(entryDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null

  function pnlColor(val: number | null) {
    if (val == null) return T.textDim
    if (val > 0) return T.green
    if (val < 0) return T.red
    return T.textDim
  }

  function fmt(val: number, decimals = 2) {
    const sign = val >= 0 ? '+' : ''
    return `${sign}${val.toFixed(decimals)}`
  }

  const STATUS_OPTS: { value: PositionStatus; labelKey: 'positionWatching' | 'positionHolding' | 'positionSold'; color: string }[] = [
    { value: 'watching', labelKey: 'positionWatching', color: T.textDim },
    { value: 'holding',  labelKey: 'positionHolding',  color: T.green },
    { value: 'sold',     labelKey: 'positionSold',     color: T.red },
  ]

  const showPnl = status === 'holding' || status === 'sold'

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('positionTitle', lang)}
        subtitle={`${company?.ticker ?? ''} / POSITION`}
        backTo={`/companies/${companyId}`}
        actions={
          <Button onClick={handleSave} loading={loading} accent={T.cyan}>
            {t('positionSave', lang)}
          </Button>
        }
      >
        {/* ── Status ─────────────────────────────────────────────────── */}
        <SectionHeader label={t('positionStatus', lang)} color={T.cyan} />
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {STATUS_OPTS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              style={{
                padding: '8px 20px',
                border: `1px solid ${status === opt.value ? opt.color : T.borderDim}`,
                background: status === opt.value ? `rgba(${hexRgb(opt.color)},0.12)` : 'transparent',
                color: status === opt.value ? opt.color : T.textDim,
                fontFamily: "'Courier New',monospace",
                fontSize: 10, letterSpacing: 2,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {t(opt.labelKey, lang)}
            </button>
          ))}
        </div>

        {/* ── Entry Info ──────────────────────────────────────────────── */}
        <SectionHeader label={lang === 'ja' ? '購入情報' : 'ENTRY INFORMATION'} color={T.cyan} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <Field label={t('positionEntryDate', lang)}>
            <input
              type="date"
              value={entryDate}
              onChange={e => setEntryDate(e.target.value)}
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = T.cyan }}
              onBlur={e => { e.target.style.borderColor = T.borderDim }}
            />
          </Field>
          <Field label={t('positionCurrency', lang)}>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value as 'USD' | 'JPY')}
              style={inputStyle}
            >
              <option value="USD" style={{ background: '#0A1520' }}>USD</option>
              <option value="JPY" style={{ background: '#0A1520' }}>JPY</option>
            </select>
          </Field>
          <Field label={`${t('positionEntryPrice', lang)} (${currency})`}>
            <input
              type="number"
              value={entryPrice}
              onChange={e => setEntryPrice(e.target.value)}
              placeholder="45.20"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = T.cyan }}
              onBlur={e => { e.target.style.borderColor = T.borderDim }}
            />
          </Field>
          <Field label={t('positionShares', lang)}>
            <input
              type="number"
              value={shares}
              onChange={e => setShares(e.target.value)}
              placeholder="100"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = T.cyan }}
              onBlur={e => { e.target.style.borderColor = T.borderDim }}
            />
          </Field>
          <Field label={t('positionEntryEv', lang)}>
            <input
              type="number"
              value={entryEvEbitda}
              onChange={e => setEntryEvEbitda(e.target.value)}
              placeholder="12.0"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = T.cyan }}
              onBlur={e => { e.target.style.borderColor = T.borderDim }}
            />
          </Field>
          <Field label={lang === 'ja' ? '購入時Verdict' : 'Entry Verdict'}>
            <select
              value={entryVerdict}
              onChange={e => setEntryVerdict(e.target.value as any)}
              style={inputStyle}
            >
              <option value="" style={{ background: '#0A1520' }}>—</option>
              <option value="BUY" style={{ background: '#0A1520' }}>BUY</option>
              <option value="WATCH" style={{ background: '#0A1520' }}>WATCH</option>
              <option value="PASS" style={{ background: '#0A1520' }}>PASS</option>
            </select>
          </Field>
        </div>

        {/* ── P&L Summary (holding / sold) ─────────────────────────── */}
        {showPnl && entryValue != null && (
          <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 20px', marginBottom: 20, background: '#080D12' }}>
            <SectionHeader label={lang === 'ja' ? '損益サマリー' : 'P&L SUMMARY'} color={T.cyan} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
              <PnlCell label={t('positionInvestment', lang)} value={`${currency === 'JPY' ? '¥' : '$'}${entryValue.toLocaleString()}`} color={T.text} />
              {holdingMonths != null && (
                <PnlCell label={t('positionHoldingPeriod', lang)} value={`${holdingMonths}${t('positionMonths', lang)}`} color={T.text} />
              )}
              {cp != null && (
                <PnlCell label={t('positionCurrentPrice', lang)} value={`${currency === 'JPY' ? '¥' : '$'}${cp}`} color={T.text} />
              )}
              {status === 'holding' && unrealizedPnl != null && unrealizedPct != null && (
                <PnlCell
                  label={t('positionUnrealizedPnl', lang)}
                  value={`${currency === 'JPY' ? '¥' : '$'}${fmt(unrealizedPnl, 0)} (${fmt(unrealizedPct, 1)}%)`}
                  color={pnlColor(unrealizedPnl)}
                  large
                />
              )}
            </div>
          </div>
        )}

        {/* ── Exit Info (sold only) ───────────────────────────────────── */}
        {status === 'sold' && (
          <>
            <SectionHeader label={lang === 'ja' ? '売却情報' : 'EXIT INFORMATION'} color={T.red} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <Field label={t('positionExitDate', lang)}>
                <input
                  type="date"
                  value={exitDate}
                  onChange={e => setExitDate(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = T.red }}
                  onBlur={e => { e.target.style.borderColor = T.borderDim }}
                />
              </Field>
              <Field label={`${t('positionExitPrice', lang)} (${currency})`}>
                <input
                  type="number"
                  value={exitPrice}
                  onChange={e => setExitPrice(e.target.value)}
                  placeholder="95.00"
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = T.red }}
                  onBlur={e => { e.target.style.borderColor = T.borderDim }}
                />
              </Field>
            </div>
            {realizedPnl != null && realizedPct != null && (
              <div style={{ border: `1px solid ${pnlColor(realizedPnl)}33`, padding: '12px 16px', marginBottom: 20, background: `rgba(${hexRgb(pnlColor(realizedPnl))},0.05)` }}>
                <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, marginBottom: 6 }}>{t('positionRealizedPnl', lang)}</div>
                <div style={{ color: pnlColor(realizedPnl), fontSize: 24, fontFamily: "'Courier New',monospace", fontWeight: 700 }}>
                  {currency === 'JPY' ? '¥' : '$'}{fmt(realizedPnl, 0)}
                  <span style={{ fontSize: 14, marginLeft: 8 }}>({fmt(realizedPct, 1)}%)</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Note ───────────────────────────────────────────────────── */}
        <SectionHeader label={t('positionNote', lang)} color={T.textDim} />
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          rows={3}
          placeholder={lang === 'ja' ? 'ポジション管理メモ…' : 'Position notes…'}
          style={{
            width: '100%', background: '#080D12',
            border: `1px solid ${T.borderDim}`,
            color: T.text, fontFamily: "'Courier New',monospace", fontSize: 12,
            padding: '10px 12px', outline: 'none', resize: 'vertical',
            boxSizing: 'border-box', marginBottom: 20,
          }}
          onFocus={e => { e.target.style.borderColor = T.cyan }}
          onBlur={e => { e.target.style.borderColor = T.borderDim }}
        />

        {record && (
          <div style={{ color: T.textDim, fontSize: 10 }}>
            {lang === 'ja' ? '最終更新: ' : 'Last saved: '}{record.updatedAt.slice(0, 16)}
          </div>
        )}
      </PageLayout>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  )
}

function PnlCell({ label, value, color, large }: { label: string; value: string; color: string; large?: boolean }) {
  return (
    <div style={{ border: `1px solid ${T.borderDim}`, padding: '10px 14px', background: 'rgba(0,0,0,0.2)' }}>
      <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontSize: large ? 16 : 13, fontFamily: "'Courier New',monospace", fontWeight: large ? 700 : 400 }}>{value}</div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#080D12',
  border: `1px solid ${T.borderDim}`,
  color: T.text,
  fontFamily: "'Courier New',monospace",
  fontSize: 12,
  padding: '9px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
