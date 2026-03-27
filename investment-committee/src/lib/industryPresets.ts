// ═══════════════════════════════════════════════════════════════════════════
// INDUSTRY PRESETS — Phase 4-B3
// ═══════════════════════════════════════════════════════════════════════════
import type { DataLaneInput } from '../types/domain'

export type PresetId = 'generic' | 'saas' | 'semiconductor' | 'consumer' | 'financials' | 'industrials'

export type ColorToken = 'yellow' | 'green' | 'cyan' | 'red' | 'orange' | 'purple' | 'slate' | 'sky'

export interface PresetFieldGroup {
  titleKey: string     // i18n key for SectionHeader
  color: ColorToken
  fields: (keyof DataLaneInput)[]
}

export interface IndustryPreset {
  id: PresetId
  label: string
  labelJa: string
  leftGroups: PresetFieldGroup[]
  rightGroups: PresetFieldGroup[]
  // Keys to visually highlight as "key metrics" for this industry
  highlights: (keyof DataLaneInput)[]
  // Custom display labels (EN)
  customLabels: Partial<Record<keyof DataLaneInput, string>>
  // Custom display labels (JA)
  customLabelsJa: Partial<Record<keyof DataLaneInput, string>>
  // Suggested veto trigger lines shown as info
  vetoHints: string[]
  vetoHintsJa: string[]
  // Optional composite metric (e.g. Rule of 40)
  compositeNote?: string
  compositeNoteJa?: string
  computeComposite?: (input: DataLaneInput) => number | null
}

// ── Default field metadata ──────────────────────────────────────────────────
export const FIELD_DEFAULT_LABELS: Record<keyof DataLaneInput, string> = {
  revenueGrowthYoy:    'Revenue Growth YoY',
  revenueGrowth3y:     'Revenue Growth 3Y CAGR',
  grossMargin:         'Gross Margin',
  operatingMargin:     'Operating Margin',
  fcfMargin:           'FCF Margin',
  roic:                'ROIC',
  debtToEbitda:        'Net Debt / EBITDA',
  netDebtToEquity:     'Net Debt / Equity',
  shareDilutionAnnual: 'Share Dilution Annual',
  reinvestmentRate:    'Reinvestment Rate',
  currentRatio:        'Current Ratio',
}

export const FIELD_UNITS: Record<keyof DataLaneInput, string> = {
  revenueGrowthYoy:    '%',
  revenueGrowth3y:     '%',
  grossMargin:         '%',
  operatingMargin:     '%',
  fcfMargin:           '%',
  roic:                '%',
  debtToEbitda:        'x',
  netDebtToEquity:     'x',
  shareDilutionAnnual: '% / yr',
  reinvestmentRate:    '%',
  currentRatio:        'x',
}

export const FIELD_PLACEHOLDERS: Record<keyof DataLaneInput, string> = {
  revenueGrowthYoy:    '22.5',
  revenueGrowth3y:     '35.0',
  grossMargin:         '78.0',
  operatingMargin:     '54.0',
  fcfMargin:           '35.0',
  roic:                '45.0',
  debtToEbitda:        '-1.5 (net cash)',
  netDebtToEquity:     '-0.3',
  shareDilutionAnnual: '1.2',
  reinvestmentRate:    '30.0',
  currentRatio:        '4.2',
}

// ── Preset definitions ─────────────────────────────────────────────────────

const GENERIC: IndustryPreset = {
  id: 'generic',
  label: 'Generic',
  labelJa: '汎用',
  leftGroups: [
    { titleKey: 'growth',           color: 'yellow', fields: ['revenueGrowthYoy', 'revenueGrowth3y', 'grossMargin', 'operatingMargin'] },
    { titleKey: 'cashFlow',         color: 'green',  fields: ['fcfMargin', 'reinvestmentRate'] },
  ],
  rightGroups: [
    { titleKey: 'capitalEfficiency', color: 'cyan',  fields: ['roic', 'shareDilutionAnnual'] },
    { titleKey: 'balanceSheet',      color: 'red',   fields: ['debtToEbitda', 'netDebtToEquity', 'currentRatio'] },
  ],
  highlights: ['roic', 'fcfMargin', 'grossMargin'],
  customLabels: {},
  customLabelsJa: {},
  vetoHints:   ['ROIC < 8% (capital destruction)', 'FCF Margin < 0% (cash burn)'],
  vetoHintsJa: ['ROIC < 8%（資本破壊）', 'FCF Margin < 0%（キャッシュバーン）'],
}

