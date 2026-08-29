import { useCallback, useEffect, useRef, useState } from "react"

import { encryptBody } from "@/lib/crypto"
import { keyForPeer } from "@/lib/keys"
import { remember } from "@/lib/names"
import { commitment, newNonce } from "@/lib/postage"
import { all, drop, keep, outstanding, postageStep, type Receipt } from "@/lib/receipts"
import { toHex } from "@/lib/crypto"
import {
  RelayError,
  acceptKnock,
  declineKnock,
  getReachability,
  listKnocks,
  sendKnock,
  type Knock,
  type Reachability,
} from "@/lib/relay"
import type { Payer, Wallet } from "@/lib/wallet"

/** How often to look for new knocks. Slower than messages; they are rarer. */
const POLL_INTERVAL_MS = 15_000

/**
 * How long to wait between attempts to redeem a payment, per attempt.
 *
 * The wallet returns as soon as a transaction is broadcast, so the relay is
 * usually asked to verify it a moment before it is in a block. Albatross
 * finalises in about a second, so the first retry almost always carries it —
 * the rest is headroom for a busy mempool.
 */
const REDEEM_BACKOFF_MS = [0, 1_000, 2_000, 4_000, 8_000]

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Knocks waiting for an answer, and the act of knocking.
 *
 * Knocking is the one paid step in the product: pay on-chain, then hand the
 * relay the nonce that redeems the payment. Everything after an accepted knock
 * is free, which is why this is separate from ordinary sending.
 */
/**
 * Pay postage, on the condition that `ready` succeeds first.
 *
 * Exported for its own test. What it promises — that nothing is spent until
 * `ready` has succeeded — is the one thing here that costs real money to get
 * wrong, and it is not observable from outside the hook.
 *
 * The nonce is minted here and travels back out with the hash, because the two
 * are only useful together: the commitment on chain is over this nonce, and
 * revealing it is what redeems the payment. Mint a second one and the first
 * payment is unredeemable by anybody, for good.
 */
export function startPostage(
  pay: Payer,
  ready: Promise<unknown>,
  owner: string,
  peer: string,
  luna: number,
): Promise<{ txHash: string; nonce: string }> {
  const nonce = newNonce()
  const paid = pay(
    ready.then(() => ({ recipient: peer, luna, data: commitment(owner, nonce) })),
  )
  const postage = paid.then((txHash) => ({ txHash, nonce: toHex(nonce) }))
  // When `ready` is what failed, the caller throws from awaiting it instead and
  // never awaits this. Observed here so a peer with no key is not also an
  // unhandled rejection; the `await` further on still sees it.
  void postage.catch(() => {})
  return postage
}

