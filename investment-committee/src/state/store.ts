import { create } from 'zustand'
import type { CompanyCase, AppSettings } from '../types/domain'
import { VERDICT_PROFILES, type VerdictProfile } from '../types/domain'
import type { Lang } from '../lib/i18n'

interface UIState {
  lang: Lang
  setLang: (lang: Lang) => void
  // Current company context
  activeCompanyId: string | null
  setActiveCompanyId: (id: string | null) => void

  // Company list cache
  companies: CompanyCase[]
  setCompanies: (companies: CompanyCase[]) => void
  upsertCompany: (company: CompanyCase) => void
  removeCompany: (id: string) => void

  // Settings
  settings: AppSettings | null
  setSettings: (s: AppSettings) => void
  activeProfile: VerdictProfile
  setActiveProfileId: (id: 'conservative' | 'standard' | 'aggressive') => void

  // Encryption unlock state (key lives in cryptoContext.ts, not here)
  isUnlocked: boolean
  setUnlocked: (v: boolean) => void

  // Global loading / error
  globalLoading: boolean
  setGlobalLoading: (v: boolean) => void
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void
  clearToast: () => void
}

export const useStore = create<UIState>((set, get) => ({
  lang: (localStorage.getItem("ic_lang") as Lang) ?? "en",
  setLang: (lang: Lang) => { localStorage.setItem("ic_lang", lang); set({ lang }) },

  activeCompanyId: null,
  setActiveCompanyId: (id) => set({ activeCompanyId: id }),

  companies: [],
  setCompanies: (companies) => set({ companies }),
  upsertCompany: (company) => set(state => {
    const existing = state.companies.findIndex(c => c.id === company.id)
    if (existing >= 0) {
      const next = [...state.companies]
      next[existing] = company
      return { companies: next }
    }
    return { companies: [company, ...state.companies] }
  }),
  removeCompany: (id) => set(state => ({
    companies: state.companies.filter(c => c.id !== id)
  })),

  settings: null,
  setSettings: (s) => set({ settings: s, activeProfile: VERDICT_PROFILES[s.activeProfileId] }),
  activeProfile: VERDICT_PROFILES['standard'],
  setActiveProfileId: (id) => set({
    activeProfile: VERDICT_PROFILES[id],
    settings: get().settings ? { ...get().settings!, activeProfileId: id } : null,
  }),

  isUnlocked: false,
  setUnlocked: (v) => set({ isUnlocked: v }),

  globalLoading: false,
  setGlobalLoading: (v) => set({ globalLoading: v }),

  toast: null,
  showToast: (message, type = 'info') => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3000)
  },
  clearToast: () => set({ toast: null }),
}))
