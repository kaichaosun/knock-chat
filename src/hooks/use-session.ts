import { useCallback, useEffect, useState } from "react"

import { clearSession, loadSession, signIn, type Session } from "@/lib/auth"
import { checkRegisteredKey, deviceKeyPair } from "@/lib/keys"
import { setAuthToken } from "@/lib/relay"
import type { Wallet } from "@/lib/wallet"

export type SessionState =
  | { status: "restoring" }
  /** No usable token. The user must tap to sign in, so the wallet prompt is expected. */
  | { status: "needed" }
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

  const authenticate = useCallback(async () => {
    if (!wallet) return
    setState({ status: "signing" })
    try {
      setState({ status: "active", session: await signIn(wallet.scope, wallet.sign) })
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Sign-in failed.",
      })
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
    if (wallet) clearSession(wallet.scope)
    setAuthToken(null)
    setState({ status: "needed" })
  }, [wallet])

  return { state, authenticate, invalidate }
}
