import React from 'react'
import { useNavigate } from 'react-router-dom'
import { T, Button, VerdictBadge, PageLayout, hexRgb } from '../components/common/ui'
import { useStore } from '../state/store'
import { companyRepository, exportImport } from '../db/repositories'
import type { CompanyCase } from '../types/domain'
import { t } from '../lib/i18n'

const STATUS_COLOR: Record<string, string> = {
  draft: T.textDim, active: T.cyan, archived: T.slate,
}

export default function CompanyList() {
  const navigate = useNavigate()
  const { companies, setCompanies, removeCompany, showToast, lang } = useStore()
  const [search, setSearch] = React.useState('')

  const filtered = companies.filter(c =>
    c.ticker.toLowerCase().includes(search.toLowerCase()) ||
    c.companyName.toLowerCase().includes(search.toLowerCase())
  )

  async function handleDelete(c: CompanyCase) {
    if (!confirm(t('confirmDelete', lang, { ticker: c.ticker }))) return
    await companyRepository.delete(c.id)
    removeCompany(c.id)
    showToast(t('deleted', lang, { ticker: c.ticker }), 'success')
  }

  async function handleExport() {
    const json = await exportImport.exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `investment-committee-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    showToast(t('exportDone', lang), 'success')
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    await exportImport.importAll(text)
    const companies = await companyRepository.list()
    setCompanies(companies)
    showToast(t('importDone', lang), 'success')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout
        title={t('companiesTitle', lang)}
        subtitle={t('companiesSubtitle', lang)}
        actions={
          <>
            <Button onClick={handleExport} variant="ghost" size="sm" accent={T.slate}>{t('export', lang)}</Button>
            <label style={{ cursor: 'pointer' }}>
              <Button variant="ghost" size="sm" accent={T.slate} onClick={() => document.getElementById('import-input')?.click()}>{t('import', lang)}</Button>
              <input id="import-input" type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
            </label>
            <Button onClick={() => navigate('/companies/new')} size="sm" accent={T.cyan}>{t('newCase', lang)}</Button>
          </>
        }
      >
        {/* Search */}
        <input
          placeholder={t('searchPlaceholder', lang)}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`,
            color: T.text, fontFamily: "'Courier New',monospace", fontSize: 13,
            padding: '10px 14px', outline: 'none', marginBottom: 20, boxSizing: 'border-box',
          }}
        />

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 12, letterSpacing: 3, textAlign: 'center', marginTop: 60 }}>
            {companies.length === 0 ? t('noCasesYet', lang) : t('noResults', lang)}
          </div>
        ) : (
          <div style={{ border: `1px solid ${T.borderDim}` }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 80px 80px', padding: '10px 16px', borderBottom: `1px solid ${T.borderDim}`, background: T.surface }}>
              {['TICKER', 'COMPANY', 'SECTOR', 'STATUS', 'VERDICT', ''].map(h => (
                <div key={h} style={{ color: T.textMid, fontSize: 9, letterSpacing: 3 }}>{h}</div>
              ))}
            </div>
            {/* Rows */}
            {filtered.map(c => (
              <div key={c.id}
                style={{ display: 'grid', gridTemplateColumns: '100px 1fr 120px 100px 80px 80px', padding: '13px 16px', borderBottom: `1px solid ${T.borderDim}`, cursor: 'pointer', transition: 'background 0.15s' }}
                onClick={() => navigate(`/companies/${c.id}`)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = `rgba(${hexRgb(T.cyan)},0.04)` }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <div style={{ color: T.cyan, fontWeight: 700, fontSize: 13 }}>{c.ticker}</div>
                <div style={{ color: T.text, fontSize: 12 }}>{c.companyName}</div>
                <div style={{ color: T.textDim, fontSize: 11 }}>{c.sector ?? '—'}</div>
                <div style={{ color: STATUS_COLOR[c.status], fontSize: 10, letterSpacing: 2 }}>{c.status.toUpperCase()}</div>
                <div>—</div>
                <div onClick={e => { e.stopPropagation(); handleDelete(c) }}
                  style={{ color: T.textDim, fontSize: 10, cursor: 'pointer', textAlign: 'right' }}>
                  DEL
                </div>
              </div>
            ))}
          </div>
        )}
      </PageLayout>
    </div>
  )
}
