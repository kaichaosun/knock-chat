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
import { unmarked } from "./markup"
import { segments } from "./mentions"
import { labelIn, snapshot } from "./names"
import { firstEmoji } from "./emoji"
import { isTag, unquote } from "./quote"
import { formatNim } from "./postage"

const FRAME = "\u001fknock1\n"

/**
 * How many emoji one person may put on one message.
 *
 * A limit rather than a judgement: somebody who wants six has six, and a peer
 * who sends sixty is filling a thread with a row nothing can read.
 */
export const MAX_REACTIONS = 8

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
   * Everything this person has put on that message, not what they just did.
   *
   * A whole set rather than one emoji and a verb, because a message cannot be
   * unsent and may arrive twice or out of order — and "add this" applied twice
   * is wrong in a way "here is the lot" never is. The last one somebody sends
   * about a message is the truth about them, whatever reached the other end
   * before it, and an empty list is somebody who has taken all of theirs back.
   */
  emoji: string[]
}

/**
 * How the words of a message are to be read.
 *
 * A dimension of a text message rather than a kind of its own: the content is
 * still text, and everything that only wants the words — a chat row, a quote, a
 * push notification — keeps reading `text` and never has to know about this.
 *
 * Absent means plain, and plain is what a person sends. Nothing infers this
 * from the characters: guessing is what makes `2 * 3 * 4` come out in italics
 * for somebody doing arithmetic, and a sender who wants shaping can say so.
 *
 * It is a claim, not a credential — anybody can set it, and the app has no
 * notion of which addresses are bots. So it decides only what is *ambiguous*,
 * never what is *unsafe*: see `lib/markup` for what it does and does not turn
 * on.
 */
export type Parse = "markdown"

export type Payload =
  | { kind: "text"; text: string; parse?: Parse }
  | { kind: "payment"; payment: Payment }
  | { kind: "invite"; invite: Invite }
  | { kind: "gift"; giftNote: GiftNote }
  | { kind: "contact"; contact: ContactNote }
  | { kind: "reaction"; reaction: Reaction }
  /** A frame this build does not understand — a newer client, or damage. */
  | { kind: "unknown" }

export function text(value: string, parse?: Parse): Payload {
  return parse ? { kind: "text", text: value, parse } : { kind: "text", text: value }
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

export function reaction(to: string, emoji: string[]): Payload {
  return { kind: "reaction", reaction: { to, emoji } }
}

/** Turn a payload into the plaintext that gets encrypted. */
export function encode(payload: Payload): string {
  if (payload.kind === "text") {
    // Unframed unless it has to be. Every message a person types comes through
    // here, and wrapping those would put a frame on the wire for the sake of a
    // field none of them ever set.
    if (!payload.parse) return payload.text
    return FRAME + JSON.stringify({ kind: "text", parse: payload.parse, text: payload.text })
  }
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
      // Emoji only, and few. A pill sits beside somebody's words with no room
      // to say where it came from, so a peer must not be able to put a sentence
      // in one — and reading each as a grapheme keeps a joined emoji whole
      // rather than passing on half a family.
      //
      // A lone string is read as a list of one: that is what the first build to
      // send reactions put on the wire, and a message already sent cannot be
      // rewritten.
      const raw = Array.isArray(value.emoji)
        ? value.emoji
        : typeof value.emoji === "string"
          ? [value.emoji]
          : []
      const emoji: string[] = []
      for (const one of raw) {
        const found = typeof one === "string" ? firstEmoji(one) : null
        if (found && !emoji.includes(found)) emoji.push(found)
        if (emoji.length === MAX_REACTIONS) break
      }
      return { kind: "reaction", reaction: { to, emoji } }
    }

    if (value.kind === "text") {
      // The words are the whole of it, so a frame without them is not a
      // message. An unrecognised parse mode falls back to plain rather than
      // being refused: the words are still the words.
      if (typeof value.text !== "string") return { kind: "unknown" }
      return value.parse === "markdown"
        ? { kind: "text", text: value.text, parse: "markdown" }
        : { kind: "text", text: value.text }
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
      // Markup off before the words are counted: a row has no room to be a
      // list and nowhere to put a strong run, and leaving the characters in
      // would show `**` about a message the thread draws in bold. Only for a
      // message that asked to be read that way — everything else is already
      // exactly what somebody typed.
      const body = unquote(payload.text).body
      const text = spoken(payload.parse === "markdown" ? unmarked(body) : body)
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
      // An empty set is somebody taking all of theirs back — a message this
      // build reads perfectly well, so it must not borrow the line meant for
      // one it cannot.
      if (emoji.length === 0) {
        return t(direction === "out" ? "preview.youUnreacted" : "preview.unreacted")
      }
      // Run together rather than listed: this is one line in a list of chats,
      // and the commas a list would put between them are the loudest thing in
      // it. Somebody with three is shown as having three.
      return t(direction === "out" ? "preview.youReacted" : "preview.reacted", {
        emoji: emoji.join(""),
      })
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
  //
  // Counted by what the parts *are*, not how many there are. A message that is
  // nothing but a mention splits into exactly one part — and that one part is
  // the mention, so a count of one was reading the commonest way to name
  // somebody as the one case where nobody had been named. It came out as the
  // raw address, in a chat list and in every quote of it.
  if (parts.every((part) => part.kind === "text")) return text
  const directory = snapshot()
  return parts
    .map((part) =>
      // A link reads as itself in a list: there is nothing to look up and
      // nowhere to tap, and the address is what somebody sent.
      part.kind === "mention" ? `@${labelIn(directory, part.address)}` : part.text,
    )
    .join("")
}
