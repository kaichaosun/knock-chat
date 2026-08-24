/**
 * Postage that has been paid but not yet redeemed.
 *
 * A knock is two acts with a gap between them: a payment on chain, and then a
 * request to the relay that redeems it. The gap is where money gets lost. The
 * wallet returns the moment a transaction is broadcast, so the relay usually
 * looks for it a second before it is in a block and refuses the knock for being
 * early — and at that point the payment has already happened.
 *
 * Without somewhere to put the proof, the obvious recovery — tap Knock again —
 * mints a fresh nonce and pays a second time. The first payment is then
 * unredeemable by anyone: the commitment binds a nonce that no longer exists,
 * so nothing on earth can point a knock at it again.
 *
 * So the proof is written down the instant the payment returns, before the
 * relay is told anything at all. If the request fails, the sheet is closed, or
 * the phone dies, the next attempt finds it and redeems it instead of paying.
 */

import { compact } from "./address"

/** Proof of a payment that has not yet opened a door. */
export type Receipt = {
  /** Who it was for, compact. One outstanding payment per peer, as the relay
   *  allows one pending knock per pair. */
  peer: string
  /** The knock's body, sealed to them. What gets sent when this is redeemed. */
  sealed: string
  /**
   * The same body in plain text, for this device's own record of it.
   *
   * A knock redeemed later — by the background sweep, after a restart — still
   * has to appear in the sender's history, and the sealed copy is encrypted to
   * the recipient. No worse than the rest: local message history is plain text
   * in this storage already.
   */
  body: string
  /** Whatever the wallet handed back for the transaction. */
  txHash: string
  /** Hex. The secret half of the commitment; revealing it is what redeems. */
  nonce: string
  at: string
}

/**
 * How long a receipt is worth retrying.
 *
 * Long enough to survive a flight, a dead battery and a night asleep; short
 * enough that a payment which was wrong to begin with — too little, sent to the
 * wrong address — stops blocking that peer forever. Nothing is refunded when it
 * expires; there was never anything to refund.
 */
const LIFETIME_MS = 24 * 60 * 60 * 1000

function storageKey(owner: string): string {
  return `knock:postage:${compact(owner)}`
}

function load(owner: string): Receipt[] {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    const fresh = Date.now() - LIFETIME_MS
    return parsed.filter(
      (entry: Partial<Receipt>): entry is Receipt =>
        typeof entry?.peer === "string" &&
        typeof entry.sealed === "string" &&
        typeof entry.body === "string" &&
        typeof entry.txHash === "string" &&
        typeof entry.nonce === "string" &&
        typeof entry.at === "string" &&
        Date.parse(entry.at) > fresh,
    )
  } catch {
    return []
  }
}

function save(owner: string, receipts: Receipt[]): void {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(receipts))
  } catch {
    // Quota or private mode. Nothing else can be done here — the caller has
    // already paid, and refusing to continue would not unspend it.
  }
}

/** Everything paid for and still unredeemed. */
export function all(owner: string): Receipt[] {
  return load(owner)
}

/** The outstanding payment for `peer`, if there is one. */
export function outstanding(owner: string, peer: string): Receipt | null {
  const key = compact(peer)
  return load(owner).find((receipt) => receipt.peer === key) ?? null
}

/**
 * Write a payment down. Replaces any earlier one for the same peer.
 *
 * Called before the relay is contacted, deliberately: this is the record of
 * money that has already left, and it has to survive whatever happens next.
 */
export function keep(owner: string, receipt: Omit<Receipt, "at">): void {
  const rest = load(owner).filter((held) => held.peer !== compact(receipt.peer))
  save(owner, [
    ...rest,
    { ...receipt, peer: compact(receipt.peer), at: new Date().toISOString() },
  ])
}

/** Forget a payment, once it has actually opened a door. */
export function drop(owner: string, peer: string): void {
  const key = compact(peer)
  const rest = load(owner).filter((receipt) => receipt.peer !== key)
  save(owner, rest)
}

/** What a knock has to do about money before it can be sent. */
export type PostageStep =
  | { step: "reuse"; receipt: Receipt }
  | { step: "free" }
  | { step: "pay" }

/**
 * Decide whether to pay, reuse a payment, or neither.
 *
 * Named and separated from the sending so the one rule that matters can be
 * stated once and tested: **an outstanding payment is always used, and nothing
 * pays while one exists.** Paying twice makes the first payment unredeemable by
 * anybody, because the commitment binds a nonce that only this device ever had.
 *
 * An outstanding receipt wins even when the door has since become free. The
 * relay ignores postage it is not asking for, so sending the proof costs
 * nothing and clears it; skipping it would strand money for no gain.
 */
export function postageStep(owner: string, peer: string, policyLuna: number): PostageStep {
  const held = outstanding(owner, peer)
  if (held) return { step: "reuse", receipt: held }
  return policyLuna === 0 ? { step: "free" } : { step: "pay" }
}
