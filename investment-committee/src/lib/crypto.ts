// ═══════════════════════════════════════════════════════════════════════════
// WebCrypto AES-GCM encryption utilities
// ═══════════════════════════════════════════════════════════════════════════
//
// Key derivation: PBKDF2 (SHA-256, 100k iterations) → AES-GCM-256
// Wire format:   base64( IV[12B] + ciphertext )
//
// The PBKDF2 salt is fixed per-application (not secret).
// For a single-user local app this prevents rainbow tables while keeping
// the unlock flow simple (no salt storage needed).

const APP_SALT = new TextEncoder().encode('IC-vNext-AES-GCM-Salt-2025')

// ── Key derivation ─────────────────────────────────────────────────────────
export async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: APP_SALT, iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

// ── Encrypt ────────────────────────────────────────────────────────────────
export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  // Pack: iv(12B) ‖ ciphertext → base64
  const packed = new Uint8Array(12 + ciphertext.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(ciphertext), 12)
  return toBase64(packed)
}

// ── Decrypt ────────────────────────────────────────────────────────────────
// Throws DOMException if the key is wrong (AES-GCM auth tag mismatch).
export async function decrypt(key: CryptoKey, ciphertext: string): Promise<string> {
  const packed = fromBase64(ciphertext)
  const iv   = packed.slice(0, 12)
  const data = packed.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
  return new TextDecoder().decode(plain)
}

// ── Helpers ────────────────────────────────────────────────────────────────
function toBase64(bytes: Uint8Array): string {
  let s = ''
  // Process in chunks to avoid call-stack overflow on large payloads
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
