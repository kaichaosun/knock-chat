/**
 * The rooms this device has seen, kept after the relay stops describing them.
 *
 * A room can end while its conversation is still on your phone. The owner
 * disbands it, the relay forgets it, and every screen that draws a room asks
 * the relay what it is called — so the thread would keep its messages and lose
 * its name, its title bar, and the ability to be opened at all.
 *
 * This is the local half of that answer: the last thing the relay said about a
 * room, held so a thread can outlive its room. It is not a cache in front of
 * the relay — the live list always wins while there is one — it is what is left
 * when there is no longer anything to ask.
 *
 * Per identity, like the rest of the local memory, and dropped when the chat is
 * deleted: at that point there is no thread left to title.
 */

import type { Group } from "./relay"

const STORAGE_PREFIX = "knock.rooms."

/**
 * A room as this device last knew it.
 *
 * `gone` is written when the relay answers that the room is not there any more.
 * It is kept rather than derived because "not in your list of rooms" is also
 * true of a room you were removed from, which is still a place — and the two
 * should not look the same.
 */
export type RememberedRoom = Group & { gone?: true }

/** Rooms by id, as the relay last described them. */
export type Rooms = Record<string, RememberedRoom>

let owner: string | null = null
let rooms: Rooms = {}
const listeners = new Set<() => void>()

function storageKey(forOwner: string): string {
  return `${STORAGE_PREFIX}${forOwner.replace(/ /g, "").toUpperCase()}`
}

function announce(): void {
  for (const listener of listeners) listener()
}

/** Point the memory at an identity, loading whatever it already held. */
export function adopt(nextOwner: string | null): void {
  owner = nextOwner
  rooms = nextOwner ? load(storageKey(nextOwner)) : {}
  announce()
}

function load(at: string): Rooms {
  try {
    const raw = localStorage.getItem(at)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const kept: Rooms = {}
    // Storage is user-writable. A room missing the two things every screen
    // draws is worse than no room at all, so it is dropped rather than shown.
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue
      const room = value as Partial<Group>
      if (typeof room.id !== "string" || typeof room.name !== "string") continue
      kept[id] = room as Group
    }
    return kept
  } catch {
    // Malformed or unavailable storage just means nothing was remembered.
    return {}
  }
}

function commit(next: Rooms): void {
  rooms = next
  if (owner) {
    try {
      localStorage.setItem(storageKey(owner), JSON.stringify(next))
    } catch {
      // Quota or private mode — the session keeps working, it just won't persist.
    }
  }
  announce()
}

/**
 * Take in rooms the relay just described.
 *
 * Authoritative for the rooms it mentions and silent about the rest: a list of
 * the rooms you are in says nothing about one you were removed from, and
 * treating it as the whole truth would forget a room the moment you left it —
 * which is exactly when its thread still needs a name.
 */
export function remember(seen: Group[]): void {
  let changed = false
  const next = { ...rooms }
  for (const room of seen) {
    const held = next[room.id]
    if (held?.gone) continue
    if (held && held.name === room.name && held.owner === room.owner) continue
    next[room.id] = room
    changed = true
  }
  if (changed) commit(next)
}

/**
 * Note that a room has ended.
 *
 * Its faces go with it. The mosaic is drawn from the people who were in a room,
 * and a room that no longer exists is not somewhere anybody is — keeping their
 * marks on it would say otherwise. What is left is a name and the fact.
 */
export function markGone(id: string): void {
  const held = rooms[id]
  if (!held || held.gone) return
  const { members: _members, ...rest } = held
  commit({ ...rooms, [id]: { ...rest, gone: true } })
}

/** Drop a room, for when its conversation has gone too. */
export function forget(id: string): void {
  if (!(id in rooms)) return
  const next = { ...rooms }
  delete next[id]
  commit(next)
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** What is remembered. Stable between changes, so it is safe to compare by reference. */
export function snapshot(): Rooms {
  return rooms
}

export function roomIn(rooms: Rooms, id: string): RememberedRoom | undefined {
  return rooms[id]
}
