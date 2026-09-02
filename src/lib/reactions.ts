/**
 * What people put on a message without saying anything.
 *
 * A reaction arrives as a message like any other — it has to, since a direct
 * message is sealed and the relay drops it once collected, leaving nowhere else
 * for one to live. See `lib/payload`. So a thread as it comes off the wire has
 * reactions scattered through it in the order they were sent, and the job here
 * is to take them out of the conversation and put them on the messages they
 * were about.
 *
 * ## The last one counts
 *
 * There is no way to unsend a message, so taking a reaction back is done by
 * sending another one that is empty. Whatever somebody's most recent reaction
 * to a message says is what they think of it now, and an empty one means they
 * have stopped thinking it. That also makes a repeated tap on the same emoji
 * work as the toggle everybody expects, without a second kind of message.
 *
 * ## Reactions to nothing
 *
 * A reaction can outlive what it was about — a room's history only goes back so
 * far, and a chat can be cleared. Those are dropped from what is drawn but
 * still taken out of the thread: a bubble reading "something it can't display"
 * is worse than a reaction nobody sees.
 */

import { decode } from "./payload"
import { tagOf } from "./quote"
import type { Message } from "./messages"

/**
 * What a message is answered with before anybody has answered one.
 *
 * Six, because six is what fits under a thumb in one row, and these six because
 * they are the ones a stranger can read without being told. They are a starting
 * point rather than the set: whatever somebody actually uses takes their place
 * — see [`offered`] — and anything at all can be reached past them.
 */
export const CHOICES = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

/** How many the row holds. One thumb's width, and no scrolling. */
const OFFERED = 6

/**
 * The row to put in front of somebody: what they last used, then the defaults.
 *
 * Recent first because a reaction is a habit — a person who answers everything
 * with one emoji should reach it without looking, and somebody who went to the
 * trouble of finding an unusual one should not have to find it twice.
 */
export function offered(recent: string[]): string[] {
  const row: string[] = []
  for (const emoji of [...recent, ...CHOICES]) {
    if (!row.includes(emoji)) row.push(emoji)
    if (row.length === OFFERED) break
  }
  return row
}

/** Put one at the front of the recent list, keeping it short and unique. */
export function remember(recent: string[], emoji: string): string[] {
  return [emoji, ...recent.filter((one) => one !== emoji)].slice(0, OFFERED)
}


/** One emoji on one message, and who is behind it. */
export type Reacted = {
  emoji: string
  /** How many people have put it there. */
  count: number
  /** Whether one of them is you. */
  mine: boolean
}

export type Folded = {
  /** The thread without its reactions. What actually gets drawn. */
  shown: Message[]
  /** What is on each message, by that message's id. Absent where nothing is. */
  on: Map<string, Reacted[]>
}

/**
 * Split a thread into what was said and what was thought of it.
 *
 * `owner` is your own address, which is how a reaction of yours is told from
 * everybody else's: an outgoing message is yours whoever it went to, and an
 * incoming one belongs to whoever sent it.
 */
export function fold(messages: Message[], owner: string): Folded {
  const shown: Message[] = []
  /** Target tag → who reacted → the emoji they last chose. */
  const latest = new Map<string, Map<string, string>>()

  for (const message of messages) {
    const payload = decode(message.body)
    if (payload.kind !== "reaction") {
      shown.push(message)
      continue
    }
    const who = message.direction === "out" ? owner : message.peer
    const on = latest.get(payload.reaction.to) ?? new Map<string, string>()
    // Set even when empty: an empty one is a reaction being taken back, and it
    // has to overwrite what it takes back rather than be skipped.
    on.set(who, payload.reaction.emoji)
    latest.set(payload.reaction.to, on)
  }

  const on = new Map<string, Reacted[]>()
  for (const message of shown) {
    const tag = tagOf(message.id)
    const chosen = tag && latest.get(tag)
    if (!chosen) continue

    // First seen, first drawn. Not by count: a row that reorders itself as
    // people react is a row nobody can tap twice in the same place.
    const order: string[] = []
    const counts = new Map<string, number>()
    const mine = new Set<string>()
    for (const [who, emoji] of chosen) {
      if (!emoji) continue
      if (!counts.has(emoji)) order.push(emoji)
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1)
      if (who === owner) mine.add(emoji)
    }
    if (order.length === 0) continue

    on.set(
      message.id,
      order.map((emoji) => ({
        emoji,
        count: counts.get(emoji) ?? 0,
        mine: mine.has(emoji),
      })),
    )
  }

  return { shown, on }
}

/** What you have already put on a message, so tapping it again takes it off. */
export function mineOn(reacted: Reacted[] | undefined, emoji: string): boolean {
  return reacted?.some((one) => one.emoji === emoji && one.mine) ?? false
}
