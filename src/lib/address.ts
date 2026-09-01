/**
 * Nimiq address helpers.
 *
 * An address is 20 bytes shown IBAN-style: `NQ`, two check digits, then 32
 * base32 characters in groups of four. Validation mirrors the relay's Rust
 * implementation and core-rs-albatross, so a string this module accepts is one
 * the relay will accept too.
 */

import { blake2b } from "@noble/hashes/blake2.js"

const ADDRESS_LEN = 20
const CCODE = "NQ"
/** Nimiq's base32 alphabet omits I, O, W and Z to avoid transcription errors. */
const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVXY"

/** Strip formatting so the 36 significant characters can be inspected. */
export function compact(address: string): string {
  return address.replace(/\s+/g, "")
}

/** IBAN mod-97 checksum: rotate the first four characters to the end, map letters to numbers. */
function ibanChecksum(iban: string): number | null {
  const rotated = iban.slice(4) + iban.slice(0, 4)
  let digits = ""
  for (const char of rotated) {
    if (char >= "0" && char <= "9") {
      digits += char
    } else if (/[A-Za-z]/.test(char)) {
      digits += String(char.toUpperCase().charCodeAt(0) - 55)
    } else {
      return null
    }
  }
  // Fold digit by digit; the full number is far larger than Number.MAX_SAFE_INTEGER.
  let checksum = 0
  for (const digit of digits) {
    checksum = (checksum * 10 + Number(digit)) % 97
  }
  return checksum
}

/**
 * The one spelling of an address, whatever check digits it came with.
 *
 * The digits are recomputed from the body, so an address that arrived in a
 * second valid form — mod-97 admits `NQ00…` for the body that `NQ97…` names —
 * comes back as the form the rest of the app writes.
 */
function canonical(address: string): string {
  const body = compact(address).slice(4)
  const checksum = 98 - (ibanChecksum(`${CCODE}00${body}`) ?? 0)
  return formatAddress(`${CCODE}${String(checksum).padStart(2, "0")}${body}`)
}

/** Whether `address` is a well-formed Nimiq address, checksum included. */
export function isValidAddress(address: string): boolean {
  const value = compact(address)
  if (value.length !== 36) return false
  if (!value.startsWith(CCODE)) return false
  for (const char of value.slice(4)) {
    if (!ALPHABET.includes(char)) return false
  }
  return ibanChecksum(value) === 1
}

/** Render in the canonical grouped form: `NQ97 V68G X92J …`. */
export function formatAddress(address: string): string {
  const value = compact(address)
  return value.match(/.{1,4}/g)?.join(" ") ?? value
}

/**
 * Shorten for tight spots — first and last block around an ellipsis.
 * `NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY` → `NQ97 V68G … JLKY`
 */
export function shortenAddress(address: string): string {
  const blocks = formatAddress(address).split(" ")
  if (blocks.length < 4) return formatAddress(address)
  return `${blocks[0]} ${blocks[1]} … ${blocks[blocks.length - 1]}`
}

/** Uppercase and regroup whatever the user typed, so the field self-corrects. */
export function normalizeInput(input: string): string {
  const value = compact(input).toUpperCase().slice(0, 36)
  return value.match(/.{1,4}/g)?.join(" ") ?? value
}

/**
 * An address wherever it turns up: `NQ`, two check digits, 32 base32
 * characters. A pattern rather than a regex, so it can be built into a larger
 * one.
 *
 * Exported because a mention is an address inside ordinary text, and anything
 * looking for one should match exactly what this module calls an address rather
 * than keep a second copy of the alphabet that can drift from this one.
 */
export const ADDRESS_PATTERN = `${CCODE}[0-9]{2}[${ALPHABET}]{32}`

const ADDRESS = new RegExp(ADDRESS_PATTERN)

/**
 * Pull an address out of whatever was pasted or scanned, or `null` if there
 * isn't one.
 *
 * The twin of `groupIdFrom`, and forgiving for the same reasons: an address
 * arrives inside a link, wrapped across two lines by a chat app, spaced into
 * blocks or not spaced at all, lowercased by something that took it for prose.
 * Whitespace goes first, so the match runs against the 36 characters that
 * carry the meaning.
 *
 * The checksum is what makes looking anywhere in the text safe rather than a
 * guess: base32 runs long enough to pass for an address do turn up in ids and
 * hashes, and the mod-97 check turns away 96 of every 97 that would.
 */
export function addressFrom(text: string): string | null {
  const found = compact(text).toUpperCase().match(ADDRESS)
  if (!found) return null
  // Canonical rather than as-matched: mod-97 leaves two spellings of the same
  // address valid — `NQ00…` alongside the `NQ97…` everything else shows —
  // and the app keys names, pins and threads by the string. One address
  // arriving under two keys would be one person appearing as two.
  return isValidAddress(found[0]) ? canonical(found[0]) : null
}

/** Encode bytes with Nimiq's base32 alphabet. 20 bytes fills exactly 32 characters. */
function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/**
 * Derive the address of an Ed25519 public key: the first 20 bytes of its
 * Blake2b-256 hash, in the user-friendly form.
 *
 * Mirrors `Address::from_public_key` in knock-relay, and the digest is pinned to
 * the same vectors, so client and relay agree on who a public key belongs to.
 */
export function addressFromPublicKey(publicKey: Uint8Array): string {
  return canonical(`${CCODE}00${encodeBase32(blake2b(publicKey, { dkLen: 32 }).slice(0, 20))}`)
}

/** Decode the user-friendly form back to its 20 raw bytes. */
export function addressToBytes(address: string): Uint8Array {
  const body = compact(address).slice(4)
  const bytes = new Uint8Array(ADDRESS_LEN)

  let bits = 0
  let value = 0
  let out = 0
  for (const char of body) {
    const index = ALPHABET.indexOf(char)
    if (index < 0) throw new Error("not a Nimiq address")
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes[out++] = (value >>> (bits - 8)) & 0xff
      bits -= 8
    }
  }
  if (out !== ADDRESS_LEN) throw new Error("not a Nimiq address")
  return bytes
}