export function useKnocks(
  wallet: Wallet | null,
  owner: string | null,
  /**
   * Told when a payment made earlier finally opened a door.
   *
   * The sender's own history is kept by the caller, so a knock the sweep
   * finishes has to be handed back or it would go out with no record of it
   * here at all.
   */
  onRedeemed?: (receipt: Receipt, knock: Knock) => void,
) {
  const signedIn = owner !== null
  const [knocks, setKnocks] = useState<Knock[]>([])
  // Your own knocks, still unanswered. Nobody tells the sender when a door
  // opens or stays shut, so without asking, a knock you paid for leaves no
  // trace outside the thread it was sent from.
  const [sent, setSent] = useState<Knock[]>([])
  // Held in a ref so a caller that re-creates the handler each render does not
  // restart the sweep effect on every render.
  const redeemed = useRef(onRedeemed)
  redeemed.current = onRedeemed
  const sweeping = useRef(false)

  const refresh = useCallback(async () => {
    if (!signedIn) return
    try {
      const { knocks, sent, names } = await listKnocks()
      remember(names)
      setKnocks(knocks)
      setSent(sent ?? [])
    } catch {
      // A failed poll is not worth surfacing; the next one will try again.
    }
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) {
      setKnocks([])
      setSent([])
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
   * Hand the relay a payment until it takes it.
   *
   * A 402 straight after paying means "not on chain yet", not "no such
   * payment" — the wallet returned before the transaction was in a block. So
   * it is worth asking again rather than reporting a failure over money that
   * has already left. The receipt survives either way; only success drops it.
   */
  const redeem = useCallback(
    async (peer: string, receipt: Receipt): Promise<Knock> => {
      if (!owner) throw new Error("not signed in")
      let last: unknown

      for (const delay of REDEEM_BACKOFF_MS) {
        if (delay > 0) await wait(delay)
        try {
          const sent = await sendKnock(peer, receipt.sealed, {
            tx_hash: receipt.txHash,
            nonce: receipt.nonce,
          })
          drop(owner, peer)
          return sent
        } catch (error) {
          last = error
          if (error instanceof RelayError && error.status === 409) {
            // A knock for this pair is already there — an earlier attempt
            // landed and its answer was lost, or the door has since opened.
            // The relay rolls that insert back, so the payment is still
            // unspent and the receipt is kept; asking again cannot help while
            // something is pending. It clears when the knock is answered, or
            // when the receipt expires.
            throw new Error("You already have a knock waiting for them.")
          }
          // Anything else that is not about the payment will not improve by
          // asking again — a shut door, a bad session, no network.
          if (!(error instanceof RelayError) || error.status !== 402) throw error
        }
      }

      throw new Error(
        last instanceof Error && !(last instanceof RelayError)
          ? last.message
          : "Your payment hasn't confirmed yet. It's safe — knock again in a moment and it'll be used.",
      )
    },
    [owner],
  )

  /**
   * Pay if required, then knock.
   *
   * The payment happens first and deliberately: if the knock is rejected the
   * NIM is already gone, so the relay's rules are checked against
   * `reachability` before a wallet dialog is ever raised.
   *
   * Which is exactly why a payment already made is reused rather than repeated.
   * The commitment binds a nonce that exists only here; pay twice and the first
   * payment becomes unredeemable by anybody, forever.
   */
  const knock = useCallback(
    async (peer: string, body: string, policyLuna: number, deviceSecretKey: Uint8Array) => {
      if (!wallet || !owner) throw new Error("not signed in")

      const next = postageStep(owner, peer, policyLuna)

      // Two things start here, and the order between them is the point.
      //
      // The key lookup is a round trip, and postage must not be paid unless it
      // succeeds — a message that cannot be encrypted is one that cannot be
      // sent, and paying for it would strand the money. So the payment is
      // handed the lookup as its condition rather than being written after it:
      // Nimiq Pay raises no dialog until the lookup lands, exactly as when this
      // was two statements, and the Hub — which must open its window while the
      // tap is still in hand — opens one that closes again with nothing done.
      const keyed = keyForPeer(peer, deviceSecretKey)
      const postage =
        next.step === "pay" && wallet.pay
          ? startPostage(wallet.pay, keyed, owner, peer, policyLuna)
          : null

      const key = await keyed
      const sealed = encryptBody(body, key, owner, peer)

      // Paid for already — on an earlier attempt, or before the app was killed.
      //
      // What gets sent is what they have just written, not what they wrote the
      // first time. The commitment is over the sender and the nonce, never the
      // body, so the message is free to change; replaying the old one would
      // silently discard whatever they typed on the way back.
      if (next.step === "reuse") {
        const revised: Receipt = { ...next.receipt, sealed, body }
        // Stored before sending, so the sweep carries the newer words too if
        // this attempt is also too early.
        keep(owner, revised)
        return redeem(peer, revised)
      }

      if (next.step === "free") {
        return sendKnock(peer, sealed, null)
      }

      // Nothing to pay with. Only reachable once the two branches above have
      // returned, so this is the paying step and the wallet is what is missing.
      if (!postage) {
        throw new Error("Paying to knock needs a wallet that can spend.")
      }

      const { txHash, nonce } = await postage

      // Written down before the relay hears a word about it. Everything after
      // this line can fail; the money cannot be unspent, so the proof has to
      // outlive the failure.
      const receipt: Receipt = {
        peer,
        sealed,
        body,
        txHash,
        nonce,
        at: new Date().toISOString(),
      }
      keep(owner, receipt)

      return redeem(peer, receipt)
    },
    [wallet, owner, redeem],
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

  /**
   * Finish any knock that was paid for but never got through.
   *
   * The guarantee is meant to be "once you have paid, the knock is sent" — not
   * "…if you remember to come back and tap again". A payment can outlive the
   * request that was meant to redeem it by a long way: a congested mempool, a
   * dead battery, an app killed mid-flight. So every time the app comes to the
   * front, whatever is still owed is tried again.
   */
  const sweep = useCallback(async () => {
    if (!owner || sweeping.current) return
    sweeping.current = true
    try {
      for (const receipt of all(owner)) {
        try {
          redeemed.current?.(receipt, await redeem(receipt.peer, receipt))
        } catch {
          // Background work: the receipt is kept and the next time the app is
          // opened it tries again. Nothing here is worth interrupting anyone.
        }
      }
    } finally {
      sweeping.current = false
    }
  }, [owner, redeem])

  useEffect(() => {
    if (!signedIn) return
    void sweep()
    const onVisible = () => {
      if (!document.hidden) void sweep()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [signedIn, sweep])

  /**
   * The payment already made for `peer` and not yet redeemed, if there is one.
   *
   * Returns the whole receipt rather than a yes/no so the compose sheet can put
   * the message back in front of them — they wrote it and paid for it, and
   * making them type it again would be a poor reward for a failure that was
   * never theirs.
   */
  const held = useCallback(
    (peer: string) => (owner ? outstanding(owner, peer) : null),
    [owner],
  )

  return { knocks, sent, reach, knock, accept, decline, refresh, held }
}
