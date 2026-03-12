import { db } from './schema'
import type {
  CompanyCase, ThesisAnalysis, DataAnalysis, MarketAnalysis,
  ReviewReport, ValuationReport, VerdictReport, MonitoringPlan,
  LessonRecord, AppSettings,
} from '../types/domain'

function now() { return new Date().toISOString() }
function uid() { return crypto.randomUUID() }

// ── Company ───────────────────────────────────────────────────────────────
export const companyRepository = {
  async list() {
    return db.companies.orderBy('updatedAt').reverse().toArray()
  },
  async get(id: string) {
    return db.companies.get(id)
  },
  async getByTicker(ticker: string) {
    return db.companies.where('ticker').equals(ticker.toUpperCase()).first()
  },
  async create(input: Omit<CompanyCase, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: CompanyCase = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.companies.add(row)
    return row
  },
  async update(id: string, patch: Partial<CompanyCase>) {
    await db.companies.update(id, { ...patch, updatedAt: now() })
    return db.companies.get(id)
  },
  async delete(id: string) {
    // Cascade delete all related records
    await Promise.all([
      db.thesis_analyses.where('companyId').equals(id).delete(),
      db.data_analyses.where('companyId').equals(id).delete(),
      db.market_analyses.where('companyId').equals(id).delete(),
      db.review_reports.where('companyId').equals(id).delete(),
      db.valuation_reports.where('companyId').equals(id).delete(),
      db.verdict_reports.where('companyId').equals(id).delete(),
      db.monitoring_plans.where('companyId').equals(id).delete(),
      db.lesson_records.where('companyId').equals(id).delete(),
    ])
    await db.companies.delete(id)
  },
}

