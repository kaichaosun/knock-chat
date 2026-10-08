/**
 * Where the unread part of a thread starts.
 *
 * Read state is a count — see `readCount` in `lib/messages` — so the unread
 * messages are simply the last `unread` incoming ones. What it does not say is
 * which of them are drawn: a reaction is a message too, and counts like one,
 * but is folded onto what it answers rather than shown. The line has to sit
 * above something on screen, so it goes above the first unread message that is
 * drawn, and nowhere when the only thing new was a reaction.
 */

import type { Message } from "./messages"
import { fold } from "./reactions"

/** The id of the first drawn message that arrived unread, or null if none did. */
export function firstUnread(messages: Message[], unread: number, owner: string): string | null {
  if (unread <= 0) return null
  const incoming = messages.filter((m) => m.direction === "in")
  const first = incoming[Math.max(0, incoming.length - unread)]
  if (!first) return null

  const drawn = new Set(fold(messages, owner).shown.map((m) => m.id))
  return (
    messages
      .slice(messages.indexOf(first))
      .find((m) => m.direction === "in" && drawn.has(m.id))?.id ?? null
  )
}
