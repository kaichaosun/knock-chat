import { useCallback, useEffect, useState } from "react"

import { remember } from "@/lib/names"
import { commitment, newNonce } from "@/lib/postage"
import { toHex } from "@/lib/crypto"
import {
  createGroup,
  getGroup,
  joinGroup,
  listGroups,
  sayInGroup,
  type Group,
  type GroupDetail,
  type JoinResult,
} from "@/lib/relay"
import type { Wallet } from "@/lib/wallet"

/** How often to re-read the rooms you are in. Rarer than messages. */
const POLL_INTERVAL_MS = 30_000

/**
 * The rooms you are in, and getting into new ones.
 *
 * A room is a lobby rather than a shortcut: being in one with somebody opens no
 * channel with them, so writing to them privately still costs their postage.
 * That is enforced by the relay; this hook only has to avoid implying otherwise.
 */
export function useGroups(wallet: Wallet | null, owner: string | null) {
  const signedIn = owner !== null
  const [groups, setGroups] = useState<Group[]>([])
  // How many are waiting at the door of each room you own. Empty for everybody
  // else, and empty is also what it means for a room nobody is waiting at.
  const [waiting, setWaiting] = useState<Record<string, number>>({})
  // True until the first read lands, so an empty list can be told apart from
  // one that has not arrived — otherwise a slow start reads as "no groups".
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    try {
      const list = await listGroups()
      setGroups(list.groups)
      setWaiting(list.waiting ?? {})
    } catch {
      // A failed poll is not worth surfacing; the next one will try again.
    } finally {
      setLoading(false)
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setGroups([])
      setWaiting({})
      setLoading(true)
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    const onVisible = () => void refresh()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [signedIn, refresh])

  /** What a link leads to: the room's name and price, before deciding to join. */
  const inspect = useCallback(async (id: string): Promise<GroupDetail> => {
    const detail = await getGroup(id)
    remember(detail.names)
    return detail
  }, [])

  const create = useCallback(
    async (input: { name: string; join_price_luna: number; requires_approval: boolean }) => {
      const group = await createGroup(input)
      await refresh()
      return group
    },
    [refresh],
  )

  /**
   * Get in, paying the owner first if the door asks for it.
   *
   * The payment happens before the request and deliberately so: the relay
   * verifies it before recording anything, and a request the owner declines
   * keeps the NIM — which is what makes asking cost something. The rules are
   * checked against the room's price before any wallet dialog is raised.
   */
  const join = useCallback(
    async (group: Group): Promise<JoinResult> => {
      if (!owner) throw new Error("not signed in")

      if (group.join_price_luna === 0) {
        const result = await joinGroup(group.id, null)
        await refresh()
        return result
      }

      if (!wallet?.provider) {
        throw new Error("Paying to join needs Nimiq Pay. Open the app there to continue.")
      }

      const nonce = newNonce()
      const paid = await wallet.provider.sendBasicTransactionWithData({
        recipient: group.owner,
        value: group.join_price_luna,
        data: commitment(owner, nonce),
      })
      if (typeof paid === "object" && paid !== null && "error" in paid) {
        throw new Error(paid.error.message)
      }

      const result = await joinGroup(group.id, {
        tx_hash: String(paid),
        nonce: toHex(nonce),
      })
      await refresh()
      return result
    },
    [wallet, owner, refresh],
  )

  const say = useCallback((id: string, body: string) => sayInGroup(id, body), [])

  return { groups, waiting, loading, refresh, inspect, create, join, say }
}
