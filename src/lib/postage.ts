/**
 * Paying to knock.
 *
 * A payment is public the moment it lands, so it carries a **commitment**
 * rather than anything usable: an observer sees a hash they cannot reverse and
 * cannot claim. The nonce behind it travels only inside the knock, and
 * revealing it to the relay is what redeems the payment.
 *
 *   data = "knock:" ‖ hex( SHA256( sender_address ‖ nonce )[0..16] )
 *
 * Mirrors `commitment()` in `knock-relay/src/postage.rs`. The commitment names
 * the **sender**, not whoever pays: a Nimiq Pay wallet may sign with one
 * account and pay from another, observed on a real device.
 */

import { sha256 } from "@noble/hashes/sha2.js"

import { addressToBytes } from "./address"
import { toHex } from "./crypto"

/** Luna per NIM. */
export const LUNA_PER_NIM = 100_000

/** A fresh secret to commit to. */
export function newNonce(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32))
}

/** The exact `data` string a postage payment must carry. */
export function commitment(sender: string, nonce: Uint8Array): string {
  const address = addressToBytes(sender)

  const input = new Uint8Array(address.length + nonce.length)
  input.set(address)
  input.set(nonce, address.length)

  return `knock:${toHex(sha256(input).slice(0, 16))}`
}

/** How much to show a person, given an amount in luna. */
export function formatNim(luna: number): string {
  const nim = luna / LUNA_PER_NIM
  return Number.isInteger(nim) ? String(nim) : nim.toFixed(5).replace(/0+$/, "")
}
