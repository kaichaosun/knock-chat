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

/**
 * An envelope after decryption: the body is plaintext, or the message is
 * flagged as one this device cannot open.
 */
export type OpenedEnvelope = Omit<Envelope, "body"> & {
  body: string
  undecryptable?: boolean
}

export type MessageStatus = "sending" | "sent" | "failed"

export type Message = {
  id: string
  /**
   * Set when a message arrived but could not be decrypted — usually because it
   * was sent to a key this device has since replaced. Shown as such rather than
   * hidden, so history has no silent gaps.
   */
  undecryptable?: boolean
  /** The other party, whichever direction the message went. */
  peer: string
  direction: "in" | "out"
  body: string
  at: string
  status: MessageStatus
}

export type Conversation = {
  peer: string
  last: Message
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
   * Threads hidden from the chat list.
   *
   * Closing a chat is tidying, not deleting: the channel stays open on the
   * relay, the messages stay on the device, and a new message brings the thread
   * straight back. Anything else would make "close" a trap.
   */
  closed?: string[]
}

const EMPTY: Snapshot = { cursor: null, messages: [], readCount: {}, closed: [] }

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
      direction: "in",
      body: envelope.body,
      at: envelope.created_at,
      status: "sent",
      ...(envelope.undecryptable ? { undecryptable: true } : {}),
    })
  }

  if (added.length === 0 && snapshot.cursor === cursor) return snapshot

  // Something arriving in a closed thread reopens it — a closed chat is not a
  // mute, and silently swallowing new mail would lose messages.
  const revived = new Set(added.map((m) => m.peer))
  const closed = (snapshot.closed ?? []).filter((peer) => !revived.has(peer))

  return {
    ...snapshot,
    cursor,
    closed,
    messages: added.length > 0 ? sorted([...snapshot.messages, ...added]) : snapshot.messages,
  }
}

export function appendOutgoing(snapshot: Snapshot, message: Message): Snapshot {
  return { ...snapshot, messages: sorted([...snapshot.messages, message]) }
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
export function markRead(snapshot: Snapshot, peer: string): Snapshot {
  const key = compact(peer)
  const seen = incomingCount(snapshot.messages, key)
  if (snapshot.readCount[key] === seen) return snapshot

  return { ...snapshot, readCount: { ...snapshot.readCount, [key]: seen } }
}

/** Hide a thread from the chat list. */
export function closeThread(snapshot: Snapshot, peer: string): Snapshot {
  const key = compact(peer)
  const closed = snapshot.closed ?? []
  if (closed.includes(key)) return snapshot
  return { ...snapshot, closed: [...closed, key] }
}

/** Bring a closed thread back — explicitly, or because something arrived. */
export function reopenThread(snapshot: Snapshot, peer: string): Snapshot {
  const key = compact(peer)
  const closed = snapshot.closed ?? []
  if (!closed.includes(key)) return snapshot
  return { ...snapshot, closed: closed.filter((c) => c !== key) }
}

function incomingCount(messages: Message[], peer: string): number {
  return messages.filter((m) => m.peer === peer && m.direction === "in").length
}

function sorted(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.at.localeCompare(b.at))
}

export function threadWith(snapshot: Snapshot, peer: string): Message[] {
  const key = compact(peer)
  return snapshot.messages.filter((m) => m.peer === key)
}

/** One entry per peer, most recently active first. */
export function conversations(snapshot: Snapshot): Conversation[] {
  const closed = new Set(snapshot.closed ?? [])
  const byPeer = new Map<string, Message[]>()
  for (const message of snapshot.messages) {
    if (closed.has(message.peer)) continue
    const bucket = byPeer.get(message.peer)
    if (bucket) bucket.push(message)
    else byPeer.set(message.peer, [message])
  }

  const result: Conversation[] = []
  for (const [peer, messages] of byPeer) {
    const incoming = messages.filter((m) => m.direction === "in").length
    result.push({
      peer,
      last: messages[messages.length - 1],
      // Clamped: a thread read and then trimmed should show zero, not negative.
      unread: Math.max(0, incoming - (snapshot.readCount[peer] ?? 0)),
    })
  }
  return result.sort((a, b) => b.last.at.localeCompare(a.last.at))
}

export type { Snapshot }
