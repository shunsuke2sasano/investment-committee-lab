import React from 'react'
import { T, Button, Select, PageLayout, SectionHeader, hexRgb, NumericInput, Input, css } from '../components/common/ui'
import { useStore } from '../state/store'
import { settingsRepository, exportImport, decryptAllAndStrip } from '../db/repositories'
import { VERDICT_PROFILES } from '../types/domain'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import { deriveKey, encrypt as cryptoEncrypt } from '../lib/crypto'
import { setActiveCryptoState } from '../lib/cryptoContext'

export default function SettingsPage() {
  const { settings, setSettings, setActiveProfileId, showToast, lang, setLang, setUnlocked } = useStore()
  const [loading, setLoading] = React.useState(false)
  const [showKey, setShowKey] = React.useState(false)
  const [showFmpKey, setShowFmpKey] = React.useState(false)

  // Encryption enable form state
  const [encPassphrase, setEncPassphrase]         = React.useState('')
  const [encPassphraseConfirm, setEncPassphraseConfirm] = React.useState('')
  const [encError, setEncError]                   = React.useState('')
  const [encLoading, setEncLoading]               = React.useState(false)
  const [showEncForm, setShowEncForm]             = React.useState(false)

  // Encryption disable confirmation state
  const [showDisableConfirm, setShowDisableConfirm] = React.useState(false)
  const [disableLoading, setDisableLoading]         = React.useState(false)

  const envKey: string = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY ?? ''
  const dbKey = settings?.anthropicApiKey ?? ''
  const hasDbKey = dbKey.trim().length > 0
  const hasEnvKey = envKey.trim().length > 0

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

  async function handleEnableEncryption() {
    setEncError('')
    if (!encPassphrase) { setEncError(t('passphraseRequired', lang)); return }
    if (encPassphrase.length < 8) { setEncError(t('passphraseMinLen', lang)); return }
    if (encPassphrase !== encPassphraseConfirm) { setEncError(t('passphraseMismatch', lang)); return }
    setEncLoading(true)
    try {
      const key = await deriveKey(encPassphrase)
      // Use random 32 bytes as plaintext — prevents known-plaintext precomputation
      const randomBytes = crypto.getRandomValues(new Uint8Array(32))
      const randomPlaintext = Array.from(randomBytes, b => b.toString(16).padStart(2, '0')).join('')
      const verifier = await cryptoEncrypt(key, randomPlaintext)
      const updated = await settingsRepository.update({
        encryptionEnabled: true,
        encryptionVerifier: verifier,
      })
      setSettings(updated)
      setActiveCryptoState(key, true)
      setUnlocked(true)
      setShowEncForm(false)
      setEncPassphrase('')
      setEncPassphraseConfirm('')
      showToast(t('encryptionEnabled_ok', lang), 'success')
    } catch {
      setEncError(t('saveFailed', lang))
    }
    setEncLoading(false)
  }

  async function handleDisableEncryption() {
    setDisableLoading(true)
    try {
      // Step 1: decrypt all records while the key is still active
      await decryptAllAndStrip()
      // Step 2: update settings
      const updated = await settingsRepository.update({
        encryptionEnabled: false,
        encryptionVerifier: null,
      })
      setSettings(updated)
      // Step 3: release the key from memory
      setActiveCryptoState(null, false)
      setShowDisableConfirm(false)
      showToast(t('encryptionDisabled', lang), 'success')
    } catch {
      showToast(t('saveFailed', lang), 'error')
    }
    setDisableLoading(false)
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

          {/* ── API Key ───────────────────────────────────────────────── */}
          <SectionHeader label={t('apiKeySection', lang)} color={T.cyan} />
          <div style={{ marginBottom: 14 }}>
            <label style={css.label}>{t('apiKeyLabel', lang)}</label>
            <div style={{ display: 'flex' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={settings?.anthropicApiKey ?? ''}
                placeholder={t('apiKeyPlaceholder', lang)}
                onChange={e => settings && setSettings({ ...settings, anthropicApiKey: e.target.value || null })}
                style={{
                  ...css.input, flex: 1,
                  borderRight: 'none',
                  fontFamily: showKey ? "'Courier New', monospace" : 'monospace',
                  letterSpacing: showKey ? 'normal' : '0.15em',
                }}
                onFocus={e => { e.target.style.borderColor = T.cyan }}
                onBlur={e => { e.target.style.borderColor = T.borderDim }}
              />
              <button
                type="button"
                onClick={() => setShowKey(s => !s)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  background: '#080D12',
                  border: `1px solid ${T.borderDim}`,
                  color: T.textDim,
                  fontFamily: "'Courier New', monospace",
                  fontSize: 9, letterSpacing: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {showKey ? t('apiKeyHide', lang) : t('apiKeyShow', lang)}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10 }}>
              {hasDbKey ? (
                <span style={{ color: T.green }}>{t('apiKeySetStatus', lang)}</span>
              ) : hasEnvKey ? (
                <span style={{ color: T.yellow }}>{t('apiKeyEnvNote', lang)}</span>
              ) : (
                <span style={{ color: T.red }}>{t('apiKeyNotSetNote', lang)}</span>
              )}
            </div>
          </div>

          {/* ── FMP API Key ───────────────────────────────────────────── */}
          <SectionHeader label={t('fmpApiSection', lang)} color={T.green} />
          <div style={{ marginBottom: 14 }}>
            <label style={css.label}>{t('fmpApiLabel', lang)}</label>
            <div style={{ display: 'flex' }}>
              <input
                type={showFmpKey ? 'text' : 'password'}
                value={settings?.fmpApiKey ?? ''}
                placeholder={t('fmpApiPlaceholder', lang)}
                onChange={e => settings && setSettings({ ...settings, fmpApiKey: e.target.value || null })}
                style={{
                  ...css.input, flex: 1,
                  borderRight: 'none',
                  fontFamily: showFmpKey ? "'Courier New', monospace" : 'monospace',
                  letterSpacing: showFmpKey ? 'normal' : '0.15em',
                }}
                onFocus={e => { e.target.style.borderColor = T.green }}
                onBlur={e => { e.target.style.borderColor = T.borderDim }}
              />
              <button
                type="button"
                onClick={() => setShowFmpKey(s => !s)}
                style={{
                  padding: '9px 14px', cursor: 'pointer',
                  background: '#080D12',
                  border: `1px solid ${T.borderDim}`,
                  color: T.textDim,
                  fontFamily: "'Courier New', monospace",
                  fontSize: 9, letterSpacing: 2,
                  whiteSpace: 'nowrap',
                }}
              >
                {showFmpKey ? t('apiKeyHide', lang) : t('apiKeyShow', lang)}
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10 }}>
              {(settings?.fmpApiKey ?? '').trim().length > 0 ? (
                <span style={{ color: T.green }}>{t('fmpApiSetStatus', lang)}</span>
              ) : (
                <span style={{ color: T.textDim }}>{t('fmpApiNotSetNote', lang)}</span>
              )}
            </div>
          </div>

          {/* ── Encryption ───────────────────────────────────────────── */}
          <SectionHeader label={t('encryptionSection', lang)} color={T.purple} />
          <div style={{ marginBottom: 20 }}>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div style={{
                padding: '4px 14px', fontSize: 10, letterSpacing: 2, fontWeight: 700,
                border: `1px solid ${settings.encryptionEnabled ? T.green : T.borderDim}`,
                color: settings.encryptionEnabled ? T.green : T.textDim,
                background: settings.encryptionEnabled ? `rgba(52,211,153,0.06)` : 'transparent',
              }}>
                {settings.encryptionEnabled ? t('encryptionOnLabel', lang) : t('encryptionOffLabel', lang)}
              </div>
            </div>

            {/* Info note */}
            <div style={{
              borderLeft: `2px solid ${T.purple}`, padding: '8px 12px',
              color: T.textDim, fontSize: 10, lineHeight: 1.8, marginBottom: 14,
              background: `rgba(167,139,250,0.04)`,
            }}>
              {settings.encryptionEnabled
                ? t('encryptionDisableNote', lang)
                : t('encryptionNote', lang)}
            </div>

            {settings.encryptionEnabled ? (
              <>
                {/* Always-visible passphrase-change warning */}
                <div style={{
                  border: `1px solid ${T.red}44`,
                  borderLeft: `3px solid ${T.red}`,
                  padding: '10px 14px', marginBottom: 14,
                  background: `rgba(248,113,113,0.04)`,
                  color: T.red, fontSize: 10, lineHeight: 1.9,
                  fontFamily: "'Courier New',monospace",
                }}>
                  {t('disableEncryptionDataWarning', lang)}
                </div>

                {!showDisableConfirm ? (
                  <Button
                    onClick={() => setShowDisableConfirm(true)}
                    variant="ghost" accent={T.red} size="sm"
                  >
                    {t('encryptionDisableBtn', lang)}
                  </Button>
                ) : (
                  <div style={{ border: `1px solid ${T.red}66`, padding: '16px 18px', background: '#0D0608' }}>
                    <div style={{ color: T.red, fontSize: 10, lineHeight: 1.9, marginBottom: 14, fontFamily: "'Courier New',monospace" }}>
                      {t('disableEncryptionConfirmMsg', lang)}
                    </div>
                    {disableLoading && (
                      <div style={{ color: T.textDim, fontSize: 10, marginBottom: 10, fontFamily: "'Courier New',monospace" }}>
                        {t('decryptingData', lang)}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button
                        onClick={handleDisableEncryption}
                        loading={disableLoading}
                        variant="ghost" accent={T.red} size="sm"
                      >
                        {t('disableEncryptionConfirmBtn', lang)}
                      </Button>
                      <Button
                        onClick={() => setShowDisableConfirm(false)}
                        variant="ghost" accent={T.textDim} size="sm"
                        disabled={disableLoading}
                      >
                        {t('cancelBtn', lang)}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {!showEncForm ? (
                  <Button onClick={() => setShowEncForm(true)} accent={T.purple} size="sm">
                    {t('encryptionEnableBtn', lang)}
                  </Button>
                ) : (
                  <div style={{ border: `1px solid ${T.borderDim}`, padding: '16px 18px', background: '#080D12' }}>
                    <div style={{ marginBottom: 12 }}>
                      <label style={css.label}>{t('passphraseLabel', lang)}</label>
                      <input
                        type="password"
                        value={encPassphrase}
                        onChange={e => setEncPassphrase(e.target.value)}
                        placeholder={t('passphraseMinLen', lang)}
                        style={{ ...css.input }}
                        onFocus={e => { e.target.style.borderColor = T.purple }}
                        onBlur={e => { e.target.style.borderColor = T.borderDim }}
                      />
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label style={css.label}>{t('passphraseConfirmLabel', lang)}</label>
                      <input
                        type="password"
                        value={encPassphraseConfirm}
                        onChange={e => setEncPassphraseConfirm(e.target.value)}
                        style={{ ...css.input }}
                        onFocus={e => { e.target.style.borderColor = T.purple }}
                        onBlur={e => { e.target.style.borderColor = T.borderDim }}
                      />
                    </div>
                    {encError && (
                      <div style={{ color: T.red, fontSize: 10, marginBottom: 10 }}>✗ {encError}</div>
                    )}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <Button onClick={handleEnableEncryption} loading={encLoading} accent={T.purple} size="sm">
                        {t('encryptionEnableBtn', lang)}
                      </Button>
                      <Button onClick={() => { setShowEncForm(false); setEncError(''); setEncPassphrase(''); setEncPassphraseConfirm('') }} variant="ghost" accent={T.textDim} size="sm">
                        {t('cancelBtn', lang)}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
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
            <div>{settings.encryptionEnabled ? t('encryptionOnLabel', lang) : t('encryptionDisabled', lang)}</div>
            <div>{t('lastBackup', lang)} {settings.lastBackupAt?.slice(0, 16) ?? t('neverBackup', lang)}</div>
            <div style={{ marginTop: 8, color: T.borderDim }}>LOCAL ONLY — NO EXTERNAL TRANSMISSION</div>
          </div>
        </div>
      </PageLayout>
    </div>
  )
}
