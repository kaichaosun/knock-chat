import { useCallback, useEffect, useState } from "react"

import { encryptBody } from "@/lib/crypto"
import { keyForPeer } from "@/lib/keys"
import { remember } from "@/lib/names"
import { unwrapTransaction } from "@/lib/payments"
import { commitment, newNonce } from "@/lib/postage"
import { toHex } from "@/lib/crypto"
import {
  acceptKnock,
  declineKnock,
  getReachability,
  listKnocks,
  sendKnock,
  type Knock,
  type Reachability,
} from "@/lib/relay"
import type { Wallet } from "@/lib/wallet"

/** How often to look for new knocks. Slower than messages; they are rarer. */
const POLL_INTERVAL_MS = 15_000

/**
 * Knocks waiting for an answer, and the act of knocking.
 *
 * Knocking is the one paid step in the product: pay on-chain, then hand the
 * relay the nonce that redeems the payment. Everything after an accepted knock
 * is free, which is why this is separate from ordinary sending.
 */
export function useKnocks(wallet: Wallet | null, owner: string | null) {
  const signedIn = owner !== null
  const [knocks, setKnocks] = useState<Knock[]>([])

  const refresh = useCallback(async () => {
    if (!signedIn) return
    try {
      const { knocks, names } = await listKnocks()
      remember(names)
      setKnocks(knocks)
    } catch {
      // A failed poll is not worth surfacing; the next one will try again.
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setKnocks([])
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)

    // Reopening the app should show a waiting knock straight away rather than
    // up to a poll interval later.
    const onVisible = () => void refresh()
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [signedIn, refresh])

  /** What it would take to reach `peer` right now. */
  const reach = useCallback(
    (peer: string): Promise<Reachability> => getReachability(peer),
    [],
  )

  /**
   * Pay if required, then knock.
   *
   * The payment happens first and deliberately: if the knock is rejected the
   * NIM is already gone, so the relay's rules are checked against
   * `reachability` before a wallet dialog is ever raised.
   */
  const knock = useCallback(
    async (peer: string, body: string, policyLuna: number, deviceSecretKey: Uint8Array) => {
      if (!wallet || !owner) throw new Error("not signed in")

      const key = await keyForPeer(peer, deviceSecretKey)
      const sealed = encryptBody(body, key, owner, peer)

      if (policyLuna === 0) {
        return sendKnock(peer, sealed, null)
      }

      if (!wallet.provider) {
        throw new Error("Paying to knock needs Nimiq Pay. Open the app there to continue.")
      }

      const nonce = newNonce()
      const result = unwrapTransaction(
        await wallet.provider.sendBasicTransactionWithData({
          recipient: peer,
          value: policyLuna,
          data: commitment(owner, nonce),
        }),
      )

      // The hash is the serialized transaction's identity; the relay looks it
      // up on chain before storing anything.
      return sendKnock(peer, sealed, { tx_hash: result, nonce: toHex(nonce) })
    },
    [wallet, owner],
  )

  const accept = useCallback(
    async (id: string) => {
      await acceptKnock(id)
      await refresh()
    },
    [refresh],
  )

  const decline = useCallback(
    async (id: string) => {
      await declineKnock(id)
      await refresh()
    },
    [refresh],
  )

  return { knocks, reach, knock, accept, decline, refresh }
}
