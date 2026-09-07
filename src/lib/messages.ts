/**
 * Local message history.
 *
 * The relay only holds messages *for* a recipient, so a sender never gets its
 * own messages back. The client therefore keeps the full thread locally and
 * merges incoming envelopes into it. That means history lives on the device in
 * this slice — clearing site data clears the conversation.
 */

import { compact } from "./address"
import { decode, encode, text, type Parse, type Part } from "./payload"
import type { Envelope } from "./relay"
import { sameMinute } from "./time"

/**
 * An envelope after decryption: the body is plaintext, or the message is
 * flagged as one this device cannot open.
 */
export type OpenedEnvelope = Omit<Envelope, "body"> & {
  body: string
  undecryptable?: boolean
}

/**
 * `blocked` is a failure that retrying cannot fix: the channel is shut, so the
 * only way through is a fresh knock. Kept apart from `failed` so the UI never
 * offers a retry that is guaranteed to fail again.
 */
export type MessageStatus = "sending" | "sent" | "failed" | "blocked"

export type Message = {
  id: string
  /**
   * Set when a message arrived but could not be decrypted — usually because it
   * was sent to a key this device has since replaced. Shown as such rather than
   * hidden, so history has no silent gaps.
   */
  undecryptable?: boolean
  /** The other party, whichever direction the message went. In a room this is
   *  whoever spoke, which is not the same as who the thread is with. */
  peer: string
  /**
   * The room this belongs to, when it came from one.
   *
   * A room is a thread in its own right, so it — not the speaker — is what
   * files the message. [`threadKey`] is the one place that decides which.
   */
  group?: string
  direction: "in" | "out"
  body: string
  at: string
  status: MessageStatus
}

/**
 * Which thread a message belongs to.
 *
 * A direct message is filed under the other party; a room message under the
 * room, whoever happened to speak. Every keyed operation below goes through
 * this, so the two kinds of thread cannot drift apart.
 */
export function threadKey(message: Message): string {
  return message.group ?? message.peer
}

/**
 * How long a turn stays open before the next message starts a new one.
 *
 * A turn is a burst of typing, not a whole afternoon. Somebody who says one
 * thing in the morning and another after lunch is twice as easy to lose track
 * of, so the second one is introduced again.
 */
export const TURN_GAP_MS = 5 * 60_000

/**
 * Whether two messages are the same person still talking.
 *
 * Outgoing is always you; incoming is somebody in particular, which only
 * matters in a room — a direct thread has one other person in it, so the
 * peer check is a no-op there rather than a special case.
 */
export function sameTurn(message: Message, next: Message): boolean {
  if (message.direction !== next.direction) return false
  return message.direction === "out" || message.peer === next.peer
}

/** Whether a message starts a fresh turn: a new speaker, or the same one after a gap. */
export function opensTurn(previous: Message | undefined, message: Message): boolean {
  if (!previous || !sameTurn(previous, message)) return true
  const apart = new Date(message.at).getTime() - new Date(previous.at).getTime()
  return !(apart < TURN_GAP_MS)
}

/**
 * Whether a bubble shows its own time.
 *
 * The last of a same-minute run carries it for all of them. Repeating one
 * stamp down five bubbles says nothing five times over, and the stamp people
 * actually look for is the one at the end — when the talking stopped.
 */
export function carriesTime(message: Message, next: Message | undefined): boolean {
  if (!next || !sameTurn(message, next)) return true
  return !sameMinute(message.at, next.at)
}

export type Conversation = {
  /** Thread identity: a peer's address, or a room's id. */
  key: string
  /** The other party, for a direct chat. Null for a room. */
  peer: string | null
  /** The room's id, for a room. Null for a direct chat. */
  group: string | null
  /** Null for a room nobody has said anything in yet. */
  last: Message | null
  /** When this thread last stirred: a message, or the room being made. */
  at: string
  unread: number
}

type Snapshot = {
  /**
   * Where to resume delivery — issued by the relay, handed straight back, never
   * interpreted here.
   *
   * Whether a cursor is still meaningful is a question only the relay can
   * answer: it knows which sequence space it is in and how far that sequence
   * has got. A rebuilt or restored relay simply serves from the beginning
   * again, and because message ids are stable the replay deduplicates away.
   */
  cursor: string | null
  messages: Message[]
  /**
   * How many incoming messages each thread held when it was last read.
   *
   * A count rather than a timestamp on purpose. Message times come from the
   * relay and a "last read" time would come from the device, so comparing them
   * would compare two clocks — a device running slightly behind the relay would
   * see every message as permanently unread. Counting sidesteps clocks
   * entirely, and works because local history only ever grows.
   */
  readCount: Record<string, number>
  /**
   * Threads hidden from the list until something new arrives.
   *
   * Deleting a chat used to be enough on its own: with the messages gone there
   * was no thread, so the row went with them. A room is not made of its
   * messages — you are in it whether or not anyone has spoken — so it would
   * reappear empty the moment the list was rebuilt. This is what makes deleting
   * a room's chat mean something without meaning *leave*, which lives in Groups.
   */
  dismissed: Record<string, true>
}

