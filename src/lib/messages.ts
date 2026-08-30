/**
 * Local message history.
 *
 * The relay only holds messages *for* a recipient, so a sender never gets its
 * own messages back. The client therefore keeps the full thread locally and
 * merges incoming envelopes into it. That means history lives on the device in
 * this slice — clearing site data clears the conversation.
 */

import { compact } from "./address"
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
    return { ...EMPTY, ...parsed }
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
  cursor: string,
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
      direction: "in",
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
  return messages.filter((m) => threadKey(m) === thread && m.direction === "in").length
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
  return snapshot.messages.filter((m) => threadKey(m) === key)
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
  for (const [key, messages] of byThread) {
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
