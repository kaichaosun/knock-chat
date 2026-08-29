/**
 * Signing in to the relay.
 *
 * The relay hands out a challenge, the wallet signs it, and the relay derives
 * the address from the key that signed — so an address is proven, never
 * claimed. The resulting token is cached per address, because every sign-in
 * costs a wallet confirmation the user has to tap.
 */

import { toHex } from "./crypto"
import { clearPeerKeys, deviceKeyPair } from "./keys"
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

/**
 * Whether a usable session is already stored, for any scope.
 *
 * Answerable before the wallet has been found, which is the point: finding the
 * wallet can take seconds, and for those seconds the app would otherwise show
 * a sign-in screen to somebody who is already signed in. The scope is not
 * known until the wallet resolves — hence the scan rather than a lookup.
 *
 * Only ever used to decide what to show while waiting. Restoring a session
 * still goes through `loadSession` with the real scope.
 */
export function haveStoredSession(): boolean {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (!key?.startsWith("knock:session:")) continue
      if (loadSession(key.slice("knock:session:".length))) return true
    }
  } catch {
    // No storage to read: treat it as signed out, which is what it is.
  }
  return false
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
export async function signIn(
  scope: string,
  sign: Signer,
  /**
   * Called once the relay has answered and the wallet is what is left to wait
   * for. Everything before it is a round trip with nothing on screen to show
   * for it, and that is the part worth reporting on.
   */
  onPrompt?: () => void,
): Promise<Session> {
  // The challenge carries this device's encryption key, so the one signature
  // that proves identity also publishes the key. Two prompts for what is really
  // one act — registering this device — would be one prompt too many.
  const device = deviceKeyPair(scope)

  // Started, not awaited — and then handed to the signer as a promise.
  //
  // The Hub signs in a popup, and a popup is only allowed to open while the
  // click that asked for it is still in hand. Awaiting the challenge here
  // would spend that click on a network round trip and leave the Hub to open
  // its window afterwards, which a browser blocks. Passing the promise means
  // `sign` is called in the same turn as the tap, and the message it needs
  // catches up. See `Signer` in lib/wallet.
  const challenge = request<ChallengeResponse>("/v1/auth/challenge", {
    method: "POST",
    body: JSON.stringify({ encryption_key: toHex(device.publicKey) }),
  })
  const signed = sign(challenge.then((issued) => issued.message))
  // Nothing awaits `signed` if the challenge is what failed — the throw below
  // happens first and the function is gone. Observing the rejection here keeps
  // an unreachable relay from also being an unhandled rejection. The `await`
  // further down still sees it: a handled promise rejects exactly as before.
  void signed.catch(() => {})

  const issued = await challenge
  onPrompt?.()
  const { publicKey, signature } = await signed

  const verified = await request<VerifyResponse>("/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify({ nonce: issued.nonce, public_key: publicKey, signature }),
  })

  const session: Session = {
    token: verified.token,
    address: verified.address,
    expiresAt: verified.expires_at,
  }
  saveSession(scope, session)
  setAuthToken(session.token)
  // Cached peer keys belong to whoever was signed in before.
  clearPeerKeys()
  return session
}