const EMPTY: Snapshot = { cursor: null, messages: [], readCount: {}, dismissed: {} }

function storageKey(owner: string): string {
  return `knock:history:${compact(owner)}`
}

/**
 * `crypto.randomUUID` needs a secure context, which `http://<lan-ip>` is not —
 * exactly how the app gets opened on a phone during development.
 */
export function messageId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** A snapshot for someone with no stored history yet. */
export function emptySnapshot(): Snapshot {
  return { ...EMPTY }
}

export function load(owner: string): Snapshot {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Snapshot
    // Storage is user-writable; treat anything malformed as absent.
    if (!Array.isArray(parsed.messages)) return EMPTY
    // Swept on the way in rather than migrated once and marked done: it is a
    // filter over what is there, so running it every launch costs one pass and
    // needs no record of having run. What it cleans up is explained on it.
    return dropStrandedCopies({ ...EMPTY, ...parsed })
  } catch {
    return EMPTY
  }
}

export function save(owner: string, snapshot: Snapshot): void {
  try {
    localStorage.setItem(storageKey(owner), JSON.stringify(snapshot))
  } catch {
    // Quota or private mode — the session still works, it just won't persist.
  }
}

/**
 * Merge freshly fetched envelopes, ignoring any already present, and remember
 * where to resume.
 *
 * The cursor advances even when every envelope was a duplicate — a relay that
 * rewound and replayed has still told us where it got to, and refusing to
 * advance would replay forever.
 */
export function mergeIncoming(
  snapshot: Snapshot,
  envelopes: OpenedEnvelope[],
  /**
   * Where the feed has reached. Nullable because a snapshot's cursor is —
   * nothing has been fetched yet on a fresh device — and because folding in a
   * room's past hands the current one straight back rather than moving it.
   */
  cursor: string | null,
  /**
   * Whose device this is, so a message can be filed on the right side.
   *
   * The feed never returns your own messages — it is a queue and holds nothing
   * for the sender — but a room's history does, because it is the record. Left
   * to assume, those would come back as though somebody else had said them.
   */
  owner: string,
): Snapshot {
  const known = new Set(snapshot.messages.map((m) => m.id))
  const added: Message[] = []
  for (const envelope of envelopes) {
    const id = `relay:${envelope.id}`
    if (known.has(id)) continue
    added.push({
      id,
      peer: compact(envelope.from),
      ...(envelope.group_id ? { group: envelope.group_id } : {}),
      direction: compact(envelope.from) === compact(owner) ? "out" : "in",
      body: envelope.body,
      at: envelope.created_at,
      status: "sent",
      ...(envelope.undecryptable ? { undecryptable: true } : {}),
    })
  }

  if (added.length === 0 && snapshot.cursor === cursor) return snapshot

  return {
    ...snapshot,
    cursor,
    messages: added.length > 0 ? sorted([...snapshot.messages, ...added]) : snapshot.messages,
    // Something new in a hidden thread brings it back, which is the whole
    // meaning of hidden rather than gone.
    dismissed: without(snapshot.dismissed, added.map(threadKey)),
  }
}

/**
 * Give a message this device sent the name the relay gave it.
 *
 * It is written down before it is sent, so at that point there is nothing to
 * call it but a local id. Once the relay answers it has a real name, and taking
 * it is what lets the same message be recognised if it ever comes back: a
 * room's history returns everything said in it, this device's own words
 * included, and under a local id those would arrive as strangers and land a
 * second time — once on each side of the conversation.
 */
export function settle(snapshot: Snapshot, id: string, name: string): Snapshot {
  if (!snapshot.messages.some((m) => m.id === id)) return snapshot
  return {
    ...snapshot,
    messages: snapshot.messages.map((m) =>
      m.id === id ? { ...m, id: name, status: "sent" as MessageStatus } : m,
    ),
  }
}

