import 'fake-indexeddb/auto'
import { describe, it, expect } from 'vitest'
import Dexie from 'dexie'

// Migration test (Issue #6, P0-5): build a v5-shaped database with real
// rows, close it, then open it through the app's schema (v6) and confirm
// the existing data survives and the new decision-log tables exist empty.
const V5_STORES = {
  companies: 'id, ticker, status, updatedAt',
  thesis_analyses: 'id, companyId, version, updatedAt',
  data_analyses: 'id, companyId, computedAt',
  market_analyses: 'id, companyId, computedAt',
  review_reports: 'id, companyId, createdAt',
  valuation_reports: 'id, companyId, createdAt',
  verdict_reports: 'id, companyId, createdAt',
  monitoring_plans: 'id, companyId, updatedAt',
  lesson_records: 'id, companyId, ticker, phase, createdAt',
  metric_snapshots: 'id, asOfDate',
  app_settings: 'id',
  position_records: 'id, companyId, status, createdAt',
}

describe('Dexie v5 → v6 migration', () => {
  it('preserves existing records and adds empty decision-log tables', async () => {
    const legacy = new Dexie('InvestmentCommitteeDB')
    legacy.version(5).stores(V5_STORES)
    await legacy.open()
    await legacy.table('companies').put({
      id: 'c-legacy', ticker: 'LEG', companyName: 'Legacy Co', sector: null,
      currentPrice: 42, marketCap: null, enterpriseValue: null,
      investmentHorizonMonths: 36, status: 'active',
      createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z',
    })
    await legacy.table('verdict_reports').put({
      id: 'v-legacy', companyId: 'c-legacy', axisScores: {}, totalScore: 25,
      vetoCount: 0, verdict: 'WATCH', rationale: 'legacy',
      profileUsed: { id: 'standard', label: 'Standard', buyThreshold: 30, watchThreshold: 22, maxVetoForBuy: 1 },
      createdAt: '2025-06-01T00:00:00.000Z',
    })
    legacy.close()

    const { db } = await import('./schema')
    await db.open()
    expect(db.verno).toBe(6)

    const company = await db.companies.get('c-legacy')
    expect(company?.ticker).toBe('LEG')
    const verdict = await db.verdict_reports.get('v-legacy')
    expect(verdict?.verdict).toBe('WATCH')

    expect(await db.decision_logs.count()).toBe(0)
    expect(await db.decision_log_events.count()).toBe(0)
    expect(await db.decision_log_evaluations.count()).toBe(0)
    db.close()
  })
})
