import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate, useParams } from 'react-router-dom'
import { T, Toast, hexRgb } from './components/common/ui'
import { useStore } from './state/store'
import { db, initDefaultSettings } from './db/schema'
import { companyRepository, settingsRepository } from './db/repositories'
import { t } from './lib/i18n'

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
const SettingsPage   = React.lazy(() => import('./pages/SettingsPage'))

function Layout({ children }: { children: React.ReactNode }) {
  const toast = useStore(s => s.toast)
  const lang  = useStore(s => s.lang)

  const NAV = [
    { to: '/companies', key: 'nav_cases' as const },
    { to: '/lessons',   key: 'nav_lessons' as const },
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
          {children}
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
  const { setCompanies, setSettings, setGlobalLoading } = useStore()
  useEffect(() => {
    async function init() {
      setGlobalLoading(true)
      await initDefaultSettings()
      const [companies, settings] = await Promise.all([
        companyRepository.list(),
        settingsRepository.get(),
      ])
      setCompanies(companies)
      setSettings(settings)
      setGlobalLoading(false)
    }
    init()
  }, [])
  return <>{children}</>
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
            <Route path="/settings"                 element={<SettingsPage />} />
          </Routes>
        </Layout>
      </AppInit>
    </BrowserRouter>
  )
}
