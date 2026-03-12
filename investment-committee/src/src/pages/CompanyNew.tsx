import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { T, Input, NumericInput, Select, Button, PageLayout, SectionHeader } from '../components/common/ui'
import { useStore } from '../state/store'
import { t } from '../lib/i18n'
import { companyRepository } from '../db/repositories'

export default function CompanyNew() {
  const navigate = useNavigate()
  const { upsertCompany, showToast, lang } = useStore()
  const [form, setForm] = useState({
    ticker: '', companyName: '', sector: '',
    currentPrice: null as number | null,
    marketCap: null as number | null,
    enterpriseValue: null as number | null,
    investmentHorizonMonths: 36,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  function validate() {
    const e: Record<string, string> = {}
    if (!form.ticker.trim()) e.ticker = t('err_ticker', lang)
    if (!form.companyName.trim()) e.companyName = t('err_company', lang)
    if (form.investmentHorizonMonths < 6 || form.investmentHorizonMonths > 120)
      e.horizon = t('err_horizon', lang)
    return e
  }

  async function handleSubmit() {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setLoading(true)
    try {
      const company = await companyRepository.create({
        ticker: form.ticker.toUpperCase().trim(),
        companyName: form.companyName.trim(),
        sector: form.sector || null,
        currentPrice: form.currentPrice,
        marketCap: form.marketCap,
        enterpriseValue: form.enterpriseValue,
        investmentHorizonMonths: form.investmentHorizonMonths,
        status: 'draft',
      })
      upsertCompany(company)
      showToast(t('created', lang, { ticker: company.ticker }), 'success')
      navigate(`/companies/${company.id}`)
    } catch (err) {
      showToast(t('saveFailed', lang), 'error')
    }
    setLoading(false)
  }

  const SECTORS = [
    '', 'Technology', 'Healthcare', 'Financials', 'Consumer Discretionary',
    'Consumer Staples', 'Industrials', 'Energy', 'Materials',
    'Real Estate', 'Utilities', 'Communication Services',
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('newCaseTitle', lang)} subtitle={t('newCaseSubtitle', lang)}>
        <div style={{ maxWidth: 600 }}>
          {/* @ts-ignore */}<SectionHeader label={t("identification", lang)} color={T.cyan} />
          <Input label={t('tickerLabel', lang)} value={form.ticker} onChange={v => setForm(f => ({ ...f, ticker: v.toUpperCase() }))} error={errors.ticker} placeholder="NVDA" accent={T.cyan} />
          <Input label={t('companyNameLabel', lang)} value={form.companyName} onChange={v => setForm(f => ({ ...f, companyName: v }))} error={errors.companyName} placeholder="NVIDIA Corporation" accent={T.cyan} />
          <Select label={t('sectorLabel', lang)} value={form.sector} onChange={v => setForm(f => ({ ...f, sector: v }))}
            options={SECTORS.map(s => ({ value: s, label: s || t('sectorSelect', lang) }))} />

          <SectionHeader label="MARKET DATA (Optional)" color={T.yellow} />
          <NumericInput label={t('currentPriceLabel', lang)} value={form.currentPrice} onChange={v => setForm(f => ({ ...f, currentPrice: v }))} unit="$" placeholder="480" />
          <NumericInput label={t('marketCapLabel', lang)} value={form.marketCap} onChange={v => setForm(f => ({ ...f, marketCap: v }))} unit="$M" placeholder="1200000" />
          <NumericInput label={t('evLabel', lang)} value={form.enterpriseValue} onChange={v => setForm(f => ({ ...f, enterpriseValue: v }))} unit="$M" placeholder="1180000" />

          <SectionHeader label="PARAMETERS" color={T.orange} />
          <NumericInput label={t('horizonLabel', lang)} value={form.investmentHorizonMonths} onChange={v => setForm(f => ({ ...f, investmentHorizonMonths: v ?? 36 }))} unit="months" placeholder="36" accent={T.orange} />
          {errors.horizon && <div style={{ color: T.red, fontSize: 10, marginBottom: 10 }}>{errors.horizon}</div>}

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Button onClick={handleSubmit} loading={loading} accent={T.cyan}>{t('createBtn', lang)}</Button>
            <Button onClick={() => navigate('/companies')} variant="ghost" accent={T.slate}>{t('cancelBtn', lang)}</Button>
          </div>
        </div>
      </PageLayout>
    </div>
  )
}