/**
 * Drop a room message this device is still holding under a local id, when the
 * room's own copy of it is already here.
 *
 * Cleaning up after a bug rather than guarding against one. A gift card used to
 * be written down and sent without ever being given the name the relay
 * answered with, so when the room's history handed it back — a room returns
 * everything said in it, this device's words included — [`mergeIncoming`] found
 * nothing matching and filed it a second time. The sender saw two of a pot they
 * had left once; everybody else saw the one that was really there. The send
 * path settles now, but the doubled card is already written down on every phone
 * that left a gift before it did, and nothing on the relay will take it back:
 * the stray is this device's own note to itself.
 *
 * Three things have to agree before anything is dropped, and each rules out a
 * different way of being wrong:
 *
 * - **It is in a room.** A direct message is never returned to its sender, so
 *   it keeps its local id for life and one is no evidence of anything.
 * - **The room's copy is here**, carrying the same words. That copy is the
 *   proof this was said and reached the room. Without it the local one is the
 *   only record there is — of a card whose message the relay has since let go,
 *   say — and dropping it would erase the gift from the sender's history.
 * - **It says it was sent.** The only writer that ever left a room message
 *   local and `sent` was the gift path; [`recordOutgoing`] defaults to `sent`
 *   and that is what it took. Anything said the ordinary way is `sending` until
 *   it settles, and a message that genuinely failed keeps `failed` and its
 *   offer to try again — an offer that must survive somebody having said the
 *   same words earlier and got through.
 */
export function dropStrandedCopies(snapshot: Snapshot): Snapshot {
  // What the room has said back, as room-and-words. A body is compared whole:
  // a card is a fixed line of JSON and the relay stores a room's messages as
  // they were written, so the two copies are the same string or they are not
  // the same message.
  const held = new Set(
    snapshot.messages
      .filter((m) => m.group && m.id.startsWith("relay:"))
      .map((m) => `${m.group}\u0000${m.body}`),
  )
  if (held.size === 0) return snapshot

  const messages = snapshot.messages.filter(
    (m) =>
      !(
        m.group &&
        m.direction === "out" &&
        m.status === "sent" &&
        m.id.startsWith("local:") &&
        held.has(`${m.group}\u0000${m.body}`)
      ),
  )
  if (messages.length === snapshot.messages.length) return snapshot
  return { ...snapshot, messages }
}

/**
 * Forget messages the room took back.
 *
 * Ids only, and ids for messages this device never held are simply not found —
 * a deletion is delivered to everyone in the room, including people who joined
 * after the message or never fetched it, so most of them are no-ops by design.
 *
 * Returns the same snapshot when nothing matched, so a poll that carries a
 * tombstone for somebody else costs no render and no write.
 */
export function removeMessages(snapshot: Snapshot, ids: string[]): Snapshot {
  if (ids.length === 0) return snapshot
  const gone = new Set(ids.map((id) => `relay:${id}`))
  const messages = snapshot.messages.filter((m) => !gone.has(m.id))
  if (messages.length === snapshot.messages.length) return snapshot
  return { ...snapshot, messages }
}

/**
 * Fold one read of the feed into what is held: what was said, and then what was
 * taken back.
 *
 * That order is the whole of this function, and it is the opposite of the one
 * that reads as careful. A room hands over a message and its tombstone in the
 * same page whenever the deletion happened between two reads: the message's seq
 * is past the cursor either way, so the read that catches a device up carries
 * both. Taking back first finds nothing to take — the message has not landed
 * yet — and the merge then puts it on screen, where it stays.
 *
 * Which is exactly what somebody away from the app sees. A reply is written and
 * deleted while they are gone; they open Knock and are shown the one thing
 * nobody was meant to read.
 *
 * Nothing is lost the other way round. A tombstone whose message arrived in an
 * earlier read still matches it, and one for a message this device never held
 * is a no-op whenever it is applied.
 */
export function applyFeed(
  snapshot: Snapshot,
  envelopes: OpenedEnvelope[],
  /** Ids the relay says are gone, as they came — see [`removeMessages`]. */
  deleted: string[],
  cursor: string | null,
  owner: string,
): Snapshot {
  return removeMessages(mergeIncoming(snapshot, envelopes, cursor, owner), deleted)
}

