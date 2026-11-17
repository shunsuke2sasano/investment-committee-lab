import { db } from './schema'
import type { Table } from 'dexie'
import type {
  CompanyCase, ThesisAnalysis, DataAnalysis, MarketAnalysis,
  ReviewReport, ValuationReport, VerdictReport, MonitoringPlan,
  LessonRecord, AppSettings, PositionRecord,
  DecisionLogRecord, DecisionLogEvent, DecisionLogEvaluation,
} from '../types/domain'
import { encrypt as cryptoEncrypt, decrypt as cryptoDecrypt } from '../lib/crypto'
import { isEncryptionActive, getActiveCryptoKey, notifyDecryptError } from '../lib/cryptoContext'
import { hashLogBody } from '../lib/decisionLogHash'
import type { DecisionLogDraft } from '../lib/decisionLog'

function now() { return new Date().toISOString() }
function uid() { return crypto.randomUUID() }

// ── Encryption helpers ─────────────────────────────────────────────────────
//
// Wire format (encrypted):
//   { id, <indexed fields kept plain>, _enc: base64(AES-GCM(JSON(fullRow))) }
//
// `id` is always kept plaintext (primary key).
// Each table also keeps its Dexie-indexed fields plaintext so queries
// (where/orderBy) remain functional even when data is encrypted.
// The full row is redundantly serialised into _enc for complete recovery.
//
// Wire format (unencrypted or legacy): the plain object (no _enc field).

const ENC_FIELD = '_enc'

// Indexed fields per table (from schema.ts) — kept outside _enc
const PLAIN = {
  company:   ['ticker', 'status', 'updatedAt', 'createdAt'],
  thesis:    ['companyId', 'version', 'updatedAt', 'createdAt'],
  data:      ['companyId', 'computedAt'],
  market:    ['companyId', 'computedAt'],
  review:    ['companyId', 'createdAt'],
  valuation: ['companyId', 'createdAt'],
  verdict:   ['companyId', 'createdAt'],
  monitor:   ['companyId', 'updatedAt', 'createdAt'],
  lesson:    ['companyId', 'ticker', 'phase', 'createdAt', 'updatedAt'],
  position:  ['companyId', 'status', 'createdAt', 'updatedAt'],
  decisionLog:          ['companyId', 'ticker', 'decidedAt', 'humanFinalDecision', 'createdAt', 'verdictReportId'],
  decisionLogEvent:     ['logId', 'at'],
  decisionLogEvaluation: ['logId', 'horizonMonths'],
} as const satisfies Record<string, readonly string[]>

async function encRow<T extends { id: string }>(
  row: T,
  keepPlain: readonly string[] = [],
): Promise<T> {
  if (!isEncryptionActive()) return row
  const key = getActiveCryptoKey()!
  const _enc = await cryptoEncrypt(key, JSON.stringify(row))
  const shell: Record<string, unknown> = { id: row.id, [ENC_FIELD]: _enc }
  for (const f of keepPlain) {
    if (f in row) shell[f] = (row as Record<string, unknown>)[f]
  }
  // The encrypted shell is a wire format; Dexie tables store it opaquely
  // under the row's type, and decRow restores the real shape on read.
  return shell as unknown as T
}

// Fix 3: catch decrypt errors, log, return undefined (skip record)
async function decRow<T>(raw: unknown): Promise<T | undefined> {
  if (!raw || typeof raw !== 'object') return undefined
  if (!(ENC_FIELD in raw)) return raw as T
  const key = getActiveCryptoKey()
  if (!key) throw new Error('Encryption key not available — please unlock the app')
  try {
    return JSON.parse(await cryptoDecrypt(key, (raw as Record<string, unknown>)[ENC_FIELD] as string)) as T
  } catch (e) {
    console.error('[crypto] decRow: decryption failed', e)
    return undefined
  }
}

// Fix 3: notify UI once (debounced) if any records fail
async function decRows<T>(rows: unknown[]): Promise<T[]> {
  const results = await Promise.all(rows.map(r => decRow<T>(r)))
  const filtered: T[] = []
  for (const r of results) {
    if (r !== undefined) filtered.push(r)
  }
  if (filtered.length < rows.length) notifyDecryptError()
  return filtered
}

