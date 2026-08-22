import { useCallback, useEffect, useState } from "react"

import { clearSession, loadSession, signIn, type Session } from "@/lib/auth"
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

    const cached = loadSession(wallet.address)
    if (cached) {
      setAuthToken(cached.token)
      setState({ status: "active", session: cached })
    } else {
      setAuthToken(null)
      setState({ status: "needed" })
    }
  }, [wallet])

  const authenticate = useCallback(async () => {
    if (!wallet) return
    setState({ status: "signing" })
    try {
      setState({ status: "active", session: await signIn(wallet.address, wallet.sign) })
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Sign-in failed.",
      })
    }
  }, [wallet])

  /** Drop the session — used when the relay rejects the token as stale. */
  const invalidate = useCallback(() => {
    if (wallet) clearSession(wallet.address)
    setState({ status: "needed" })
  }, [wallet])

  return { state, authenticate, invalidate }
}
