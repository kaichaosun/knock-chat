/**
 * What a message actually says, once decrypted.
 *
 * A message used to be a string and mostly still is: ordinary text travels as
 * itself, so every message ever sent, and every client that only knows about
 * text, keeps working untouched. Anything that is not text is wrapped in a
 * frame that begins with a NUL byte — a character no keyboard produces and no
 * honest message contains, which is what makes "this is not text" a decision
 * rather than a guess.
 *
 * The frame carries a version so a later format can be told apart from a
 * corrupt one, and anything unrecognised decodes to `unknown` rather than an
 * error. That is the whole point of decoding it here: when a newer build starts
 * sending images, this one shows "something it can't display" instead of a wall
 * of JSON.
 *
 * ## What a payload is not
 *
 * It is not evidence. The relay authenticates who sent a message, so a payment
 * card genuinely comes from the person it appears to come from — but what it
 * *claims* is theirs to write. Anyone can send a card saying they paid you
 * without having paid you. Nothing in this module verifies a payment against
 * the chain, and no screen built on it should imply otherwise.
 */

import { groupIdFrom } from "./group-link"
import { formatNim } from "./postage"

const FRAME = "\u0000knock1\n"

/** A payment the sender says they made. See the caveat above. */
export type Payment = {
  /** Amount in luna. A positive integer; luna are indivisible. */
  luna: number
  /**
   * Whatever the wallet handed back for the transaction, or `null`.
   *
   * Deliberately not called a hash: the provider documents this as "the
   * serialized transaction", the postage path treats it as a hash, and which is
   * true has not been checked on a real device. Calling it a reference commits
   * to nothing and stays honest whichever it turns out to be.
   */
  reference: string | null
}

/**
 * A room somebody is pointing you at.
 *
 * The name travels with it so the card can be drawn at once, offline, without
 * asking the relay about a room you may not join — but it is the sender's copy
 * of the name, not the room's. What it costs and what it is really called are
 * fetched when the invite is opened, which is the moment that matters.
 */
export type Invite = {
  /** The room's id. Everything else about it is looked up. */
  group: string
  /** What the sender called it. A label, checked against nothing. */
  name: string
}

export type Payload =
  | { kind: "text"; text: string }
  | { kind: "payment"; payment: Payment }
  | { kind: "invite"; invite: Invite }
  /** A frame this build does not understand — a newer client, or damage. */
  | { kind: "unknown" }

export function text(value: string): Payload {
  return { kind: "text", text: value }
}

export function payment(luna: number, reference: string | null): Payload {
  return { kind: "payment", payment: { luna, reference } }
}

export function invite(group: string, name: string): Payload {
  return { kind: "invite", invite: { group, name } }
}

/** Turn a payload into the plaintext that gets encrypted. */
export function encode(payload: Payload): string {
  if (payload.kind === "text") return payload.text
  if (payload.kind === "payment") {
    return FRAME + JSON.stringify({ kind: "payment", ...payload.payment })
  }
  if (payload.kind === "invite") {
    return FRAME + JSON.stringify({ kind: "invite", ...payload.invite })
  }
  // `unknown` is something this build received and could not read. Re-encoding
  // it would mean claiming to have understood it.
  throw new Error("cannot encode an unknown payload")
}

/** Read the plaintext of a message. Never throws; anything odd is `unknown`. */
export function decode(plain: string): Payload {
  if (!plain.startsWith(FRAME)) return { kind: "text", text: plain }

  try {
    const parsed: unknown = JSON.parse(plain.slice(FRAME.length))
    if (!parsed || typeof parsed !== "object") return { kind: "unknown" }
    const value = parsed as Record<string, unknown>

    if (value.kind === "payment") {
      const luna = value.luna
      // A payment of zero, a fraction of a luna, or more than JavaScript can
      // count is not a payment this app is willing to draw a card for.
      if (typeof luna !== "number" || !Number.isSafeInteger(luna) || luna <= 0) {
        return { kind: "unknown" }
      }
      const reference = typeof value.reference === "string" ? value.reference : null
      return { kind: "payment", payment: { luna, reference } }
    }

    if (value.kind === "invite") {
      // A room id that is not a room id points at nothing openable, and a card
      // for it would be a button that cannot work.
      const group = typeof value.group === "string" ? groupIdFrom(value.group) : null
      if (!group) return { kind: "unknown" }
      const name = typeof value.name === "string" ? value.name.trim() : ""
      return { kind: "invite", invite: { group, name } }
    }
  } catch {
    // Damaged frame. Falls through to `unknown`, which is what it is.
  }
  return { kind: "unknown" }
}

/**
 * The one line that stands for a message in a list of conversations.
 *
 * Lives here rather than in the inbox so that adding a payload kind cannot
 * leave a chat list showing a frame full of JSON — the compiler asks for the
 * new case in the same file that introduced it.
 *
 * Takes the direction because a payment reads differently from each end, and
 * the "You: " that prefixes your own text would name the wrong person in front
 * of a payment you received.
 */
export function preview(plain: string, direction: "in" | "out"): string {
  const payload = decode(plain)
  switch (payload.kind) {
    case "text":
      return direction === "out" ? `You: ${payload.text}` : payload.text
    case "payment": {
      const amount = `${formatNim(payload.payment.luna)} NIM`
      return direction === "out" ? `Sent ${amount}` : `Received ${amount}`
    }
    case "invite": {
      const room = payload.invite.name || "a group"
      return direction === "out" ? `You shared ${room}` : `Invited you to ${room}`
    }
    case "unknown":
      return "Unsupported message"
  }
}
