import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './schema'
import { decisionLogRepository, exportImport, decryptAllAndStrip } from './repositories'
import { buildDecisionLogDraft, emptyBenchmarkSnapshot, emptyPriceSnapshot } from '../lib/decisionLog'
import { verifyLogBody } from '../lib/decisionLogHash'
import { deriveKey } from '../lib/crypto'
import { setActiveCryptoState } from '../lib/cryptoContext'
import type { CompanyCase } from '../types/domain'

const company: CompanyCase = {
  id: 'c1', ticker: 'TEST', companyName: 'Test Corp', sector: null,
  currentPrice: 100, marketCap: null, enterpriseValue: null,
  investmentHorizonMonths: 36, status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

const NOW = '2026-06-01T12:00:00.000Z'

function makeDraft(decidedAt: string, verdictId: string | null = 'v1') {
  return buildDecisionLogDraft({
    company,
    entrySource: verdictId ? 'verdict_save' : 'manual',
    decidedAt,
    createdAt: NOW,
    referenceTime: decidedAt,
    verdict: verdictId
      ? {
          id: verdictId, companyId: 'c1', axisScores: {} as never, totalScore: 30,
          vetoCount: 0, verdict: 'BUY', rationale: 'r',
          profileUsed: { id: 'standard', label: 'Standard', buyThreshold: 30, watchThreshold: 22, maxVetoForBuy: 1 },
          createdAt: decidedAt,
        }
      : null,
    dataAnalyses: [], valuations: [], theses: [], reviews: [],
    cagrGateMin: 12, appVersion: '0.0.0', buildCommit: 'abc123',
    priceAtDecision: { ...emptyPriceSnapshot(NOW), price: 100, priceDate: '2026-05-29', source: 'manual' },
    benchmarkPrice: { ...emptyBenchmarkSnapshot(NOW), price: 500, priceDate: '2026-05-29', source: 'manual' },
    extraBenchmarks: [],
    humanFinalDecision: 'buy',
    rationale: 'r',
  })
}

beforeEach(async () => {
  setActiveCryptoState(null, false)
  await db.decision_logs.clear()
  await db.decision_log_events.clear()
  await db.decision_log_evaluations.clear()
})

afterEach(() => {
  setActiveCryptoState(null, false)
})

describe('decisionLogRepository.create', () => {
  it('creates the record and its created event atomically, with a valid hash', async () => {
    const rec = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    expect(rec.contentHash).not.toBe('')
    expect(await verifyLogBody(rec)).toBe(true)
    const events = await decisionLogRepository.listEvents(rec.id)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('created')
    expect(await verifyLogBody(events[0])).toBe(true)
  })

  it('rejects a duplicate (same verdict, same decision moment)', async () => {
    await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    await expect(decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z')))
      .rejects.toThrow('duplicate_decision_log')
    expect(await db.decision_logs.count()).toBe(1)
  })

  it('allows a later re-decision on the same verdict and links back to it', async () => {
    const first = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    const second = await decisionLogRepository.create(makeDraft('2026-07-01T10:00:00.000Z'))
    expect(second.previousLogId).toBe(first.id)
  })

  it('gives each record an independent, verifiable hash (no global chain)', async () => {
    const a = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z', 'v1'))
    const b = await decisionLogRepository.create(makeDraft('2026-06-02T10:00:00.000Z', 'v2'))
    expect(await verifyLogBody(a)).toBe(true)
    expect(await verifyLogBody(b)).toBe(true)
    // Tampering with one record is detected on that record alone and does
    // not affect the verification of the other.
    expect(await verifyLogBody({ ...a, rationale: 'rewritten' })).toBe(false)
    expect(await verifyLogBody(b)).toBe(true)
  })

  it('exposes no update or delete (append-only surface)', () => {
    const repo = decisionLogRepository as unknown as Record<string, unknown>
    expect(repo.update).toBeUndefined()
    expect(repo.delete).toBeUndefined()
    expect(repo.remove).toBeUndefined()
  })

  it('events and evaluations append without touching the frozen record', async () => {
    const rec = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    await decisionLogRepository.addEvent({
      logId: rec.id, type: 'correction_note', at: '2026-06-02T00:00:00.000Z',
      note: 'price was the close, not the open', payload: null,
    })
    await decisionLogRepository.addEvaluation({
      logId: rec.id, horizonMonths: 12, evaluatedAt: '2027-06-01T00:00:00.000Z',
      priceNow: { ...emptyPriceSnapshot(NOW), price: 110 },
      benchmarkPriceNow: null, stockReturnPct: 10, benchmarkReturnPct: null,
      excessReturnPct: null, note: null,
    })
    const after = await decisionLogRepository.get(rec.id)
    expect(after?.contentHash).toBe(rec.contentHash)
    expect(await decisionLogRepository.listEvents(rec.id)).toHaveLength(2)
    expect(await decisionLogRepository.listEvaluations(rec.id)).toHaveLength(1)
  })
})

describe('export / import', () => {
  it('round-trips decision logs through exportAll/importAll', async () => {
    const rec = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    const json = await exportImport.exportAll()
    await db.decision_logs.clear()
    await db.decision_log_events.clear()
    await db.decision_log_evaluations.clear()
    expect(await db.decision_logs.count()).toBe(0)
    await exportImport.importAll(json)
    const restored = await decisionLogRepository.get(rec.id)
    expect(restored?.ticker).toBe('TEST')
    expect(restored?.contentHash).toBe(rec.contentHash)
    expect(await decisionLogRepository.listEvents(rec.id)).toHaveLength(1)
  })

  it('imports a legacy backup without decision-log keys', async () => {
    const legacy = JSON.stringify({ version: 1, companies: [], settings: [] })
    await expect(exportImport.importAll(legacy)).resolves.not.toThrow()
  })
})

describe('encryption', () => {
  it('round-trips with encryption ON and stores no plaintext rationale', async () => {
    const key = await deriveKey('test-passphrase')
    setActiveCryptoState(key, true)
    const rec = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    const raw = await db.decision_logs.get(rec.id) as unknown as Record<string, unknown>
    expect(raw._enc).toBeTruthy()
    expect(JSON.stringify(raw)).not.toContain('"rationale":"r"')
    const read = await decisionLogRepository.get(rec.id)
    expect(read?.rationale).toBe('r')
    expect(await verifyLogBody(read!)).toBe(true)
  })

  it('remains readable after decryptAllAndStrip and key removal', async () => {
    const key = await deriveKey('test-passphrase')
    setActiveCryptoState(key, true)
    const rec = await decisionLogRepository.create(makeDraft('2026-06-01T10:00:00.000Z'))
    await decryptAllAndStrip()
    setActiveCryptoState(null, false)
    const read = await decisionLogRepository.get(rec.id)
    expect(read?.ticker).toBe('TEST')
    expect(read?.contentHash).toBe(rec.contentHash)
  })
})