/** Record something this device sent, so the sender sees their own words. */
export function recordOutgoing(
  snapshot: Snapshot,
  peer: string,
  body: string,
  id: string,
  /** Files it under a room instead of under the recipient. */
  group?: string,
  /**
   * Defaults to `sent` because the first caller here was a knock, which the
   * relay has already accepted by the time it is written down — there is
   * nothing left to wait for.
   *
   * Anything recorded *before* it has been sent must say `sending` instead. A
   * message that has not left yet, wearing the tick that means it arrived, is
   * the worst thing this file can do: the one moment somebody needs to know
   * their words went nowhere is the moment they walk away believing they did.
   */
  status: MessageStatus = "sent",
): Snapshot {
  return appendOutgoing(snapshot, {
    id,
    peer: compact(peer),
    ...(group ? { group } : {}),
    direction: "out",
    body,
    at: new Date().toISOString(),
    status,
  })
}

export function appendOutgoing(snapshot: Snapshot, message: Message): Snapshot {
  return {
    ...snapshot,
    messages: sorted([...snapshot.messages, message]),
    // Writing in a thread you hid brings it back too — you are plainly using it.
    dismissed: without(snapshot.dismissed, [threadKey(message)]),
  }
}

/** Drop keys from a dismissal set, keeping the same object when nothing changed. */
function without(
  dismissed: Record<string, true>,
  keys: string[],
): Record<string, true> {
  if (!keys.some((key) => dismissed[key])) return dismissed
  const rest = { ...dismissed }
  for (const key of keys) delete rest[key]
  return rest
}

/**
 * Mark a message as on its way again, and restamp it to now.
 *
 * A resend happens now, not when it was first typed. Leaving the original time
 * on it would file it back among messages written after it — and the recipient
 * receives it at the new time regardless, so the two sides would disagree.
 */
export function resend(snapshot: Snapshot, id: string): Snapshot {
  const at = new Date().toISOString()
  return {
    ...snapshot,
    messages: sorted(
      snapshot.messages.map((m) =>
        m.id === id ? { ...m, at, status: "sending" as const } : m,
      ),
    ),
  }
}

export function setStatus(
  snapshot: Snapshot,
  id: string,
  status: MessageStatus,
): Snapshot {
  return {
    ...snapshot,
    messages: snapshot.messages.map((m) => (m.id === id ? { ...m, status } : m)),
  }
}

/**
 * Mark everything currently in `peer`'s thread as read.
 *
 * Returns the same snapshot when nothing changed, so callers can run this on
 * every render of an open thread without causing writes or re-renders.
 */
export function markRead(snapshot: Snapshot, thread: string): Snapshot {
  const key = normalizeKey(thread)
  const seen = incomingCount(snapshot.messages, key)
  if (snapshot.readCount[key] === seen) return snapshot

  return { ...snapshot, readCount: { ...snapshot.readCount, [key]: seen } }
}

/**
 * Delete a conversation from this device.
 *
 * The messages go; the channel does not. You stay connected and can write to
 * them again — the thread simply starts empty. Deleting a relationship is a
 * different act, and it lives in Contacts.
 *
 * The cursor is left alone deliberately: it is what stops the relay handing the
 * same messages back on the next poll and resurrecting what was just deleted.
 */
export function deleteThread(snapshot: Snapshot, thread: string): Snapshot {
  const key = normalizeKey(thread)
  const messages = snapshot.messages.filter((m) => threadKey(m) !== key)
  if (messages.length === snapshot.messages.length && snapshot.dismissed[key]) {
    return snapshot
  }

  const { [key]: _removed, ...readCount } = snapshot.readCount
  return { ...snapshot, messages, readCount, dismissed: { ...snapshot.dismissed, [key]: true } }
}

function incomingCount(messages: Message[], thread: string): number {
  // Counted after joining, and it has to be: `conversations` counts the same
  // way, and a mark taken on one basis against a count taken on the other
  // leaves a thread permanently unread by the difference.
  return joined(messages.filter((m) => threadKey(m) === thread)).filter(
    (m) => m.direction === "in",
  ).length
}

/**
 * A thread key as stored.
 *
 * Addresses arrive grouped or compact and have to agree; a room id is a uuid
 * and is already itself. Compacting a uuid leaves it alone, so one rule covers
 * both without having to know which it was given.
 */
function normalizeKey(thread: string): string {
  return compact(thread)
}

function sorted(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.at.localeCompare(b.at))
}

export function threadWith(snapshot: Snapshot, thread: string): Message[] {
  const key = normalizeKey(thread)
  return joined(snapshot.messages.filter((m) => threadKey(m) === key))
}

