/**
 * Gift funding that has been paid but not yet placed.
 *
 * The same gap knocks have, for more money. A gift is funded first and created
 * second, because the relay will not hold a pot it has not seen paid for — so
 * between the wallet returning and the relay accepting, the NIM has left and
 * nothing yet points at it.
 *
 * And as with a knock, the obvious recovery is the destructive one. The relay
 * matches the funding by `commitment(owner, nonce)`, so paying again mints a
 * fresh nonce and abandons the first payment for good: the proof that would
 * redeem it is a secret only this device ever held. Written down before the
 * relay is told anything, the payment stays redeemable through a failed
 * request, a closed sheet, or a phone that dies mid-flight.
 */

import { compact } from "./address"

/** Proof of funding that has not yet become a gift. */
export type GiftReceipt = {
  /** The room the pot was meant for. */
  group: string
  total_luna: number
  shares: number
  split: "even" | "random"
  note: string
  /** What the wallet handed back for the funding transaction. */
  txHash: string
  /** Hex. The secret half of the commitment; revealing it is what redeems. */
  nonce: string
  at: string
}

/**
 * How long funding is worth retrying.
 *
 * Longer than a knock's day, because there is real money in it and the relay
 * puts no deadline on the payment — a transaction stays verifiable on chain
 * indefinitely, so the only reason to stop is to keep this from growing without
 * bound. A receipt that does expire has not lost anything the sweep could have
 * recovered by then anyway.
 */
const LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

function storageKey(owner: string): string {
  return `knock:giftpostage:${compact(owner)}`
}

function load(owner: string): GiftReceipt[] {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    const fresh = Date.now() - LIFETIME_MS
    return parsed.filter(
      (entry: Partial<GiftReceipt>): entry is GiftReceipt =>
        typeof entry?.group === "string" &&
        typeof entry.total_luna === "number" &&
        typeof entry.shares === "number" &&
        (entry.split === "even" || entry.split === "random") &&
        typeof entry.note === "string" &&
        typeof entry.txHash === "string" &&
        typeof entry.nonce === "string" &&
        typeof entry.at === "string" &&
        Date.parse(entry.at) > fresh,
    )
  } catch {
    return []
  }
}

function save(owner: string, receipts: GiftReceipt[]): void {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(receipts))
  } catch {
    // Quota or private mode. Nothing to be done — the caller has already paid,
    // and refusing to continue would not unspend it.
  }
}

/** Everything funded and not yet placed. */
export function all(owner: string): GiftReceipt[] {
  return load(owner)
}

/** What is owed for one room, if anything. */
export function outstandingFor(owner: string, group: string): GiftReceipt | null {
  return load(owner).find((receipt) => receipt.group === group) ?? null
}

/**
 * Write funding down.
 *
 * Called before the relay is contacted, deliberately: this is the record of
 * money that has already left, and it has to survive whatever happens next.
 * Keyed by transaction, so two gifts funded in the same room are both kept —
 * each payment is separately redeemable and dropping either would strand it.
 */
export function keep(owner: string, receipt: Omit<GiftReceipt, "at">): void {
  const rest = load(owner).filter((held) => held.txHash !== receipt.txHash)
  save(owner, [...rest, { ...receipt, at: new Date().toISOString() }])
}

/** Forget funding, once it has actually become a gift. */
export function drop(owner: string, txHash: string): void {
  save(
    owner,
    load(owner).filter((receipt) => receipt.txHash !== txHash),
  )
}
