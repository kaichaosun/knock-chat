/**
 * What a message actually says, once decrypted.
 *
 * A message used to be a string and mostly still is: ordinary text travels as
 * itself, so every message ever sent, and every client that only knows about
 * text, keeps working untouched. Anything that is not text is wrapped in a
 * frame that begins with a Unit Separator (`0x1F`) — a character no keyboard
 * produces and no honest message contains, which is what makes "this is not
 * text" a decision rather than a guess.
 *
 * It was a NUL byte at first, which is untypable in the same way but which
 * Postgres refuses in a `text` column. That went unnoticed while every message
 * was encrypted before storage — base64 has no NUL in it — and broke the moment
 * group messages, which are stored as they are written, carried a frame.
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

import { t } from "i18next"

import { addressFrom, shortenAddress } from "./address"
import { groupIdFrom } from "./group-link"
import { segments } from "./mentions"
import { labelIn, snapshot } from "./names"
import { firstEmoji } from "./emoji"
import { isTag, unquote } from "./quote"
import { formatNim } from "./postage"

const FRAME = "\u001fknock1\n"

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

/**
 * A pot somebody dropped in the room.
 *
 * Only the id and the shape travel: how much is left, and whether you already
 * took a share, are asked of the relay when the card is drawn. Putting the
 * count in the message would freeze it at the moment it was sent, which is the
 * one number that is guaranteed to change.
 */
export type GiftNote = {
  /** The gift's id. Everything about its state is looked up. */
  gift: string
  total_luna: number
  shares: number
  /** A word from the sender, so the card reads as something before it loads. */
  note: string
}

/**
 * Somebody worth knowing, handed on.
 *
 * The address is the whole of it; the name travels only so the card reads as a
 * person before anything is fetched. It is the name they publish, never the one
 * you gave them — that one is promised to stay on your phone.
 *
 * Handing on an address gives nobody a way in. The door is still shut behind
 * it: reaching them means knocking and paying their postage, exactly as it
 * would if the address had been read out loud.
 */
export type ContactNote = {
  address: string
  /** What they call themselves, as the sender's app last heard it. A label. */
  name: string
}

/**
 * How somebody answered a message without saying anything.
 *
 * Carried as a message of its own, because it has to be: a direct message is
 * sealed and the relay drops it the moment it is collected, so there is nowhere
 * else for a reaction to live that both ends can see. One mechanism serves a
 * room and a chat alike, and neither needs the relay to know what a reaction
 * is.
 *
 * The cost is paid by clients that predate this: a frame they do not recognise
 * is drawn as "something it can't display", so a room full of reactions reads
 * as a room full of gaps to a phone that has not updated. Chosen deliberately
 * over hiding a reaction inside ordinary text — this says what it is, and what
 * it is cannot be mistaken for something somebody typed.
 */
export type Reaction = {
  /** The message reacted to, named the way a quote names one — see `lib/quote`. */
  to: string
  /**
   * One emoji, or nothing at all.
   *
   * Empty is how a reaction is taken back. Every reaction is a message and
   * messages only ever arrive, so the last one somebody sent about a message is
   * the one that counts, and an empty one counts as none.
   */
  emoji: string
}

export type Payload =
  | { kind: "text"; text: string }
  | { kind: "payment"; payment: Payment }
  | { kind: "invite"; invite: Invite }
  | { kind: "gift"; giftNote: GiftNote }
  | { kind: "contact"; contact: ContactNote }
  | { kind: "reaction"; reaction: Reaction }
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

export function giftNote(gift: string, total_luna: number, shares: number, note: string): Payload {
  return { kind: "gift", giftNote: { gift, total_luna, shares, note } }
}

export function contactNote(address: string, name: string): Payload {
  return { kind: "contact", contact: { address, name } }
}

