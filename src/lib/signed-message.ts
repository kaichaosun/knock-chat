/**
 * Nimiq's signed-message construction.
 *
 * `nimiq.sign()` does not sign the message you hand it. It wraps the message in
 * a length-prefixed envelope, hashes that with SHA-256, and signs the digest —
 * an EIP-191-style guard so a signing request can never be tricked into
 * authorising a transaction.
 *
 *   digest = SHA256( 0x16 ‖ "Nimiq Signed Message:\n" ‖ ascii(byteLength) ‖ message )
 *
 * Mirrors `prepare_message_for_signature` in core-rs-albatross
 * `wallet/src/wallet_account.rs`, and is pinned to a signature produced by a
 * real Nimiq Pay wallet. The relay must verify over exactly these bytes.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { sha256 } from "@noble/hashes/sha2.js"

/** 0x16 is the length of the ASCII portion that follows it. */
const PREFIX = "\x16Nimiq Signed Message:\n"

/** The 32 bytes a wallet actually signs for `message`. */
export function signedMessageDigest(message: string): Uint8Array {
  const body = new TextEncoder().encode(message)
  // The length is the message's *byte* count, not its character count.
  const head = new TextEncoder().encode(PREFIX + String(body.length))

  const buffer = new Uint8Array(head.length + body.length)
  buffer.set(head)
  buffer.set(body, head.length)
  return sha256(buffer)
}

/** Parse hex with or without an `0x` prefix. */
export function hexToBytes(hex: string): Uint8Array {
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

/** Verify a `nimiq.sign()` result against the message it claims to cover. */
export function verifySignedMessage(
  message: string,
  signature: string | Uint8Array,
  publicKey: string | Uint8Array,
): boolean {
  const sig = typeof signature === "string" ? hexToBytes(signature) : signature
  const key = typeof publicKey === "string" ? hexToBytes(publicKey) : publicKey
  try {
    return ed25519.verify(sig, signedMessageDigest(message), key)
  } catch {
    return false
  }
}
