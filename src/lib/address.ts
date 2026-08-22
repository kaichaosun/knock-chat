/**
 * Nimiq address helpers.
 *
 * An address is 20 bytes shown IBAN-style: `NQ`, two check digits, then 32
 * base32 characters in groups of four. Validation mirrors the relay's Rust
 * implementation and core-rs-albatross, so a string this module accepts is one
 * the relay will accept too.
 */

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
