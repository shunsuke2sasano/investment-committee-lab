import React, { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom'
import { T, Toast, hexRgb } from './components/common/ui'
import { useStore } from './state/store'
import { db, initDefaultSettings } from './db/schema'
import { companyRepository, settingsRepository } from './db/repositories'
import { t } from './lib/i18n'
import { deriveKey, decrypt } from './lib/crypto'
import { setActiveCryptoState, setDecryptErrorHandler } from './lib/cryptoContext'

const CompanyList    = React.lazy(() => import('./pages/CompanyList'))
const CompanyNew     = React.lazy(() => import('./pages/CompanyNew'))
const CompanyDetail  = React.lazy(() => import('./pages/CompanyDetail'))
const ThesisPage     = React.lazy(() => import('./pages/ThesisPage'))
const DataLanePage   = React.lazy(() => import('./pages/DataLanePage'))
const MarketLanePage = React.lazy(() => import('./pages/MarketLanePage'))
const ReviewPage     = React.lazy(() => import('./pages/ReviewPage'))
const ValuationPage  = React.lazy(() => import('./pages/ValuationPage'))
const VerdictPage    = React.lazy(() => import('./pages/VerdictPage'))
const MonitoringPage = React.lazy(() => import('./pages/MonitoringPage'))
const LessonPage     = React.lazy(() => import('./pages/LessonPage'))
const MetricsPage    = React.lazy(() => import('./pages/MetricsPage'))
const SettingsPage   = React.lazy(() => import('./pages/SettingsPage'))

function Layout({ children }: { children: React.ReactNode }) {
  const toast = useStore(s => s.toast)
  const lang  = useStore(s => s.lang)

  const NAV = [
    { to: '/companies', key: 'nav_cases' as const },
    { to: '/lessons',   key: 'nav_lessons' as const },
    { to: '/metrics',   key: 'nav_metrics' as const },
    { to: '/settings',  key: 'nav_settings' as const },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: T.bg, color: T.text, fontFamily: "'Courier New', monospace", overflow: 'hidden' }}>
      <div style={{ borderBottom: `1px solid ${T.borderDim}`, padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, background: 'rgba(6,10,14,0.97)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ color: T.textMid, fontSize: 8, letterSpacing: 5 }}>CLASSIFIED</div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 4, color: T.text }}>
              {t('appTitle', lang)} <span style={{ color: T.cyan }}>vNext</span>
            </div>
          </div>
          <div style={{ width: 1, height: 28, background: T.borderDim }} />
          <nav style={{ display: 'flex', gap: 4 }}>
            {NAV.map(n => (
              <NavLink key={n.to} to={n.to} style={({ isActive }) => ({
                color: isActive ? T.cyan : T.textDim,
                border: `1px solid ${isActive ? T.cyan : 'transparent'}`,
                padding: '4px 14px', fontSize: 10, letterSpacing: 3,
                textDecoration: 'none', background: isActive ? `rgba(${hexRgb(T.cyan)},0.08)` : 'transparent',
                transition: 'all 0.15s',
              })}>{t(n.key, lang)}</NavLink>
            ))}
          </nav>
        </div>
        <div style={{ color: T.borderDim, fontSize: 9, letterSpacing: 3 }}>{t('localOnly', lang)}</div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <React.Suspense fallback={<LoadingScreen />}>
          <PassphraseGate>
            {children}
          </PassphraseGate>
        </React.Suspense>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  )
}

function LoadingScreen() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textDim, fontSize: 12, letterSpacing: 4 }}>
      LOADING…
    </div>
  )
}

function AppInit({ children }: { children: React.ReactNode }) {
  const { setCompanies, setSettings, setGlobalLoading, setUnlocked } = useStore()
  useEffect(() => {
    // Wire up decrypt-error toasts from repositories → UI
    setDecryptErrorHandler(() => {
      const { showToast, lang } = useStore.getState()
      showToast(t('decryptError', lang), 'error')
    })

    async function init() {
      setGlobalLoading(true)
      await initDefaultSettings()
      const [companies, settings] = await Promise.all([
        companyRepository.list(),
        settingsRepository.get(),
      ])
      setCompanies(companies)
      setSettings(settings)
      // If encryption is off, mark the app as unlocked immediately
      if (!settings.encryptionEnabled) setUnlocked(true)
      setGlobalLoading(false)
    }
    init()
  }, [])
  return <>{children}</>
}

