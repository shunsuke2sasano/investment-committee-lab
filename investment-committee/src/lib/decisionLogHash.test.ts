import { describe, it, expect } from 'vitest'
import { canonicalStringify, hashLogBody, verifyLogBody } from './decisionLogHash'

describe('canonicalStringify', () => {
  it('is independent of object key order', () => {
    const a = canonicalStringify({ b: 1, a: { d: 4, c: 3 } })
    const b = canonicalStringify({ a: { c: 3, d: 4 }, b: 1 })
    expect(a).toBe(b)
  })
  it('keeps array order significant', () => {
    expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]))
  })
  it('drops undefined values', () => {
    expect(canonicalStringify({ a: 1, b: undefined })).toBe(canonicalStringify({ a: 1 }))
  })
})

describe('hashLogBody', () => {
  const base = {
    id: 'id-1', decidedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
    ticker: 'AAPL', rationale: 'r', contentHash: '',
  }
  it('verifies a body it hashed', async () => {
    const body = { ...base, contentHash: await hashLogBody(base) }
    expect(await verifyLogBody(body)).toBe(true)
  })
  it('changes when a content field changes', async () => {
    const h1 = await hashLogBody(base)
    const h2 = await hashLogBody({ ...base, ticker: 'MSFT' })
    expect(h1).not.toBe(h2)
  })
  it('covers id and createdAt (only contentHash is excluded)', async () => {
    const h1 = await hashLogBody(base)
    expect(await hashLogBody({ ...base, id: 'id-2' })).not.toBe(h1)
    expect(await hashLogBody({ ...base, createdAt: '2026-01-02T00:00:00.000Z' })).not.toBe(h1)
    expect(await hashLogBody({ ...base, rationale: 'changed' })).not.toBe(h1)
  })
  it('detects tampering', async () => {
    const body = { ...base, contentHash: await hashLogBody(base) }
    expect(await verifyLogBody({ ...body, ticker: 'TSLA' })).toBe(false)
  })
})
