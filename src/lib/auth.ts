/**
 * Signing in to the relay.
 *
 * The relay hands out a challenge, the wallet signs it, and the relay derives
 * the address from the key that signed — so an address is proven, never
 * claimed. The resulting token is cached per address, because every sign-in
 * costs a wallet confirmation the user has to tap.
 */

import { request, setAuthToken } from "./relay"
import type { Signer } from "./wallet"

export type Session = {
  token: string
  address: string
  expiresAt: string
}

type ChallengeResponse = { nonce: string; message: string; expires_at: string }
type VerifyResponse = { token: string; address: string; expires_at: string }

/** Re-authenticate this long before expiry rather than failing mid-session. */
const RENEW_MARGIN_MS = 24 * 60 * 60 * 1000

/** Sessions are keyed by wallet scope, since the address is not known until one exists. */
function storageKey(scope: string): string {
  return `knock:session:${scope}`
}

/** A cached session for `scope`, if one is stored and still comfortably valid. */
export function loadSession(scope: string): Session | null {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    if (!session.token || !session.expiresAt) return null
    if (Date.parse(session.expiresAt) - Date.now() < RENEW_MARGIN_MS) return null
    return session
  } catch {
    return null
  }
}

export function saveSession(scope: string, session: Session): void {
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(session))
  } catch {
    // Private mode or quota — the session still works for this page load.
  }
}

export function clearSession(scope: string): void {
  try {
    localStorage.removeItem(storageKey(scope))
  } catch {
    // Nothing to do; the token simply won't be reused.
  }
  setAuthToken(null)
}

/**
 * Run the full challenge/sign/verify exchange. Prompts the user inside Nimiq Pay.
 *
 * The address comes back from the relay, derived from the public key that
 * signed — so this call is what establishes identity, not just what proves it.
 */
export async function signIn(scope: string, sign: Signer): Promise<Session> {
  const challenge = await request<ChallengeResponse>("/v1/auth/challenge", { method: "POST" })
  const { publicKey, signature } = await sign(challenge.message)

  const verified = await request<VerifyResponse>("/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify({ nonce: challenge.nonce, public_key: publicKey, signature }),
  })

  const session: Session = {
    token: verified.token,
    address: verified.address,
    expiresAt: verified.expires_at,
  }
  saveSession(scope, session)
  setAuthToken(session.token)
  return session
}
