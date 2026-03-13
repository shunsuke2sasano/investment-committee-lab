// ═══════════════════════════════════════════════════════════════════════════
// Crypto context — module-level singleton
//
// Repositories cannot import from Zustand (would create circular deps or
// require React context), so they read the active CryptoKey from here.
// The key lives only in memory and is never persisted.
// ═══════════════════════════════════════════════════════════════════════════

let _key: CryptoKey | null = null
let _enabled = false

export function setActiveCryptoState(key: CryptoKey | null, enabled: boolean): void {
  _key = key
  _enabled = enabled
}

/** Returns true when encryption is enabled AND a key has been derived. */
export function isEncryptionActive(): boolean {
  return _enabled && _key !== null
}

/** Returns the active key, or null if not yet derived. */
export function getActiveCryptoKey(): CryptoKey | null {
  return _key
}

// ── Decrypt error notification ─────────────────────────────────────────────
// Repositories call notifyDecryptError() when a record fails to decrypt.
// Debounced to prevent flooding the UI with repeated toasts in one load.

let _errorHandler: (() => void) | null = null
let _errorDebounce: ReturnType<typeof setTimeout> | null = null

export function setDecryptErrorHandler(handler: () => void): void {
  _errorHandler = handler
}

export function notifyDecryptError(): void {
  if (_errorDebounce) return
  _errorDebounce = setTimeout(() => {
    _errorDebounce = null
    _errorHandler?.()
  }, 150)
}