const SAAS: IndustryPreset = {
  id: 'saas',
  label: 'SaaS / Cloud',
  labelJa: 'SaaS / クラウド',
  leftGroups: [
    { titleKey: 'saasMetrics',          color: 'cyan',   fields: ['revenueGrowthYoy', 'revenueGrowth3y'] },
    { titleKey: 'profitabilitySection',  color: 'green',  fields: ['grossMargin', 'fcfMargin', 'operatingMargin'] },
  ],
  rightGroups: [
    { titleKey: 'capitalEfficiency',    color: 'yellow', fields: ['roic', 'reinvestmentRate', 'shareDilutionAnnual'] },
    { titleKey: 'balanceSheet',         color: 'red',    fields: ['debtToEbitda', 'netDebtToEquity', 'currentRatio'] },
  ],
  highlights: ['revenueGrowthYoy', 'revenueGrowth3y', 'grossMargin', 'fcfMargin'],
  customLabels: {
    revenueGrowthYoy: 'ARR Growth YoY',
    revenueGrowth3y:  'NRR (Net Revenue Retention)',
    fcfMargin:        'FCF Margin (Rule of 40)',
    reinvestmentRate: 'S&M / R&D Spend Ratio',
  },
  customLabelsJa: {
    revenueGrowthYoy: 'ARR成長率 YoY',
    revenueGrowth3y:  'NRR（Net Revenue Retention）',
    fcfMargin:        'FCF Margin（Rule of 40 要素）',
    reinvestmentRate: 'S&M / R&D 費用比率',
  },
  vetoHints: [
    'Gross Margin < 60% (low software moat)',
    'NRR < 100% (churn > expansion)',
    'Rule of 40 < 40 (growth + FCF insufficient)',
  ],
  vetoHintsJa: [
    'Gross Margin < 60%（ソフトウェアモート低下）',
    'NRR < 100%（解約 > 拡大）',
    'Rule of 40 < 40（成長+FCF不足）',
  ],
  compositeNote:   'Rule of 40 = ARR Growth YoY + FCF Margin  ≥ 40 healthy / < 40 caution',
  compositeNoteJa: 'Rule of 40 = ARR成長率 + FCF Margin  ≥ 40 健全 / < 40 注意',
  computeComposite: (input) =>
    input.revenueGrowthYoy !== null && input.fcfMargin !== null
      ? input.revenueGrowthYoy + input.fcfMargin
      : null,
}

const SEMICONDUCTOR: IndustryPreset = {
  id: 'semiconductor',
  label: 'Semiconductor',
  labelJa: '半導体',
  leftGroups: [
    { titleKey: 'growth',              color: 'yellow', fields: ['revenueGrowthYoy', 'revenueGrowth3y', 'grossMargin'] },
    { titleKey: 'profitabilitySection', color: 'green',  fields: ['operatingMargin', 'fcfMargin'] },
  ],
  rightGroups: [
    { titleKey: 'capitalEfficiency',   color: 'cyan',   fields: ['roic', 'reinvestmentRate', 'shareDilutionAnnual'] },
    { titleKey: 'balanceSheet',        color: 'red',    fields: ['debtToEbitda', 'currentRatio', 'netDebtToEquity'] },
  ],
  highlights: ['grossMargin', 'roic', 'reinvestmentRate', 'revenueGrowthYoy'],
  customLabels: {
    revenueGrowth3y:  'Revenue CAGR 3Y',
    reinvestmentRate: 'Capex / Revenue',
    currentRatio:     'Inventory / Current Ratio',
  },
  customLabelsJa: {
    revenueGrowth3y:  '3年CAGR',
    reinvestmentRate: '設備投資比率 (Capex/Rev)',
    currentRatio:     '在庫・流動比率',
  },
  vetoHints: [
    'ROIC < 8% (below cost of capital)',
    'Gross Margin < 40% (commodity pricing)',
    'Capex/Revenue > 25% without high ROIC',
  ],
  vetoHintsJa: [
    'ROIC < 8%（資本コストを下回る）',
    'Gross Margin < 40%（コモディティ化）',
    '設備投資比率 > 25% かつROIC低い',
  ],
}