// ── Thesis ────────────────────────────────────────────────────────────────
export const thesisRepository = {
  async getLatest(companyId: string) {
    return db.thesis_analyses
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  async create(input: Omit<ThesisAnalysis, 'id' | 'createdAt' | 'updatedAt' | 'version'>) {
    const latest = await thesisRepository.getLatest(input.companyId)
    const row: ThesisAnalysis = {
      ...input,
      id: uid(),
      version: (latest?.version ?? 0) + 1,
      createdAt: now(),
      updatedAt: now(),
    }
    await db.thesis_analyses.add(row)
    return row
  },
  async update(id: string, patch: Partial<ThesisAnalysis>) {
    await db.thesis_analyses.update(id, { ...patch, updatedAt: now() })
    return db.thesis_analyses.get(id)
  },
}

// ── Data Lane ─────────────────────────────────────────────────────────────
export const dataAnalysisRepository = {
  async getLatest(companyId: string) {
    return db.data_analyses
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  async save(input: Omit<DataAnalysis, 'id'>) {
    const row: DataAnalysis = { ...input, id: uid() }
    await db.data_analyses.add(row)
    return row
  },
}

// ── Market Lane ───────────────────────────────────────────────────────────
export const marketAnalysisRepository = {
  async getLatest(companyId: string) {
    return db.market_analyses
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  async save(input: Omit<MarketAnalysis, 'id'>) {
    const row: MarketAnalysis = { ...input, id: uid() }
    await db.market_analyses.add(row)
    return row
  },
}

// ── Review ────────────────────────────────────────────────────────────────
export const reviewRepository = {
  async getLatest(companyId: string) {
    return db.review_reports
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  async save(input: Omit<ReviewReport, 'id'>) {
    const row: ReviewReport = { ...input, id: uid() }
    await db.review_reports.add(row)
    return row
  },
}

// ── Valuation ─────────────────────────────────────────────────────────────
export const valuationRepository = {
  async getLatest(companyId: string) {
    return db.valuation_reports
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  async save(input: Omit<ValuationReport, 'id'>) {
    const row: ValuationReport = { ...input, id: uid() }
    await db.valuation_reports.add(row)
    return row
  },
}

// ── Verdict ───────────────────────────────────────────────────────────────
export const verdictRepository = {
  async getLatest(companyId: string) {
    return db.verdict_reports
      .where('companyId').equals(companyId)
      .reverse()
      .first()
  },
  /** Single table scan → latest VerdictReport per company (keyed by companyId) */
  async listLatestAll(): Promise<Map<string, VerdictReport>> {
    const all = await db.verdict_reports.toArray()
    const map = new Map<string, VerdictReport>()
    all.forEach(v => {
      const existing = map.get(v.companyId)
      if (!existing || v.createdAt > existing.createdAt) map.set(v.companyId, v)
    })
    return map
  },
  async save(input: Omit<VerdictReport, 'id'>) {
    const row: VerdictReport = { ...input, id: uid() }
    await db.verdict_reports.add(row)
    return row
  },
}

// ── Monitoring ────────────────────────────────────────────────────────────
export const monitoringRepository = {
  async listAll() {
    return db.monitoring_plans.toArray()
  },
  async get(companyId: string) {
    return db.monitoring_plans
      .where('companyId').equals(companyId)
      .first()
  },
  async save(input: Omit<MonitoringPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await monitoringRepository.get(input.companyId)
    if (existing) {
      await db.monitoring_plans.update(existing.id, { ...input, updatedAt: now() })
      return db.monitoring_plans.get(existing.id)
    }
    const row: MonitoringPlan = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.monitoring_plans.add(row)
    return row
  },
}

// ── Lesson ────────────────────────────────────────────────────────────────
export const lessonRepository = {
  async list() {
    return db.lesson_records.orderBy('createdAt').reverse().toArray()
  },
  async listByCompany(companyId: string) {
    return db.lesson_records.where('companyId').equals(companyId).toArray()
  },
  async create(input: Omit<LessonRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: LessonRecord = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.lesson_records.add(row)
    return row
  },
  async update(id: string, patch: Partial<LessonRecord>) {
    await db.lesson_records.update(id, { ...patch, updatedAt: now() })
    return db.lesson_records.get(id)
  },
}

// ── Settings ──────────────────────────────────────────────────────────────
export const settingsRepository = {
  async get(): Promise<AppSettings> {
    const s = await db.app_settings.get('default')
    if (!s) throw new Error('Settings not initialized')
    return s
  },
  async update(patch: Partial<AppSettings>) {
    await db.app_settings.update('default', patch)
    return settingsRepository.get()
  },
}

// ── Export / Import ───────────────────────────────────────────────────────
export const exportImport = {
  async exportAll(): Promise<string> {
    const [
      companies, theses, dataAnalyses, marketAnalyses,
      reviews, valuations, verdicts, monitorings, lessons, settings
    ] = await Promise.all([
      db.companies.toArray(),
      db.thesis_analyses.toArray(),
      db.data_analyses.toArray(),
      db.market_analyses.toArray(),
      db.review_reports.toArray(),
      db.valuation_reports.toArray(),
      db.verdict_reports.toArray(),
      db.monitoring_plans.toArray(),
      db.lesson_records.toArray(),
      db.app_settings.toArray(),
    ])
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: 1,
      companies, theses, dataAnalyses, marketAnalyses,
      reviews, valuations, verdicts, monitorings, lessons, settings,
    }, null, 2)
  },

  async importAll(json: string) {
    const data = JSON.parse(json)
    await db.transaction('rw', [
      db.companies, db.thesis_analyses, db.data_analyses, db.market_analyses,
      db.review_reports, db.valuation_reports, db.verdict_reports,
      db.monitoring_plans, db.lesson_records, db.app_settings,
    ], async () => {
      await Promise.all([
        db.companies.bulkPut(data.companies ?? []),
        db.thesis_analyses.bulkPut(data.theses ?? []),
        db.data_analyses.bulkPut(data.dataAnalyses ?? []),
        db.market_analyses.bulkPut(data.marketAnalyses ?? []),
        db.review_reports.bulkPut(data.reviews ?? []),
        db.valuation_reports.bulkPut(data.valuations ?? []),
        db.verdict_reports.bulkPut(data.verdicts ?? []),
        db.monitoring_plans.bulkPut(data.monitorings ?? []),
        db.lesson_records.bulkPut(data.lessons ?? []),
        db.app_settings.bulkPut(data.settings ?? []),
      ])
    })
  },
}
