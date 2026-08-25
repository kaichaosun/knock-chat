/**
 * Threads held at the top of the list.
 *
 * A pin is a note to yourself about what matters, so it stays on this device
 * and is never sent anywhere — the same reasoning as the names you choose in
 * [`names`]. It is also per identity: a development identity's list is a
 * different list, and it should not inherit somebody else's priorities.
 *
 * Ordered rather than a set, newest first. Pinning something already pinned
 * moves it back to the top, which makes the gesture mean "this one now" rather
 * than failing silently — and it is the only way to reorder pins without
 * inventing a second gesture for dragging them.
 */

const STORAGE_PREFIX = "knock.pins."

/**
 * How many threads can be held up at once.
 *
 * Not a limit anybody should meet. It exists because the pinned block pushes
 * the unpinned list off the screen one row at a time, and a list where
 * everything is first is a list with no order at all.
 */
export const MAX_PINS = 20

let owner: string | null = null
let pins: string[] = []
const listeners = new Set<() => void>()

function storageKey(forOwner: string): string {
  return `${STORAGE_PREFIX}${forOwner.replace(/ /g, "").toUpperCase()}`
}

function announce(): void {
  for (const listener of listeners) listener()
}

/** Point the list at an identity, loading whatever it already held up. */
export function adopt(nextOwner: string | null): void {
  owner = nextOwner
  pins = nextOwner ? load(storageKey(nextOwner)) : []
  announce()
}

function load(at: string): string[] {
  try {
    const raw = localStorage.getItem(at)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    // Storage is user-writable. Take the strings, drop repeats — a key twice
    // over would draw the same row twice.
    const seen = new Set<string>()
    const keys: string[] = []
    for (const key of parsed) {
      if (typeof key !== "string" || key === "" || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
    return keys.slice(0, MAX_PINS)
  } catch {
    // Malformed or unavailable storage just means nothing was pinned.
    return []
  }
}

function commit(next: string[]): void {
  pins = next
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
 * Hold a thread at the top, above anything pinned before it.
 *
 * Already pinned is not a no-op: it moves back to the front. See the note above
 * about that being the only way to reorder.
 */
export function pin(key: string): void {
  commit([key, ...pins.filter((held) => held !== key)].slice(0, MAX_PINS))
}

/** Let a thread fall back into the list, where its own recency decides. */
export function unpin(key: string): void {
  if (!pins.includes(key)) return
  commit(pins.filter((held) => held !== key))
}

/** Pin what is loose, release what is held. */
export function toggle(key: string): void {
  if (pins.includes(key)) unpin(key)
  else pin(key)
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The pinned keys, newest first. Stable between changes, so safe to compare by reference. */
export function snapshot(): string[] {
  return pins
}

export function isPinned(pins: string[], key: string): boolean {
  return pins.includes(key)
}

/**
 * Pinned first in pin order, everything else in the order it arrived.
 *
 * A pin key naming nothing is skipped rather than cleaned up: a thread can be
 * absent because its messages have not loaded yet, and dropping the pin then
 * would quietly unpin things during a cold start.
 */
export function arrange<T extends { key: string }>(items: T[], pins: string[]): T[] {
  if (pins.length === 0) return items
  const held = new Set(pins)
  const byKey = new Map(items.map((item) => [item.key, item]))
  const top: T[] = []
  for (const key of pins) {
    const item = byKey.get(key)
    if (item) top.push(item)
  }
  return [...top, ...items.filter((item) => !held.has(item.key))]
}
