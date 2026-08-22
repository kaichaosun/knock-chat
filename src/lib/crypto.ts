/**
 * Message encryption.
 *
 * The wallet cannot do key agreement — the provider is a signing oracle and
 * never releases the seed — so each device generates its own X25519 keypair and
 * has the wallet *certify* it. That is the standard identity-key-certifies-
 * subkey pattern (PGP subkeys, Signal prekeys), and it means nothing here
 * depends on `sign()` being deterministic.
 *
 * Two parties derive the same conversation key independently:
 *
 *   key = HKDF-SHA256( X25519(mine, theirs), info = "knock/v1/message" ‖ both public keys )
 *
 * and messages are sealed with XChaCha20-Poly1305 under it.
 *
 * What this deliberately does not provide: **forward secrecy**. One key covers
 * a whole conversation, so anyone who obtains a device's private key can read
 * that conversation's entire history. A ratchet is future work; a correct
 * simple scheme beats a subtly broken clever one.
 */

import { x25519 } from "@noble/curves/ed25519.js"
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js"
import { hkdf } from "@noble/hashes/hkdf.js"
import { sha256 } from "@noble/hashes/sha2.js"

import { compact } from "./address"

/** Bumped if the wire format ever changes; readers reject anything else. */
const VERSION = 1
const NONCE_BYTES = 24
const KEY_BYTES = 32

const utf8 = new TextEncoder()

export type EncryptionKeyPair = {
  secretKey: Uint8Array
  publicKey: Uint8Array
}

/** A fresh device key. Uses `crypto.getRandomValues`, which — unlike
 *  `crypto.randomUUID` — is available even outside a secure context. */
export function generateKeyPair(): EncryptionKeyPair {
  return x25519.keygen()
}

/** The public half of an X25519 secret. Derived, never stored separately. */
export function publicKeyFrom(secretKey: Uint8Array): Uint8Array {
  return x25519.getPublicKey(secretKey)
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().replace(/^0x/i, "")
  if (clean.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(clean)) {
    throw new Error("not a hex string")
  }
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

/**
 * The key both sides of a conversation derive independently.
 *
 * Public keys go into the HKDF info sorted, so each party feeds it identical
 * bytes despite holding them in opposite roles. Binding them in at all keeps a
 * shared secret from being reusable under some other protocol.
 */
export function conversationKey(
  mySecretKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const shared = x25519.getSharedSecret(mySecretKey, theirPublicKey)
  const mine = x25519.getPublicKey(mySecretKey)
  const [first, second] =
    compareBytes(mine, theirPublicKey) <= 0 ? [mine, theirPublicKey] : [theirPublicKey, mine]

  return hkdf(sha256, shared, undefined, concat(utf8.encode("knock/v1/message"), first, second), KEY_BYTES)
}

/**
 * Bind a ciphertext to its sender and recipient, so one cannot be lifted into
 * a different conversation — or a different direction of the same one — and
 * still authenticate.
 */
function associatedData(from: string, to: string): Uint8Array {
  return utf8.encode(`${compact(from)}>${compact(to)}`)
}

/** Seal `plaintext`. Returns `[version ‖ nonce ‖ ciphertext]`, base64. */
export function encryptBody(
  plaintext: string,
  key: Uint8Array,
  from: string,
  to: string,
): string {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const sealed = xchacha20poly1305(key, nonce, associatedData(from, to)).encrypt(
    utf8.encode(plaintext),
  )
  return base64Encode(concat(new Uint8Array([VERSION]), nonce, sealed))
}

/**
 * Open a sealed body. Returns `null` for anything that is not a valid message
 * from `from` to `to` under `key` — wrong key, tampering, or a body that was
 * never encrypted at all.
 */
export function decryptBody(
  payload: string,
  key: Uint8Array,
  from: string,
  to: string,
): string | null {
  try {
    const raw = base64Decode(payload)
    if (raw.length < 1 + NONCE_BYTES + 16 || raw[0] !== VERSION) return null

    const nonce = raw.slice(1, 1 + NONCE_BYTES)
    const sealed = raw.slice(1 + NONCE_BYTES)
    const opened = xchacha20poly1305(key, nonce, associatedData(from, to)).decrypt(sealed)
    return new TextDecoder().decode(opened)
  } catch {
    return null
  }
}

/** Whether a body looks like something `decryptBody` should be handed. */
export function looksEncrypted(payload: string): boolean {
  try {
    const raw = base64Decode(payload)
    return raw.length >= 1 + NONCE_BYTES + 16 && raw[0] === VERSION
  } catch {
    return false
  }
}

function base64Encode(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
