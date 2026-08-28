import { useCallback, useEffect, useRef, useState } from "react"

import { clearSession, loadSession, signIn, type Session } from "@/lib/auth"
import { checkRegisteredKey, deviceKeyPair } from "@/lib/keys"
import { setAuthToken } from "@/lib/relay"
import type { Wallet } from "@/lib/wallet"

export type SessionState =
  | { status: "restoring" }
  /** No usable token. The user must tap to sign in, so the wallet prompt is expected. */
  | { status: "needed" }
  /** Fetching the challenge. The wallet has not been asked yet, so nothing covers the screen. */
  | { status: "preparing" }
  | { status: "signing" }
  | { status: "active"; session: Session }
  | { status: "error"; message: string }

/**
 * Holds the relay session for `wallet`.
 *
 * A cached token is restored silently; otherwise the user taps to sign in. We
 * never prompt automatically on load — a wallet confirmation appearing
 * unbidden is alarming, and the token lasts thirty days.
 */
export function useSession(wallet: Wallet | null) {
  const [state, setState] = useState<SessionState>({ status: "restoring" })

  useEffect(() => {
    if (!wallet) {
      setAuthToken(null)
      setState({ status: "restoring" })
      return
    }

    const cached = loadSession(wallet.scope)
    if (!cached) {
      setAuthToken(null)
      setState({ status: "needed" })
      return
    }

    setAuthToken(cached.token)
    setState({ status: "active", session: cached })

    // A valid token is not proof that the relay still vouches for this
    // device's key. The two are published together and then drift apart in
    // silence — see `checkRegisteredKey`. Asking costs one request per start,
    // and the alternative is unreadable mail with nothing to explain it.
    let dropped = false
    void (async () => {
      const standing = await checkRegisteredKey(
        cached.address,
        deviceKeyPair(wallet.scope).publicKey,
      )
      // Only a definite mismatch acts. An unreachable relay says nothing, and
      // signing somebody out over a flaky network would be worse than the bug.
      if (dropped || standing !== "stale") return
      clearSession(wallet.scope)
      setAuthToken(null)
      setState({ status: "needed" })
    })()

    return () => {
      dropped = true
    }
  }, [wallet])

  /**
   * Whether a tap is still waiting on the relay rather than on the wallet.
   *
   * A ref rather than the state above because the guard has to hold within a
   * single tick: two taps in quick succession both read the state React last
   * rendered, and both would pass.
   */
  const awaitingChallenge = useRef(false)

  const authenticate = useCallback(async () => {
    // Between the tap and the wallet's sheet sits a round trip to the relay,
    // and for that second nothing about the screen has changed. Tapping again
    // there would fetch a second challenge and ask the wallet twice.
    //
    // The latch lifts when the wallet is asked, not when signing ends: on iOS a
    // sheet dismissed by tapping outside settles nothing at all — see the note
    // on the button — and a latch held to the end would never lift for somebody
    // who changed their mind.
    if (!wallet || awaitingChallenge.current) return
    awaitingChallenge.current = true
    setState({ status: "preparing" })
    try {
      const session = await signIn(wallet.scope, wallet.sign, () => {
        awaitingChallenge.current = false
        setState({ status: "signing" })
      })
      setState({ status: "active", session })
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Sign-in failed.",
      })
    } finally {
      awaitingChallenge.current = false
    }
  }, [wallet])

  /**
   * Drop the session: the relay rejected the token, or the user asked to leave.
   *
   * The stored token goes and so does the one every request carries — those are
   * two different places, and clearing only the first left the app signed out
   * on screen and signed in on the wire until the next reload.
   *
   * Nothing else on the device is touched. History, the names you have given
   * people, and this device's own keypair all outlive a sign-out, so signing
   * back in is a signature rather than a fresh start.
   */
  const invalidate = useCallback(() => {
    awaitingChallenge.current = false
    if (wallet) clearSession(wallet.scope)
    setAuthToken(null)
    setState({ status: "needed" })
  }, [wallet])

  return { state, authenticate, invalidate }
}
