import Dexie, { type Table } from 'dexie'
import type {
  CompanyCase,
  ThesisAnalysis,
  DataAnalysis,
  MarketAnalysis,
  ReviewReport,
  ValuationReport,
  VerdictReport,
  MonitoringPlan,
  LessonRecord,
  MetricSnapshot,
  AppSettings,
} from '../types/domain'

export class InvestmentCommitteeDB extends Dexie {
  companies!: Table<CompanyCase>
  thesis_analyses!: Table<ThesisAnalysis>
  data_analyses!: Table<DataAnalysis>
  market_analyses!: Table<MarketAnalysis>
  review_reports!: Table<ReviewReport>
  valuation_reports!: Table<ValuationReport>
  verdict_reports!: Table<VerdictReport>
  monitoring_plans!: Table<MonitoringPlan>
  lesson_records!: Table<LessonRecord>
  metric_snapshots!: Table<MetricSnapshot>
  app_settings!: Table<AppSettings>

  constructor() {
    super('InvestmentCommitteeDB')

    this.version(1).stores({
      companies:         'id, ticker, status, updatedAt',
      thesis_analyses:   'id, companyId, version, updatedAt',
      data_analyses:     'id, companyId, computedAt',
      market_analyses:   'id, companyId, computedAt',
      review_reports:    'id, companyId, createdAt',
      valuation_reports: 'id, companyId, createdAt',
      verdict_reports:   'id, companyId, createdAt',
      monitoring_plans:  'id, companyId, updatedAt',
      lesson_records:    'id, companyId, ticker, phase, createdAt',
      metric_snapshots:  'id, asOfDate',
      app_settings:      'id',
    })

    // v2: add anthropicApiKey to app_settings
    this.version(2).stores({
      companies:         'id, ticker, status, updatedAt',
      thesis_analyses:   'id, companyId, version, updatedAt',
      data_analyses:     'id, companyId, computedAt',
      market_analyses:   'id, companyId, computedAt',
      review_reports:    'id, companyId, createdAt',
      valuation_reports: 'id, companyId, createdAt',
      verdict_reports:   'id, companyId, createdAt',
      monitoring_plans:  'id, companyId, updatedAt',
      lesson_records:    'id, companyId, ticker, phase, createdAt',
      metric_snapshots:  'id, asOfDate',
      app_settings:      'id',
    }).upgrade(tx =>
      tx.table('app_settings').toCollection().modify(record => {
        if (record.anthropicApiKey === undefined) record.anthropicApiKey = null
      })
    )

    // v3: add encryptionVerifier to app_settings
    this.version(3).stores({
      companies:         'id, ticker, status, updatedAt',
      thesis_analyses:   'id, companyId, version, updatedAt',
      data_analyses:     'id, companyId, computedAt',
      market_analyses:   'id, companyId, computedAt',
      review_reports:    'id, companyId, createdAt',
      valuation_reports: 'id, companyId, createdAt',
      verdict_reports:   'id, companyId, createdAt',
      monitoring_plans:  'id, companyId, updatedAt',
      lesson_records:    'id, companyId, ticker, phase, createdAt',
      metric_snapshots:  'id, asOfDate',
      app_settings:      'id',
    }).upgrade(tx =>
      tx.table('app_settings').toCollection().modify(record => {
        if (record.encryptionVerifier === undefined) record.encryptionVerifier = null
      })
    )

    // v4: add fmpApiKey to app_settings
    this.version(4).stores({
      companies:         'id, ticker, status, updatedAt',
      thesis_analyses:   'id, companyId, version, updatedAt',
      data_analyses:     'id, companyId, computedAt',
      market_analyses:   'id, companyId, computedAt',
      review_reports:    'id, companyId, createdAt',
      valuation_reports: 'id, companyId, createdAt',
      verdict_reports:   'id, companyId, createdAt',
      monitoring_plans:  'id, companyId, updatedAt',
      lesson_records:    'id, companyId, ticker, phase, createdAt',
      metric_snapshots:  'id, asOfDate',
      app_settings:      'id',
    }).upgrade(tx =>
      tx.table('app_settings').toCollection().modify(record => {
        if (record.fmpApiKey === undefined) record.fmpApiKey = null
      })
    )
  }
}

export const db = new InvestmentCommitteeDB()

// ── Default settings initializer ─────────────────────────────────────────
export async function initDefaultSettings() {
  const existing = await db.app_settings.get('default')
  if (!existing) {
    await db.app_settings.put({
      id: 'default',
      activeProfileId: 'standard',
      encryptionEnabled: false,
      encryptionVerifier: null,
      lastBackupAt: null,
      cagrGateMin: 12,
      defaultHorizonMonths: 36,
      benchmarkLabel: 'S&P500',
      anthropicApiKey: null,
      fmpApiKey: null,
    })
  }
}