const CONSUMER: IndustryPreset = {
  id: 'consumer',
  label: 'Consumer / Retail',
  labelJa: '消費財・小売',
  leftGroups: [
    { titleKey: 'growth',              color: 'yellow', fields: ['revenueGrowthYoy', 'revenueGrowth3y', 'grossMargin'] },
    { titleKey: 'profitabilitySection', color: 'green',  fields: ['operatingMargin', 'fcfMargin'] },
  ],
  rightGroups: [
    { titleKey: 'leverageSection',     color: 'red',    fields: ['debtToEbitda', 'currentRatio', 'netDebtToEquity'] },
    { titleKey: 'capitalEfficiency',   color: 'cyan',   fields: ['roic', 'reinvestmentRate', 'shareDilutionAnnual'] },
  ],
  highlights: ['revenueGrowthYoy', 'grossMargin', 'operatingMargin', 'debtToEbitda'],
  customLabels: {
    revenueGrowthYoy: 'SSS / Revenue Growth YoY',
    operatingMargin:  'EBITDA Margin (approx)',
    reinvestmentRate: 'Store Reinvestment Rate',
  },
  customLabelsJa: {
    revenueGrowthYoy: 'SSS / 売上成長率 YoY',
    operatingMargin:  'EBITDA Margin（概算）',
    reinvestmentRate: '店舗再投資率',
  },
  vetoHints: [
    'Net Debt/EBITDA > 4x (high retail leverage)',
    'SSS Growth < 0% (same-store decline)',
    'Gross Margin deteriorating > 2pt YoY',
  ],
  vetoHintsJa: [
    'Net Debt/EBITDA > 4x（小売高レバレッジ）',
    'SSS成長率 < 0%（既存店売上減）',
    'Gross Margin YoY 2pt超悪化',
  ],
}

const FINANCIALS: IndustryPreset = {
  id: 'financials',
  label: 'Financials / Banking',
  labelJa: '金融・銀行',
  leftGroups: [
    { titleKey: 'bankingSection',       color: 'cyan',   fields: ['revenueGrowthYoy', 'grossMargin', 'operatingMargin'] },
    { titleKey: 'profitabilitySection',  color: 'green',  fields: ['roic', 'fcfMargin'] },
  ],
  rightGroups: [
    { titleKey: 'leverageSection',      color: 'red',    fields: ['debtToEbitda', 'netDebtToEquity', 'currentRatio'] },
    { titleKey: 'capitalEfficiency',    color: 'yellow', fields: ['reinvestmentRate', 'shareDilutionAnnual', 'revenueGrowth3y'] },
  ],
  highlights: ['grossMargin', 'roic', 'operatingMargin'],
  customLabels: {
    revenueGrowthYoy: 'Revenue / NII Growth YoY',
    revenueGrowth3y:  'Loan Book CAGR 3Y',
    grossMargin:      'Net Interest Margin (NIM)',
    operatingMargin:  'Cost/Income Ratio (lower=better)',
    roic:             'ROE',
    fcfMargin:        'Pre-provision Profit Margin',
    debtToEbitda:     'Leverage Ratio (proxy)',
    reinvestmentRate: 'CET1 Ratio (proxy)',
    currentRatio:     'Liquidity Coverage (proxy)',
  },
  customLabelsJa: {
    revenueGrowthYoy: '収益・純利息収入 成長率',
    revenueGrowth3y:  'ローン残高 3年CAGR',
    grossMargin:      'NIM（純利鞘）',
    operatingMargin:  'Cost/Income 比率（低い方が良）',
    roic:             'ROE',
    fcfMargin:        '引当前利益率',
    debtToEbitda:     'レバレッジ比率（概算）',
    reinvestmentRate: 'CET1 比率（概算）',
    currentRatio:     '流動性カバレッジ（概算）',
  },
  vetoHints: [
    'ROE < 8% (below cost of equity)',
    'NIM < 1.5% (compressed spread)',
    'Cost/Income > 70% (efficiency problem)',
  ],
  vetoHintsJa: [
    'ROE < 8%（自己資本コストを下回る）',
    'NIM < 1.5%（スプレッド圧縮）',
    'Cost/Income > 70%（効率性問題）',
  ],
}