// ── Company ───────────────────────────────────────────────────────────────
export const companyRepository = {
  async list() {
    if (isEncryptionActive()) {
      const raw = await db.companies.toArray()
      const dec = await decRows<CompanyCase>(raw)
      return dec.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }
    return db.companies.orderBy('updatedAt').reverse().toArray()
  },
  async get(id: string) {
    return decRow<CompanyCase>(await db.companies.get(id))
  },
  async getByTicker(ticker: string) {
    if (isEncryptionActive()) {
      const all = await decRows<CompanyCase>(await db.companies.toArray())
      return all.find(c => c.ticker.toUpperCase() === ticker.toUpperCase())
    }
    return db.companies.where('ticker').equals(ticker.toUpperCase()).first()
  },
  async create(input: Omit<CompanyCase, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: CompanyCase = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.companies.add(await encRow(row, PLAIN.company))
    return row
  },
  async update(id: string, patch: Partial<CompanyCase>) {
    if (isEncryptionActive()) {
      const existing = await companyRepository.get(id)
      if (!existing) return undefined
      const merged: CompanyCase = { ...existing, ...patch, updatedAt: now() }
      await db.companies.put(await encRow(merged, PLAIN.company))
      return merged
    }
    await db.companies.update(id, { ...patch, updatedAt: now() })
    return db.companies.get(id)
  },
  async delete(id: string) {
    await Promise.all([
      db.thesis_analyses.where('companyId').equals(id).delete(),
      db.data_analyses.where('companyId').equals(id).delete(),
      db.market_analyses.where('companyId').equals(id).delete(),
      db.review_reports.where('companyId').equals(id).delete(),
      db.valuation_reports.where('companyId').equals(id).delete(),
      db.verdict_reports.where('companyId').equals(id).delete(),
      db.monitoring_plans.where('companyId').equals(id).delete(),
      db.lesson_records.where('companyId').equals(id).delete(),
      db.position_records.where('companyId').equals(id).delete(),
    ])
    await db.companies.delete(id)
  },
}

// ── Thesis ────────────────────────────────────────────────────────────────
export const thesisRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.thesis_analyses.where('companyId').equals(companyId).toArray()
      const dec = await decRows<ThesisAnalysis>(raw)
      return dec.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? undefined
    }
    return db.thesis_analyses.where('companyId').equals(companyId).reverse().first()
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
    await db.thesis_analyses.add(await encRow(row, PLAIN.thesis))
    return row
  },
  async update(id: string, patch: Partial<ThesisAnalysis>) {
    if (isEncryptionActive()) {
      const existing = await decRow<ThesisAnalysis>(await db.thesis_analyses.get(id))
      if (!existing) return undefined
      const merged: ThesisAnalysis = { ...existing, ...patch, updatedAt: now() }
      await db.thesis_analyses.put(await encRow(merged, PLAIN.thesis))
      return merged
    }
    await db.thesis_analyses.update(id, { ...patch, updatedAt: now() })
    return db.thesis_analyses.get(id)
  },
}

// ── Data Lane ─────────────────────────────────────────────────────────────
export const dataAnalysisRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.data_analyses.where('companyId').equals(companyId).toArray()
      const dec = await decRows<DataAnalysis>(raw)
      return dec.sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0] ?? undefined
    }
    return db.data_analyses.where('companyId').equals(companyId).reverse().first()
  },
  async save(input: Omit<DataAnalysis, 'id'>) {
    const row: DataAnalysis = { ...input, id: uid() }
    await db.data_analyses.add(await encRow(row, PLAIN.data))
    return row
  },
}

// ── Market Lane ───────────────────────────────────────────────────────────
export const marketAnalysisRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.market_analyses.where('companyId').equals(companyId).toArray()
      const dec = await decRows<MarketAnalysis>(raw)
      return dec.sort((a, b) => b.computedAt.localeCompare(a.computedAt))[0] ?? undefined
    }
    return db.market_analyses.where('companyId').equals(companyId).reverse().first()
  },
  async save(input: Omit<MarketAnalysis, 'id'>) {
    const row: MarketAnalysis = { ...input, id: uid() }
    await db.market_analyses.add(await encRow(row, PLAIN.market))
    return row
  },
}

// ── Review ────────────────────────────────────────────────────────────────
export const reviewRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.review_reports.where('companyId').equals(companyId).toArray()
      const dec = await decRows<ReviewReport>(raw)
      return dec.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? undefined
    }
    return db.review_reports.where('companyId').equals(companyId).reverse().first()
  },
  async save(input: Omit<ReviewReport, 'id'>) {
    const row: ReviewReport = { ...input, id: uid() }
    await db.review_reports.add(await encRow(row, PLAIN.review))
    return row
  },
}

