/**
 * Moving NIM from inside a conversation.
 *
 * The wallet does the moving; this only frames the request and makes sense of
 * what comes back. There is no relay involved and nothing to verify — a
 * transfer is between two wallets and the chain, and the message that follows
 * it is a note about something that already happened.
 */

import type { NimiqProvider } from "@nimiq/mini-app-sdk"

import { LUNA_PER_NIM } from "./relay"

/** Luna are indivisible, so five decimal places is the whole of NIM. */
export const NIM_DECIMALS = 5

/**
 * What the provider returns on success, or the error it returns instead.
 *
 * Every `send*Transaction` method resolves rather than rejects when the wallet
 * refuses, so the error arrives as a value and would otherwise be handled as a
 * successful result — a rejected payment recorded as a completed one.
 */
export function unwrapTransaction(result: unknown): string {
  if (typeof result === "object" && result !== null && "error" in result) {
    const { error } = result as { error: { message?: string } }
    throw new Error(error.message ?? "The wallet refused the transaction")
  }
  return String(result)
}

/** Whether an amount typed as NIM can be paid exactly. */
export function parseNim(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === "") return null
  const nim = Number(trimmed)
  if (!Number.isFinite(nim) || nim <= 0) return null

  // Rounding a payment to something the user did not type is not an option, so
  // an amount finer than a luna is refused rather than adjusted.
  const luna = nim * LUNA_PER_NIM
  if (!Number.isSafeInteger(Math.round(luna)) || Math.abs(luna - Math.round(luna)) > 1e-6) {
    return null
  }
  return Math.round(luna)
}

/**
 * Send NIM to an address, returning whatever reference the wallet gives back.
 *
 * No postage commitment and no data: this is an ordinary transfer that happens
 * to have been started from a chat. A knock is the other thing — it carries a
 * commitment because the relay has to tie the payment to a message it has not
 * seen yet, which is not a problem a plain transfer has.
 */
export async function sendNim(
  provider: NimiqProvider,
  recipient: string,
  luna: number,
): Promise<string> {
  return unwrapTransaction(
    await provider.sendBasicTransaction({ recipient, value: luna }),
  )
}
