/**
 * Device keys and peer key lookup.
 *
 * This device holds an X25519 keypair whose private half never leaves it. The
 * wallet vouches for the public half by signing it — and that vouching is
 * folded into sign-in, so certifying a key costs no extra confirmation dialog.
 *
 * To write to someone you need their certificate. It is **verified here**, not
 * trusted from the relay: the whole point of end-to-end encryption is that the
 * relay is not part of the trust boundary.
 */

import { t } from "i18next"
import { addressFromPublicKey, compact, formatAddress } from "./address"
import { conversationKey, fromHex, generateKeyPair, publicKeyFrom, toHex } from "./crypto"
import { request } from "./relay"
import { hexToBytes, verifySignedMessage } from "./signed-message"

/** Certificates as the relay stores them: the signed statement, kept verbatim. */
export type KeyCertificate = {
  address: string
  /** The exact bytes the wallet signed — the sign-in challenge. */
  statement: string
  public_key: string
  signature: string
}

/** Thrown when someone cannot be written to because they have never signed in. */
export class NoKeyError extends Error {
  // A field rather than a constructor parameter property, which
  // `erasableSyntaxOnly` disallows.
  address: string

  constructor(address: string) {
    super(t("errors.noKey"))
    this.name = "NoKeyError"
    this.address = address
  }
}

function deviceKeyStorageKey(scope: string): string {
  return `knock:devicekey:${scope}`
}

/**
 * This device's keypair, generated on first use and kept thereafter.
 *
 * Losing it means losing the ability to read existing conversations, which is
 * the accepted cost of holding the private half nowhere else.
 */
export function deviceKeyPair(scope: string): { secretKey: Uint8Array; publicKey: Uint8Array } {
  try {
    const stored = localStorage.getItem(deviceKeyStorageKey(scope))
    if (stored) {
      const secretKey = fromHex(stored)
      if (secretKey.length === 32) {
        // Re-derived rather than stored, so the two cannot disagree.
        return { secretKey, publicKey: publicKeyFrom(secretKey) }
      }
    }
  } catch {
    // Unreadable or corrupt — mint a fresh one rather than failing to start.
  }

  const pair = generateKeyPair()
  try {
    localStorage.setItem(deviceKeyStorageKey(scope), toHex(pair.secretKey))
  } catch {
    // Private mode: the key works for this session but re-keys on reload.
  }
  return pair
}

/** The line in a signed statement that carries the public key. */
const KEY_PREFIX = "Device public key: "

/**
 * Read the encryption key out of a signed statement.
 *
 * Taken from the signed bytes rather than a field beside them, so a relay
 * cannot serve a statement vouching for one key while claiming another.
 */
export function encryptionKeyOf(statement: string): string | null {
  for (const line of statement.split("\n")) {
    if (!line.startsWith(KEY_PREFIX)) continue
    const value = line.slice(KEY_PREFIX.length).trim()
    return /^[0-9a-f]{64}$/i.test(value) ? value : null
  }
  return null
}

/**
 * Check a certificate really binds its address to its key, and return the key.
 *
 * Three things must hold: the statement carries a well-formed key, the
 * signature covers that statement, and the signing key derives to the address
 * being claimed. Any of them failing means someone is trying to read your mail.
 */
export function verifyCertificate(certificate: KeyCertificate): string | null {
  const key = encryptionKeyOf(certificate.statement)
  if (!key) return null

  if (!verifySignedMessage(certificate.statement, certificate.signature, certificate.public_key)) {
    return null
  }

  try {
    const signer = addressFromPublicKey(hexToBytes(certificate.public_key))
    if (compact(signer) !== compact(certificate.address)) return null
  } catch {
    return null
  }
  return key
}

/** Verified peer keys, so a thread does not re-fetch on every poll. */
const peerKeys = new Map<string, Uint8Array>()

/** Forget cached keys — used when the signed-in identity changes. */
export function clearPeerKeys(): void {
  peerKeys.clear()
}

