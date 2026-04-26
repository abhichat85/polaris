/**
 * AES-256-GCM token encryption for OAuth/API tokens at rest.
 *
 * Authority: CONSTITUTION §13.2 (encrypted token storage), §15.2 (no logging
 * secrets), D-014 (encrypt-at-rest for third-party tokens).
 *
 * Format on the wire: `<iv-base64>:<authTag-base64>:<ciphertext-base64>`.
 * - IV is 12 bytes (GCM standard).
 * - Auth tag is 16 bytes.
 * - Key is 32 bytes (256-bit), supplied via `POLARIS_ENCRYPTION_KEY` as
 *   base64. Generate with `openssl rand -base64 32`.
 *
 * Tamper-evident: any bit flip in ciphertext or authTag causes `decrypt` to
 * throw. Wrong key also throws (auth tag won't validate).
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const ALGO = "aes-256-gcm"
const IV_BYTES = 12
const KEY_BYTES = 32

function loadKey(): Buffer {
  const raw = process.env.POLARIS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      "POLARIS_ENCRYPTION_KEY is not set — refusing to encrypt/decrypt tokens",
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `POLARIS_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`,
    )
  }
  return key
}

export function encrypt(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${enc.toString("base64")}`
}

export function decrypt(packed: string): string {
  const key = loadKey()
  const parts = packed.split(":")
  if (parts.length !== 3) {
    throw new Error("token-encryption: malformed packed value (expected iv:tag:ct)")
  }
  const [ivB64, tagB64, ctB64] = parts
  const iv = Buffer.from(ivB64, "base64")
  const tag = Buffer.from(tagB64, "base64")
  const ct = Buffer.from(ctB64, "base64")
  if (iv.length !== IV_BYTES) {
    throw new Error("token-encryption: malformed IV length")
  }
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(ct), decipher.final()])
  return dec.toString("utf8")
}