/**
 * Put an answer that arrived in pieces back together.
 *
 * A sender with more to say than a message body holds sends several and marks
 * them — see `Part` in `lib/payload`. Joining them here, rather than where they
 * are drawn, is what keeps the rest of the app from having to know: one bubble,
 * one id, one line in the chat list, one thing to reply to or react to.
 *
 * The joined message is the first piece, with the others' words added to it. It
 * keeps that piece's id, so a quote written before the rest arrived still
 * points at the same message afterwards.
 *
 * Nothing is ever dropped. A piece whose first has not arrived — history loaded
 * a page at a time can put them either side of the boundary — stands as its own
 * message rather than waiting for something that may never come.
 */
export function joined(messages: Message[]): Message[] {
  // Nearly every thread, and the whole of every thread between people. Walked
  // once to find out, so the common case allocates nothing.
  if (!messages.some((message) => partOf(message))) return messages

  const out: Message[] = []
  /** Where the first piece of each answer landed in `out`, by its id. */
  const heads = new Map<string, number>()
  /** What each of those has collected so far, in the order it arrived. */
  const said = new Map<string, string>()

  for (const message of messages) {
    const part = partOf(message)
    if (!part) {
      out.push(message)
      continue
    }
    if (!part.head) {
      heads.set(message.id, out.length)
      said.set(message.id, textIn(message) ?? "")
      out.push(message)
      continue
    }
    // The relay's id, as this device files it. See `use-messages`.
    const head = `relay:${part.head}`
    const at = heads.get(head)
    if (at === undefined) {
      out.push(message)
      continue
    }
    const grown = `${said.get(head) ?? ""}${textIn(message) ?? ""}`
    said.set(head, grown)
    out[at] = {
      ...out[at],
      // Still marked as a piece until the last one says otherwise, which is how
      // a bubble knows to say there is more coming.
      body: encode(text(grown, parseOf(out[at]), part.end ? undefined : { at: 0 })),
    }
  }
  return out
}

/** The marker on a message that is one piece of a longer answer. */
function partOf(message: Message): Part | undefined {
  const payload = decode(message.body)
  return payload.kind === "text" ? payload.part : undefined
}

/** What a text message says, or nothing where it is not words. */
function textIn(message: Message): string | undefined {
  const payload = decode(message.body)
  return payload.kind === "text" ? payload.text : undefined
}

/** How a text message asked to be read. */
function parseOf(message: Message): Parse | undefined {
  const payload = decode(message.body)
  return payload.kind === "text" ? payload.parse : undefined
}

/** One entry per peer, most recently active first. */
export function conversations(snapshot: Snapshot): Conversation[] {
  const byThread = new Map<string, Message[]>()
  for (const message of snapshot.messages) {
    const key = threadKey(message)
    const bucket = byThread.get(key)
    if (bucket) bucket.push(message)
    else byThread.set(key, [message])
  }

  const result: Conversation[] = []
  for (const [key, bucket] of byThread) {
    // Joined first, so a long answer is one row and counts as one unread rather
    // than as however many messages it happened to need.
    const messages = joined(bucket)
    const incoming = messages.filter((m) => m.direction === "in").length
    const last = messages[messages.length - 1]
    result.push({
      key,
      peer: last.group ? null : last.peer,
      group: last.group ?? null,
      last,
      at: last.at,
      // Clamped: a thread read and then trimmed should show zero, not negative.
      unread: Math.max(0, incoming - (snapshot.readCount[key] ?? 0)),
    })
  }
  return sortByRecency(result)
}

/** Newest first. */
function sortByRecency(conversations: Conversation[]): Conversation[] {
  return conversations.sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Add the rooms you are in that nobody has spoken in yet.
 *
 * A thread otherwise exists only because a message exists, which is right for a
 * direct chat — there is nothing to show before somebody writes. A room is not
 * like that: you made it, or you paid to get into it, and it is a place whether
 * or not anyone has said anything. Leaving it out of the list until the first
 * message means creating a room and watching it vanish.
 *
 * Takes the least it can about a room so local history stays independent of the
 * relay's types.
 */
export function withRooms(
  conversations: Conversation[],
  rooms: Array<{ id: string; created_at: string }>,
  /** Rooms whose chat was deleted. Hidden until something is said in them. */
  dismissed: Record<string, true> = {},
): Conversation[] {
  const known = new Set(conversations.map((conversation) => conversation.key))
  const quiet = rooms
    .filter((room) => !known.has(room.id) && !dismissed[room.id])
    .map((room) => ({
      key: room.id,
      peer: null,
      group: room.id,
      last: null,
      at: room.created_at,
      unread: 0,
    }))

  return quiet.length === 0 ? conversations : sortByRecency([...conversations, ...quiet])
}

export type { Snapshot }
