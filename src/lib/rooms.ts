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

/** Rooms by id, as the relay last described them. */
export type Rooms = Record<string, Group>

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
    if (held && held.name === room.name && held.owner === room.owner) continue
    next[room.id] = room
    changed = true
  }
  if (changed) commit(next)
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

export function roomIn(rooms: Rooms, id: string): Group | undefined {
  return rooms[id]
}