// ── Passphrase gate ────────────────────────────────────────────────────────
function PassphraseGate({ children }: { children: React.ReactNode }) {
  const { settings, isUnlocked, setUnlocked, lang } = useStore()
  const [passphrase, setPassphrase] = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  // Not yet initialized
  if (!settings) return null
  // Not encrypted or already unlocked
  if (!settings.encryptionEnabled || isUnlocked) return <>{children}</>

  async function handleUnlock() {
    if (!passphrase) { setError(t('passphraseRequired', lang)); return }
    setLoading(true)
    setError('')
    try {
      const key = await deriveKey(passphrase)
      // Validate against stored verifier (if present)
      if (settings!.encryptionVerifier) {
        await decrypt(key, settings!.encryptionVerifier) // throws on wrong passphrase
      }
      setActiveCryptoState(key, true)
      // Reload companies with the now-available key
      const companies = await companyRepository.list()
      useStore.getState().setCompanies(companies)
      setUnlocked(true)
    } catch {
      setError(t('passphraseWrong', lang))
    }
    setLoading(false)
  }

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.bg,
    }}>
      <div style={{
        border: `1px solid ${T.border}`, background: T.surface,
        padding: '40px 48px', minWidth: 380, maxWidth: 440,
        fontFamily: "'Courier New', monospace",
      }}>
        <div style={{ color: T.textMid, fontSize: 9, letterSpacing: 5, marginBottom: 6 }}>
          INVESTMENT COMMITTEE vNext
        </div>
        <div style={{ color: T.text, fontSize: 18, fontWeight: 700, letterSpacing: 3, marginBottom: 24 }}>
          {t('passphraseModalTitle', lang)}
        </div>
        <div style={{ color: T.textDim, fontSize: 11, lineHeight: 1.8, marginBottom: 24 }}>
          {t('passphraseModalBody', lang)}
        </div>

        <label style={{ color: T.textMid, fontSize: 9, letterSpacing: 3, display: 'block', marginBottom: 6 }}>
          {t('passphraseLabel', lang).toUpperCase()}
        </label>
        <input
          type="password"
          value={passphrase}
          autoFocus
          onChange={e => setPassphrase(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleUnlock()}
          style={{
            width: '100%', background: '#080D12', border: `1px solid ${T.borderDim}`,
            color: T.text, fontFamily: "'Courier New', monospace", fontSize: 13,
            outline: 'none', padding: '9px 12px', boxSizing: 'border-box',
            marginBottom: 8,
          }}
          onFocus={e => { e.target.style.borderColor = T.cyan }}
          onBlur={e => { e.target.style.borderColor = T.borderDim }}
        />

        {error && (
          <div style={{ color: T.red, fontSize: 10, marginBottom: 12, letterSpacing: 1 }}>
            ✗ {error}
          </div>
        )}

        <button
          onClick={handleUnlock}
          disabled={loading}
          style={{
            width: '100%', marginTop: 8,
            background: `rgba(0,212,255,0.08)`, border: `1px solid ${T.cyan}`,
            color: T.cyan, padding: '10px 28px', cursor: loading ? 'wait' : 'pointer',
            fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 3,
          }}
        >
          {loading ? '…' : t('passphraseUnlockBtn', lang)}
        </button>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInit>
        <Layout>
          <Routes>
            <Route path="/"                         element={<CompanyList />} />
            <Route path="/companies"                element={<CompanyList />} />
            <Route path="/companies/new"            element={<CompanyNew />} />
            <Route path="/companies/:id"            element={<CompanyDetail />} />
            <Route path="/companies/:id/thesis"     element={<ThesisPage />} />
            <Route path="/companies/:id/data"       element={<DataLanePage />} />
            <Route path="/companies/:id/market"     element={<MarketLanePage />} />
            <Route path="/companies/:id/review"     element={<ReviewPage />} />
            <Route path="/companies/:id/valuation"  element={<ValuationPage />} />
            <Route path="/companies/:id/verdict"    element={<VerdictPage />} />
            <Route path="/companies/:id/monitoring" element={<MonitoringPage />} />
            <Route path="/companies/:id/lessons"    element={<LessonPage />} />
            <Route path="/lessons"                  element={<LessonPage />} />
            <Route path="/metrics"                  element={<MetricsPage />} />
            <Route path="/settings"                 element={<SettingsPage />} />
          </Routes>
        </Layout>
      </AppInit>
    </BrowserRouter>
  )
}
