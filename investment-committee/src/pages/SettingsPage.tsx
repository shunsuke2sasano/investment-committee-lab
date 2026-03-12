import React from 'react'
import { T, Button, Select, PageLayout, SectionHeader, hexRgb, NumericInput, Input } from '../components/common/ui'
import { useStore } from '../state/store'
import { settingsRepository, exportImport } from '../db/repositories'
import { VERDICT_PROFILES } from '../types/domain'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'

export default function SettingsPage() {
  const { settings, setSettings, setActiveProfileId, showToast, lang, setLang } = useStore()
  const [loading, setLoading] = React.useState(false)

  async function handleSave() {
    if (!settings) return
    setLoading(true)
    try {
      const updated = await settingsRepository.update(settings)
      setSettings(updated)
      setActiveProfileId(settings.activeProfileId)
      showToast(t('settingsSaved', lang), 'success')
    } catch { showToast(t('saveFailed', lang), 'error') }
    setLoading(false)
  }

  async function handleExport() {
    const json = await exportImport.exportAll()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ic-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    showToast(t('backupDone', lang), 'success')
  }

  if (!settings) return null

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      <PageLayout title={t('settingsTitle', lang)} subtitle={t('settingsSubtitle', lang)}>
        <div style={{ maxWidth: 600 }}>

          <SectionHeader label={t('langSection', lang)} color={T.cyan} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {(['en', 'ja'] as Lang[]).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{
                padding: '10px 28px', cursor: 'pointer',
                border: `1px solid ${lang === l ? T.cyan : T.borderDim}`,
                background: lang === l ? `rgba(${hexRgb(T.cyan)},0.12)` : 'transparent',
                color: lang === l ? T.cyan : T.textDim,
                fontFamily: "'Courier New', monospace", fontSize: 12, letterSpacing: 3,
                transition: 'all 0.15s',
              }}>
                {l === 'en' ? 'ENGLISH' : '日本語'}
              </button>
            ))}
          </div>

          <SectionHeader label={t('verdictProfileSection', lang)} color={T.pink} />
          <Select label={t('defaultProfile', lang)} value={settings.activeProfileId}
            onChange={v => setSettings({ ...settings, activeProfileId: v as any })}
            options={Object.values(VERDICT_PROFILES).map(p => ({ value: p.id, label: p.label }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
            {Object.values(VERDICT_PROFILES).map(p => (
              <div key={p.id} style={{ border: `1px solid ${settings.activeProfileId === p.id ? T.pink : T.borderDim}`, padding: '12px 14px', background: settings.activeProfileId === p.id ? `rgba(${hexRgb(T.pink)},0.06)` : '#080D12' }}>
                <div style={{ color: settings.activeProfileId === p.id ? T.pink : T.textDim, fontWeight: 700, fontSize: 11, marginBottom: 8 }}>{p.label}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>BUY ≥ {p.buyThreshold}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>WATCH ≥ {p.watchThreshold}</div>
                <div style={{ color: T.textDim, fontSize: 10 }}>Max Veto = {p.maxVetoForBuy}</div>
              </div>
            ))}
          </div>

          <SectionHeader label={t('valuationGateSection', lang)} color={T.amber} />
          <NumericInput label={t('minCagrLabel', lang)} value={settings.cagrGateMin}
            onChange={v => setSettings({ ...settings, cagrGateMin: v ?? 12 })} unit="%" placeholder="12" accent={T.amber} />

          <SectionHeader label={t('defaultsSection', lang)} color={T.cyan} />
          <NumericInput label={t('defaultHorizonLabel', lang)} value={settings.defaultHorizonMonths}
            onChange={v => setSettings({ ...settings, defaultHorizonMonths: v ?? 36 })} unit="months" placeholder="36" accent={T.cyan} />
          <Input label={t('benchmarkLabel_', lang)} value={settings.benchmarkLabel}
            onChange={v => setSettings({ ...settings, benchmarkLabel: v })} placeholder="S&P500" accent={T.cyan} />

          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <Button onClick={handleSave} loading={loading} accent={T.cyan}>{t('saveSettings', lang)}</Button>
            <Button onClick={handleExport} variant="ghost" accent={T.slate}>{t('backupData', lang)}</Button>
          </div>

          <SectionHeader label={t('systemInfo', lang)} color={T.textDim} />
          <div style={{ color: T.textDim, fontSize: 10, lineHeight: 2 }}>
            <div>{t('storageInfo', lang)}</div>
            <div>{settings.encryptionEnabled ? t('encryptionEnabled_', lang) : t('encryptionDisabled', lang)}</div>
            <div>{t('lastBackup', lang)} {settings.lastBackupAt?.slice(0, 16) ?? t('neverBackup', lang)}</div>
            <div style={{ marginTop: 8, color: T.borderDim }}>LOCAL ONLY — NO EXTERNAL TRANSMISSION</div>
          </div>
        </div>
      </PageLayout>
    </div>
  )
}