export function reaction(to: string, emoji: string): Payload {
  return { kind: "reaction", reaction: { to, emoji } }
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
  if (payload.kind === "gift") {
    return FRAME + JSON.stringify({ kind: "gift", ...payload.giftNote })
  }
  if (payload.kind === "contact") {
    return FRAME + JSON.stringify({ kind: "contact", ...payload.contact })
  }
  if (payload.kind === "reaction") {
    return FRAME + JSON.stringify({ kind: "reaction", ...payload.reaction })
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

    if (value.kind === "gift") {
      const gift = typeof value.gift === "string" ? groupIdFrom(value.gift) : null
      const total = value.total_luna
      const shares = value.shares
      // A card for a pot that cannot exist is a button that cannot work.
      if (
        !gift ||
        typeof total !== "number" ||
        !Number.isSafeInteger(total) ||
        total <= 0 ||
        typeof shares !== "number" ||
        !Number.isSafeInteger(shares) ||
        shares <= 0
      ) {
        return { kind: "unknown" }
      }
      const note = typeof value.note === "string" ? value.note.trim() : ""
      return { kind: "gift", giftNote: { gift, total_luna: total, shares, note } }
    }

    if (value.kind === "contact") {
      // An address that is not an address points at nobody, and a card for it
      // would be a button that cannot work.
      const address = typeof value.address === "string" ? addressFrom(value.address) : null
      if (!address) return { kind: "unknown" }
      const name = typeof value.name === "string" ? value.name.trim() : ""
      return { kind: "contact", contact: { address, name } }
    }

    if (value.kind === "reaction") {
      // A reaction to nothing is a reaction nothing can be drawn against, and
      // the tag is the only part of it this can check.
      const to = typeof value.to === "string" ? value.to.toLowerCase() : ""
      if (!isTag(to)) return { kind: "unknown" }
      // One emoji, or none. A reaction is drawn as a pill beside somebody's
      // words with no room to say where it came from, so a peer must not be
      // able to put a sentence there — and reading it as a grapheme is what
      // keeps a joined emoji whole rather than sending half a family.
      const emoji = typeof value.emoji === "string" ? (firstEmoji(value.emoji) ?? "") : ""
      return { kind: "reaction", reaction: { to, emoji } }
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
    case "text": {
      // The words, not what they answer. A list of threads showing every reply
      // as the message before it would be a list of the wrong messages.
      const text = spoken(unquote(payload.text).body)
      return direction === "out" ? t("preview.youSaid", { text }) : text
    }
    case "payment": {
      const amount = `${formatNim(payload.payment.luna)} NIM`
      return t(direction === "out" ? "preview.sent" : "preview.received", { amount })
    }
    case "invite": {
      const room = payload.invite.name || t("preview.aGroup")
      return t(direction === "out" ? "preview.youShared" : "preview.invitedYou", { room })
    }
    case "gift": {
      const amount = `${formatNim(payload.giftNote.total_luna)} NIM`
      return t(direction === "out" ? "preview.youLeft" : "preview.leftForRoom", { amount })
    }
    case "contact": {
      const who = payload.contact.name || shortenAddress(payload.contact.address)
      return direction === "out"
        ? t("preview.youShared", { room: who })
        : t("preview.sharedWithYou", { name: who })
    }
    case "reaction": {
      // Named rather than shown: a chat list saying only "👍" is a list that
      // says nothing, and the message it answers is not this one.
      const { emoji } = payload.reaction
      if (!emoji) return t("preview.unsupported")
      return t(direction === "out" ? "preview.youReacted" : "preview.reacted", { emoji })
    }
    case "unknown":
      return t("preview.unsupported")
  }
}

/**
 * A message as it reads in a list, with anybody named in it drawn as a name.
 *
 * The same substitution the bubble makes — see `lib/mentions` — so that one
 * line does not say "@NQ97 V68G…" about a message the thread shows as "@Alice".
 * The directory is read here rather than passed in for the same reason `t` is:
 * every caller of this would otherwise have to carry it.
 */
function spoken(text: string): string {
  const parts = segments(text)
  // Nothing was named, which is nearly every message. Left exactly as it came.
  if (parts.length <= 1) return text
  const directory = snapshot()
  return parts
    .map((part) =>
      // A link reads as itself in a list: there is nothing to look up and
      // nowhere to tap, and the address is what somebody sent.
      part.kind === "mention" ? `@${labelIn(directory, part.address)}` : part.text,
    )
    .join("")
}
