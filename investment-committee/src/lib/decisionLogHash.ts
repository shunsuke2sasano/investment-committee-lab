// ── Decision log integrity hashing ───────────────────────────────────────
// Canonical serialization + SHA-256 for the forward decision log.
// The hash covers the whole record except `contentHash` itself — including
// id, timestamps and the prev-hash chain link (Issue #6, P0-4).
// This is tamper *detection* for one's own records, not third-party proof:
// anyone who can rewrite the database can also recompute the hashes. Its
// value comes from pairing it with exported backups kept outside the app.

/** Deterministic JSON: object keys sorted recursively, arrays kept in
 * order, `undefined` values dropped (mirroring JSON.stringify semantics). */
export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null'
  }
  if (Array.isArray(value)) {
    return '[' + value.map(v => canonicalStringify(v === undefined ? null : v)).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(obj[k])).join(',') + '}'
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Hash of a log record / event / evaluation: everything except its own
 * `contentHash` field. */
export async function hashLogBody<T extends { contentHash: string }>(body: T): Promise<string> {
  const rest: Record<string, unknown> = { ...(body as Record<string, unknown>) }
  delete rest.contentHash
  return sha256Hex(canonicalStringify(rest))
}

export async function verifyLogBody<T extends { contentHash: string }>(body: T): Promise<boolean> {
  return (await hashLogBody(body)) === body.contentHash
}
