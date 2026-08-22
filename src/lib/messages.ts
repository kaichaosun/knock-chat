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

export type MessageStatus = "sending" | "sent" | "failed"

export type Message = {
  id: string
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
  /** Highest relay seq already merged, so fetches resume rather than replay. */
  cursor: number
  messages: Message[]
  /** Last time each thread was opened, for the unread count. */
  readAt: Record<string, string>
}

const EMPTY: Snapshot = { cursor: 0, messages: [], readAt: {} }

function storageKey(owner: string): string {
  return `nimiapp:history:${compact(owner)}`
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

/** Merge freshly fetched envelopes, ignoring any already present. */
export function mergeIncoming(snapshot: Snapshot, envelopes: Envelope[]): Snapshot {
  if (envelopes.length === 0) return snapshot

  const known = new Set(snapshot.messages.map((m) => m.id))
  const added: Message[] = []
  for (const envelope of envelopes) {
    const id = `relay:${envelope.seq}`
    if (known.has(id)) continue
    added.push({
      id,
      peer: compact(envelope.from),
      direction: "in",
      body: envelope.body,
      at: envelope.created_at,
      status: "sent",
    })
  }
  if (added.length === 0) return snapshot

  return {
    ...snapshot,
    cursor: Math.max(snapshot.cursor, ...envelopes.map((e) => e.seq)),
    messages: sorted([...snapshot.messages, ...added]),
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

export function markRead(snapshot: Snapshot, peer: string): Snapshot {
  return {
    ...snapshot,
    readAt: { ...snapshot.readAt, [compact(peer)]: new Date().toISOString() },
  }
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
  const byPeer = new Map<string, Message[]>()
  for (const message of snapshot.messages) {
    const bucket = byPeer.get(message.peer)
    if (bucket) bucket.push(message)
    else byPeer.set(message.peer, [message])
  }

  const result: Conversation[] = []
  for (const [peer, messages] of byPeer) {
    const readAt = snapshot.readAt[peer] ?? ""
    result.push({
      peer,
      last: messages[messages.length - 1],
      unread: messages.filter((m) => m.direction === "in" && m.at > readAt).length,
    })
  }
  return result.sort((a, b) => b.last.at.localeCompare(a.last.at))
}

export type { Snapshot }
