/**
 * Tests for AES-256-GCM token encryption.
 * Authority: CONSTITUTION §13.2 (encrypted token storage), §15.2 (no logging secrets).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { randomBytes } from "node:crypto"

import { encrypt, decrypt } from "@/lib/crypto/token-encryption"

const ORIGINAL_KEY = process.env.POLARIS_ENCRYPTION_KEY

function setKey(buf: Buffer) {
  process.env.POLARIS_ENCRYPTION_KEY = buf.toString("base64")
}

describe("token-encryption", () => {
  beforeEach(() => {
    setKey(randomBytes(32))
  })

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.POLARIS_ENCRYPTION_KEY
    else process.env.POLARIS_ENCRYPTION_KEY = ORIGINAL_KEY
  })

  it("round-trips a plaintext value", () => {
    const plaintext = "ghp_abc123XYZ"
    const packed = encrypt(plaintext)
    expect(typeof packed).toBe("string")
    expect(packed).not.toContain(plaintext)
    expect(decrypt(packed)).toBe(plaintext)
  })

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encrypt("same-input")
    const b = encrypt("same-input")
    expect(a).not.toBe(b)
  })

  it("packed format is iv:authTag:ciphertext (3 base64 segments)", () => {
    const packed = encrypt("hello")
    const segments = packed.split(":")
    expect(segments).toHaveLength(3)
    // base64-decoded IV is 12 bytes, authTag is 16 bytes
    expect(Buffer.from(segments[0], "base64").length).toBe(12)
    expect(Buffer.from(segments[1], "base64").length).toBe(16)
  })

  it("throws when ciphertext is tampered (auth tag mismatch)", () => {
    const packed = encrypt("secret-token")
    const [iv, authTag, ciphertext] = packed.split(":")
    // Flip a bit in ciphertext
    const buf = Buffer.from(ciphertext, "base64")
    buf[0] ^= 0x01
    const tampered = `${iv}:${authTag}:${buf.toString("base64")}`
    expect(() => decrypt(tampered)).toThrow()
  })

  it("throws when authTag is tampered", () => {
    const packed = encrypt("secret-token")
    const [iv, authTag, ciphertext] = packed.split(":")
    const buf = Buffer.from(authTag, "base64")
    buf[0] ^= 0x01
    const tampered = `${iv}:${buf.toString("base64")}:${ciphertext}`
    expect(() => decrypt(tampered)).toThrow()
  })

  it("decrypt with a different key fails", () => {
    const packed = encrypt("secret-token")
    setKey(randomBytes(32)) // rotate key
    expect(() => decrypt(packed)).toThrow()
  })

  it("encrypt throws clearly when POLARIS_ENCRYPTION_KEY is missing", () => {
    delete process.env.POLARIS_ENCRYPTION_KEY
    expect(() => encrypt("x")).toThrow(/POLARIS_ENCRYPTION_KEY/)
  })

  it("decrypt throws clearly when POLARIS_ENCRYPTION_KEY is missing", () => {
    const packed = encrypt("x")
    delete process.env.POLARIS_ENCRYPTION_KEY
    expect(() => decrypt(packed)).toThrow(/POLARIS_ENCRYPTION_KEY/)
  })

  it("throws when key is wrong length", () => {
    process.env.POLARIS_ENCRYPTION_KEY = randomBytes(16).toString("base64")
    expect(() => encrypt("x")).toThrow(/32 bytes/)
  })

  it("throws clearly when packed value is malformed", () => {
    expect(() => decrypt("not-valid")).toThrow()
  })
})