/**
 * Forget one peer's key, so the next use fetches a fresh certificate.
 *
 * A cached key is right until the peer signs in on another device, and there
 * is no notification when they do — this is how the cache is told it might be
 * out of date. Cheap: the next send re-fetches once and caches again.
 */
export function forgetPeerKey(peer: string): void {
  peerKeys.delete(compact(peer))
}

/** Whether the key the relay hands out for you is the one this device holds. */
export type KeyStanding =
  /** The relay is vouching for this device. */
  | "matches"
  /** The relay is vouching for some other key — nobody can write to you. */
  | "stale"
  /** Could not be established; the relay is unreachable or refused. */
  | "unknown"

/**
 * Check that the key others will encrypt to is the one this device can open.
 *
 * These come apart more easily than they look. The key is published only as
 * part of signing in, and a cached session is reused for weeks without
 * republishing — so a device that mints a fresh key (storage cleared, a corrupt
 * value, a different origin) while its token is still valid will never
 * announce it. Everything sent to you then arrives sealed to a key you do not
 * have, and nothing in the app notices.
 *
 * "unknown" is deliberately distinct from "stale": a relay that cannot be
 * reached must not cost somebody their session.
 */
export async function checkRegisteredKey(
  address: string,
  publicKey: Uint8Array,
): Promise<KeyStanding> {
  let certificate: KeyCertificate
  try {
    certificate = await request<KeyCertificate>(
      `/v1/keys/${encodeURIComponent(formatAddress(address))}`,
    )
  } catch (error) {
    // Nothing registered at all — signing in is what publishes it.
    if (error instanceof Error && "status" in error && error.status === 404) return "stale"
    return "unknown"
  }

  const registered = verifyCertificate(certificate)
  if (!registered) return "stale"
  return registered.toLowerCase() === toHex(publicKey).toLowerCase() ? "matches" : "stale"
}

/**
 * Whether anybody could be written to at this address.
 *
 * A knock is paid for on chain and then sealed to the recipient's key. Somebody
 * who has never opened Knock has published none, so there is nothing to seal to
 * and no way for them to answer — asked here so a screen can say that while
 * somebody is deciding, rather than after they have pressed the button. The
 * payment is safe either way: [`keyForPeer`] runs before the transaction does.
 *
 * A relay that cannot be reached answers `true`. Refusing to let somebody knock
 * because their connection wobbled is worse than letting the attempt fail.
 */
export async function canBeReached(peer: string): Promise<boolean> {
  try {
    await request<KeyCertificate>(`/v1/keys/${encodeURIComponent(formatAddress(peer))}`)
    return true
  } catch (error) {
    return !(error instanceof Error && "status" in error && error.status === 404)
  }
}

/**
 * The conversation key for talking to `peer`, fetching and verifying their
 * certificate if this device has not seen it yet.
 *
 * Throws [`NoKeyError`] when the peer has never signed in, because there is
 * genuinely nothing to encrypt to — an unavoidable consequence of end-to-end
 * encryption, not a bug to work around.
 */
export async function keyForPeer(
  peer: string,
  mySecretKey: Uint8Array,
): Promise<Uint8Array> {
  const cacheKey = compact(peer)
  const cached = peerKeys.get(cacheKey)
  if (cached) return conversationKey(mySecretKey, cached)

  let certificate: KeyCertificate
  try {
    certificate = await request<KeyCertificate>(
      `/v1/keys/${encodeURIComponent(formatAddress(peer))}`,
    )
  } catch (error) {
    if (error instanceof Error && "status" in error && error.status === 404) {
      throw new NoKeyError(peer)
    }
    throw error
  }

  const key = verifyCertificate(certificate)
  if (!key) {
    throw new Error(t("errors.badKey"))
  }

  const bytes = fromHex(key)
  peerKeys.set(cacheKey, bytes)
  return conversationKey(mySecretKey, bytes)
}
