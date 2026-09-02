/**
 * Which thread the address bar is pointing at.
 *
 * A thread used to live only in memory, and the address bar said the same thing
 * whether you were reading the list or reading a room. That is fine until
 * something rebuilds the page — a reload, a discarded tab, coming back from a
 * link someone sent — at which point there is nothing to restore from and every
 * return lands on the list.
 *
 * So the open thread is written where a rebuild can find it. Two names:
 *
 * - `?chat=` — a direct thread, the address written as one run.
 * - `?group=` — a room.
 *
 * `?group=` is the same name a room link uses, deliberately. Both mean "this
 * room", and which of the two things happens is not the link's business but a
 * question about the reader: somebody already in the room is taken to it, and
 * somebody who is not is shown the door and what it costs. One name, one
 * meaning, and a link that stays right after it has been used.
 *
 * `?knock=` is not here. It says *do something* — go and meet this person —
 * rather than naming what is on screen, so it is spent on arrival like the
 * invite half of `?group=` and never written back.
 *
 * ## What this puts in the address bar
 *
 * An address, or a room id. Somebody reading over a shoulder, and this device's
 * own browser history, learn who is being talked to. That is a real cost and it
 * bought back the thread surviving a reload. Nothing leaves the device for it:
 * outbound links in messages are sent with no referrer at all, so no site is
 * told what was on screen when somebody tapped through to it.
 */

import { addressFrom, compact } from "./address"
import { groupIdFrom } from "./group-link"

/** What the address bar names. Both null where it names nothing. */
export type Pointed = {
  peer: string | null
  group: string | null
}

const NOTHING: Pointed = { peer: null, group: null }

/**
 * Read what is open out of an address bar.
 *
 * Both are checked rather than believed — an address carries a checksum and a
 * room id has a shape — so a hand-typed or truncated URL opens nothing instead
 * of opening a thread with nobody in it.
 */
export function threadInUrl(href: string): Pointed {
  let params: URLSearchParams
  try {
    params = new URL(href).searchParams
  } catch {
    return NOTHING
  }
  const chat = params.get("chat")
  const group = params.get("group")
  return {
    peer: chat ? addressFrom(chat) : null,
    group: group ? groupIdFrom(group) : null,
  }
}

/**
 * What this app itself left in the address bar, if that is where we are.
 *
 * A URL naming a room asks two different questions depending on where it came
 * from. Somebody sent it: are you even in that room? The app wrote it, and is
 * being returned to — by a reload, or by coming back from a link somebody sent
 * — and there is nothing to ask, because the room was on screen a moment ago.
 *
 * The two are told apart by the history entry's own state, which the browser
 * keeps with the entry through a reload and through a trip to another site.
 * `?group=` alone cannot say it: the same characters are what an invite looks
 * like.
 *
 * Worth the distinction because the answer to the first question has to be
 * fetched, and a room that waits for it is a room with the chat list in front
 * of it for as long as the round trip lasts.
 */
export function reopenedThread(state: unknown, href: string): Pointed {
  const key = (state as { thread?: unknown } | null)?.thread
  if (typeof key !== "string") return NOTHING
  const pointed = threadInUrl(href)
  // The mark has to name what the address bar names. They come apart where an
  // entry was replaced under a state that outlived it.
  return key === pointed.peer || key === pointed.group ? pointed : NOTHING
}

/**
 * The same address bar with this thread open, and nothing else disturbed.
 *
 * Built from the URL that is there rather than from scratch: the app is opened
 * with things in its query string that are none of this module's business —
 * `?probe` above all — and a rewrite that dropped them would turn navigating
 * between threads into a way of losing them.
 */
export function urlForThread(href: string, { peer, group }: Pointed): string {
  const url = new URL(href)
  url.searchParams.delete("chat")
  url.searchParams.delete("group")
  // Only ever one: a room is drawn in preference to a thread, so an address bar
  // naming both would name one thing nobody can see.
  if (peer) url.searchParams.set("chat", compact(peer).toUpperCase())
  else if (group) url.searchParams.set("group", group)
  return url.toString()
}