const INDUSTRIALS: IndustryPreset = {
  id: 'industrials',
  label: 'Industrials / Capital Goods',
  labelJa: '製造業・資本財',
  leftGroups: [
    { titleKey: 'growth',              color: 'yellow', fields: ['revenueGrowthYoy', 'revenueGrowth3y', 'grossMargin'] },
    { titleKey: 'profitabilitySection', color: 'green',  fields: ['operatingMargin', 'fcfMargin'] },
  ],
  rightGroups: [
    { titleKey: 'capitalEfficiency',   color: 'cyan',   fields: ['roic', 'reinvestmentRate', 'shareDilutionAnnual'] },
    { titleKey: 'leverageSection',     color: 'red',    fields: ['debtToEbitda', 'netDebtToEquity', 'currentRatio'] },
  ],
  highlights: ['roic', 'operatingMargin', 'debtToEbitda'],
  customLabels: {
    operatingMargin:  'EBIT Margin',
    reinvestmentRate: 'Capex / Revenue',
    revenueGrowth3y:  'Revenue CAGR 3Y',
  },
  customLabelsJa: {
    operatingMargin:  'EBIT Margin',
    reinvestmentRate: '設備投資比率',
    revenueGrowth3y:  '3年CAGR',
  },
  vetoHints: [
    'ROIC < 8% (capital destruction)',
    'Net Debt/EBITDA > 3x (leverage concern)',
    'EBIT Margin < 8% (thin industrial margin)',
  ],
  vetoHintsJa: [
    'ROIC < 8%（資本破壊）',
    'Net Debt/EBITDA > 3x（レバレッジ懸念）',
    'EBIT Margin < 8%（薄い製造業マージン）',
  ],
}

// ── Registry ───────────────────────────────────────────────────────────────
export const INDUSTRY_PRESETS: Record<PresetId, IndustryPreset> = {
  generic:      GENERIC,
  saas:         SAAS,
  semiconductor: SEMICONDUCTOR,
  consumer:     CONSUMER,
  financials:   FINANCIALS,
  industrials:  INDUSTRIALS,
}

export const PRESET_LIST: IndustryPreset[] = [
  GENERIC, SAAS, SEMICONDUCTOR, CONSUMER, FINANCIALS, INDUSTRIALS,
]

// ── Sector → Preset inference ──────────────────────────────────────────────
export function inferPresetFromSector(sector: string | null | undefined): PresetId {
  if (!sector) return 'generic'
  const s = sector.toLowerCase()
  if (s.includes('financial') || s.includes('bank') || s.includes('insurance') || s.includes('asset management')) return 'financials'
  if (s.includes('consumer') || s.includes('retail') || s.includes('staples') || s.includes('discretionary') || s.includes('restaurant')) return 'consumer'
  if (s.includes('industrial') || s.includes('manufactur') || s.includes('capital good') || s.includes('aerospace') || s.includes('defense')) return 'industrials'
  if (s.includes('semiconductor') || s.includes('chip')) return 'semiconductor'
  if (s.includes('tech') || s.includes('software') || s.includes('communication') || s.includes('internet') || s.includes('cloud') || s.includes('saas')) return 'saas'
  return 'generic'
}

// ── Label resolver ─────────────────────────────────────────────────────────
export function getFieldLabel(
  field: keyof DataLaneInput,
  preset: IndustryPreset,
  lang: 'en' | 'ja',
): string {
  if (lang === 'ja') {
    return preset.customLabelsJa[field] ?? FIELD_DEFAULT_LABELS[field]
  }
  return preset.customLabels[field] ?? FIELD_DEFAULT_LABELS[field]
}
