import { RelayError, createGift, type Gift } from "@/lib/relay"

/**
 * The same ladder a knock climbs, for the same reason: an Albatross block is
 * about a second, but the relay reads the chain through an RPC whose index can
 * lag the wallet's answer by a few of them.
 */
const BACKOFF_MS = [0, 1_000, 2_000, 4_000, 8_000]

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Hand the relay a gift's funding until it takes it.
 *
 * The money leaves the wallet before the gift exists — the relay will not hold
 * anything it has not seen paid — so a refusal here is a refusal *after* the
 * NIM is gone. A 402 in the seconds right after paying almost always means
 * "not on chain yet" rather than "no such payment", and giving up on the first
 * one strands the money at the relay with no gift and no refund attached to it.
 * Knocks already climb this ladder for the same reason; a gift runs the same
 * sequence for a larger amount.
 *
 * So a 402 is retried. Anything else — not a member, shares that cannot be
 * split, a dead session — will not improve by asking again and is raised at
 * once.
 */
export async function fundGift(
  groupId: string,
  input: {
    total_luna: number
    shares: number
    split: "even" | "random"
    note: string
    postage: { tx_hash: string; nonce: string }
  },
): Promise<Gift> {
  let last: unknown

  for (const delay of BACKOFF_MS) {
    if (delay > 0) await wait(delay)
    try {
      return await createGift(groupId, input)
    } catch (error) {
      last = error
      if (!(error instanceof RelayError) || error.status !== 402) throw error
    }
  }

  // Out of attempts, with the payment made. Say so plainly, and say where the
  // money is — the transaction hash is the only handle anyone has on it.
  throw new Error(
    `Your payment hasn't confirmed yet, so the gift wasn't created. ` +
      `The NIM is safe at the relay — transaction ${input.postage.tx_hash.slice(0, 12)}… ` +
      `(${last instanceof Error ? last.message : "no answer"}).`,
  )
}