// ── Valuation ─────────────────────────────────────────────────────────────
export const valuationRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.valuation_reports.where('companyId').equals(companyId).toArray()
      const dec = await decRows<ValuationReport>(raw)
      return dec.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? undefined
    }
    return db.valuation_reports.where('companyId').equals(companyId).reverse().first()
  },
  async listLatestAll(): Promise<Map<string, ValuationReport>> {
    const raw = await db.valuation_reports.toArray()
    const all = await decRows<ValuationReport>(raw)
    const map = new Map<string, ValuationReport>()
    all.forEach(v => {
      const existing = map.get(v.companyId)
      if (!existing || v.createdAt > existing.createdAt) map.set(v.companyId, v)
    })
    return map
  },
  async save(input: Omit<ValuationReport, 'id'>) {
    const row: ValuationReport = { ...input, id: uid() }
    await db.valuation_reports.add(await encRow(row, PLAIN.valuation))
    return row
  },
}

// ── Verdict ───────────────────────────────────────────────────────────────
export const verdictRepository = {
  async getLatest(companyId: string) {
    if (isEncryptionActive()) {
      const raw = await db.verdict_reports.where('companyId').equals(companyId).toArray()
      const dec = await decRows<VerdictReport>(raw)
      return dec.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? undefined
    }
    return db.verdict_reports.where('companyId').equals(companyId).reverse().first()
  },
  async listLatestAll(): Promise<Map<string, VerdictReport>> {
    const raw = await db.verdict_reports.toArray()
    const all = await decRows<VerdictReport>(raw)
    const map = new Map<string, VerdictReport>()
    all.forEach(v => {
      const existing = map.get(v.companyId)
      if (!existing || v.createdAt > existing.createdAt) map.set(v.companyId, v)
    })
    return map
  },
  async save(input: Omit<VerdictReport, 'id'>) {
    const row: VerdictReport = { ...input, id: uid() }
    await db.verdict_reports.add(await encRow(row, PLAIN.verdict))
    return row
  },
}

// ── Monitoring ────────────────────────────────────────────────────────────
export const monitoringRepository = {
  async listAll() {
    return decRows<MonitoringPlan>(await db.monitoring_plans.toArray())
  },
  async get(companyId: string) {
    const raw = await db.monitoring_plans.where('companyId').equals(companyId).first()
    return decRow<MonitoringPlan>(raw)
  },
  async save(input: Omit<MonitoringPlan, 'id' | 'createdAt' | 'updatedAt'>) {
    const existing = await monitoringRepository.get(input.companyId)
    if (existing) {
      const merged: MonitoringPlan = { ...existing, ...input, updatedAt: now() }
      await db.monitoring_plans.put(await encRow(merged, PLAIN.monitor))
      return merged
    }
    const row: MonitoringPlan = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.monitoring_plans.add(await encRow(row, PLAIN.monitor))
    return row
  },
}

