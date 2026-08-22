import { useCallback, useEffect, useState } from "react"

import { connect, type ConnectResult, type Wallet } from "@/lib/wallet"

export type WalletState =
  | { status: "connecting" }
  | { status: "connected"; wallet: Wallet }
  | { status: "unavailable"; message: string }

/** Connects once on mount; `retry` re-runs it after a failure. */
export function useWallet() {
  const [state, setState] = useState<WalletState>({ status: "connecting" })

  const attempt = useCallback(() => {
    let cancelled = false
    setState({ status: "connecting" })

    connect()
      .then((result: ConnectResult) => {
        if (cancelled) return
        setState(
          result.ok
            ? { status: "connected", wallet: result.wallet }
            : { status: "unavailable", message: result.message },
        )
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          status: "unavailable",
          message: error instanceof Error ? error.message : "Could not reach the wallet.",
        })
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => attempt(), [attempt])

  return { state, retry: attempt }
}