// ── Lesson ────────────────────────────────────────────────────────────────
export const lessonRepository = {
  async list() {
    if (isEncryptionActive()) {
      const raw = await db.lesson_records.toArray()
      const dec = await decRows<LessonRecord>(raw)
      return dec.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
    return db.lesson_records.orderBy('createdAt').reverse().toArray()
  },
  async listByCompany(companyId: string) {
    const raw = await db.lesson_records.where('companyId').equals(companyId).toArray()
    return decRows<LessonRecord>(raw)
  },
  async create(input: Omit<LessonRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const row: LessonRecord = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.lesson_records.add(await encRow(row, PLAIN.lesson))
    return row
  },
  async update(id: string, patch: Partial<LessonRecord>) {
    if (isEncryptionActive()) {
      const existing = await decRow<LessonRecord>(await db.lesson_records.get(id))
      if (!existing) return undefined
      const merged: LessonRecord = { ...existing, ...patch, updatedAt: now() }
      await db.lesson_records.put(await encRow(merged, PLAIN.lesson))
      return merged
    }
    await db.lesson_records.update(id, { ...patch, updatedAt: now() })
    return db.lesson_records.get(id)
  },
}

// ── Position ──────────────────────────────────────────────────────────────
export const positionRepository = {
  async get(companyId: string): Promise<PositionRecord | undefined> {
    const raw = await db.position_records.where('companyId').equals(companyId).first()
    return decRow<PositionRecord>(raw)
  },
  async save(input: Omit<PositionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<PositionRecord> {
    const existing = await positionRepository.get(input.companyId)
    if (existing) {
      const merged: PositionRecord = { ...existing, ...input, updatedAt: now() }
      await db.position_records.put(await encRow(merged, PLAIN.position))
      return merged
    }
    const row: PositionRecord = { ...input, id: uid(), createdAt: now(), updatedAt: now() }
    await db.position_records.add(await encRow(row, PLAIN.position))
    return row
  },
}

// ── Forward Decision Log (Phase A) ─────────────────────────────────────
// Append-only by design: this repository intentionally exposes no update
// or delete. Corrections and additions are new events / evaluations.
// Creation is atomic: the record and its 'created' event are written in a
// single transaction, re-validated inside it, so a double-click or a
// second tab cannot double-register the same decision moment (see
// create() for why the crypto runs outside the transaction).
export const decisionLogRepository = {
  /** All source records for a company, for point-in-time (as-of) assembly
   * in lib/decisionLog. Selection by timestamp happens there, purely. */
  async loadCompanySources(companyId: string) {
    const [dataAnalyses, valuations, theses, reviews] = await Promise.all([
      db.data_analyses.where('companyId').equals(companyId).toArray(),
      db.valuation_reports.where('companyId').equals(companyId).toArray(),
      db.thesis_analyses.where('companyId').equals(companyId).toArray(),
      db.review_reports.where('companyId').equals(companyId).toArray(),
    ])
    return {
      dataAnalyses: await decRows<DataAnalysis>(dataAnalyses),
      valuations: await decRows<ValuationReport>(valuations),
      theses: await decRows<ThesisAnalysis>(theses),
      reviews: await decRows<ReviewReport>(reviews),
    }
  },

  async create(draft: DecisionLogDraft): Promise<DecisionLogRecord> {
    // Hashing and encryption use WebCrypto, whose promises are not
    // Dexie-transaction-aware: awaiting them inside a transaction commits
    // it early (PrematureCommitError). So all crypto happens first, and
    // the transaction itself contains only IndexedDB operations — a
    // duplicate re-check on plaintext fields followed by the two inserts.
    // The write stays atomic: either both rows land or neither does.
    // Integrity is per-record (individual contentHash); Phase A has no
    // global hash chain (Issue #6, mandatory fix A).
    const existing = await decRows<DecisionLogRecord>(await db.decision_logs.toArray())
    // Duplicate guard: same verdict + same decision moment = the same
    // decision submitted twice. A later re-decision on the same verdict
    // has a different decidedAt and is allowed (it links back via
    // previousLogId). The &[verdictReportId+decidedAt] unique index is
    // the final backstop behind this check and the in-transaction one.
    if (draft.verdictReportId) {
      const dup = existing.find(l =>
        l.verdictReportId === draft.verdictReportId && l.decidedAt === draft.decidedAt)
      if (dup) throw new Error('duplicate_decision_log')
    }
    const sameVerdict = existing
      .filter(l => draft.verdictReportId != null && l.verdictReportId === draft.verdictReportId)
      .sort((a, b) => (a.createdAt + a.id).localeCompare(b.createdAt + b.id))

    const record: DecisionLogRecord = {
      ...draft,
      id: uid(),
      previousLogId: sameVerdict.length > 0 ? sameVerdict[sameVerdict.length - 1].id : null,
      contentHash: '',
    }
    record.contentHash = await hashLogBody(record)
    const event: DecisionLogEvent = {
      id: uid(), logId: record.id, type: 'created', at: now(),
      note: null, payload: null, contentHash: '',
    }
    event.contentHash = await hashLogBody(event)
    const encRecord = await encRow(record, PLAIN.decisionLog)
    const encEvent = await encRow(event, PLAIN.decisionLogEvent)

    await db.transaction('rw', [db.decision_logs, db.decision_log_events], async () => {
      if (draft.verdictReportId) {
        const raw = await db.decision_logs.toArray() as unknown as Record<string, unknown>[]
        const dup = raw.find(r =>
          r.verdictReportId === draft.verdictReportId && r.decidedAt === draft.decidedAt)
        if (dup) throw new Error('duplicate_decision_log')
      }
      await db.decision_logs.add(encRecord)
      await db.decision_log_events.add(encEvent)
    })
    return record
  },

  async get(id: string) {
    return decRow<DecisionLogRecord>(await db.decision_logs.get(id))
  },
  async list() {
    const all = await decRows<DecisionLogRecord>(await db.decision_logs.toArray())
    return all.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
  },
  async listByCompany(companyId: string) {
    const raw = await db.decision_logs.where('companyId').equals(companyId).toArray()
    const all = await decRows<DecisionLogRecord>(raw)
    return all.sort((a, b) => b.decidedAt.localeCompare(a.decidedAt))
  },

  async addEvent(input: Omit<DecisionLogEvent, 'id' | 'contentHash'>): Promise<DecisionLogEvent> {
    const event: DecisionLogEvent = { ...input, id: uid(), contentHash: '' }
    event.contentHash = await hashLogBody(event)
    await db.decision_log_events.add(await encRow(event, PLAIN.decisionLogEvent))
    return event
  },
  async listEvents(logId: string) {
    const raw = await db.decision_log_events.where('logId').equals(logId).toArray()
    const all = await decRows<DecisionLogEvent>(raw)
    return all.sort((a, b) => a.at.localeCompare(b.at))
  },

  async addEvaluation(input: Omit<DecisionLogEvaluation, 'id' | 'contentHash'>): Promise<DecisionLogEvaluation> {
    const evaluation: DecisionLogEvaluation = { ...input, id: uid(), contentHash: '' }
    evaluation.contentHash = await hashLogBody(evaluation)
    await db.decision_log_evaluations.add(await encRow(evaluation, PLAIN.decisionLogEvaluation))
    return evaluation
  },
  async listEvaluations(logId?: string) {
    const raw = logId
      ? await db.decision_log_evaluations.where('logId').equals(logId).toArray()
      : await db.decision_log_evaluations.toArray()
    const all = await decRows<DecisionLogEvaluation>(raw)
    return all.sort((a, b) => a.evaluatedAt.localeCompare(b.evaluatedAt))
  },
}

// ── Decrypt-all (for disabling encryption) ────────────────────────────────
// Reads every table, decrypts any encrypted records, and writes them back
// as plain objects (no _enc field). Must be called while the key is still
// active — i.e. BEFORE setActiveCryptoState(null, false).
export async function decryptAllAndStrip(): Promise<void> {
  if (!isEncryptionActive()) return

  async function stripTable<T extends { id: string }>(table: Table<T>): Promise<void> {
    const rows = await table.toArray()
    const plain: T[] = []
    for (const row of rows) {
      if (!(ENC_FIELD in row)) { plain.push(row); continue }
      const dec = await decRow<T>(row)
      if (dec) plain.push(dec)
    }
    if (plain.length > 0) await table.bulkPut(plain)
  }

  await Promise.all([
    stripTable(db.companies),
    stripTable(db.thesis_analyses),
    stripTable(db.data_analyses),
    stripTable(db.market_analyses),
    stripTable(db.review_reports),
    stripTable(db.valuation_reports),
    stripTable(db.verdict_reports),
    stripTable(db.monitoring_plans),
    stripTable(db.lesson_records),
    stripTable(db.position_records),
    stripTable(db.decision_logs),
    stripTable(db.decision_log_events),
    stripTable(db.decision_log_evaluations),
  ])
}

// ── Settings ──────────────────────────────────────────────────────────────
// Settings are NEVER encrypted — they contain the encryption flag itself.
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
// Exports raw IndexedDB records (may contain _enc fields if encryption is on).
export const exportImport = {
  async exportAll(): Promise<string> {
    const [
      companies, theses, dataAnalyses, marketAnalyses,
      reviews, valuations, verdicts, monitorings, lessons, settings, positions,
      decisionLogs, decisionLogEvents, decisionLogEvaluations
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
      db.position_records.toArray(),
      db.decision_logs.toArray(),
      db.decision_log_events.toArray(),
      db.decision_log_evaluations.toArray(),
    ])
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: 1,
      companies, theses, dataAnalyses, marketAnalyses,
      reviews, valuations, verdicts, monitorings, lessons, settings, positions,
      decisionLogs, decisionLogEvents, decisionLogEvaluations,
    }, null, 2)
  },

  async importAll(json: string) {
    const data = JSON.parse(json)
    await db.transaction('rw', [
      db.companies, db.thesis_analyses, db.data_analyses, db.market_analyses,
      db.review_reports, db.valuation_reports, db.verdict_reports,
      db.monitoring_plans, db.lesson_records, db.app_settings, db.position_records,
      db.decision_logs, db.decision_log_events, db.decision_log_evaluations,
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
        db.position_records.bulkPut(data.positions ?? []),
        db.decision_logs.bulkPut(data.decisionLogs ?? []),
        db.decision_log_events.bulkPut(data.decisionLogEvents ?? []),
        db.decision_log_evaluations.bulkPut(data.decisionLogEvaluations ?? []),
      ])
    })
  },
}
