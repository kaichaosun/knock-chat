/**
 * The display-name directory.
 *
 * Names arrive attached to things the app already asks for — the contact list,
 * the knock list, a reachability check — rather than from a lookup of their own.
 * They land here, and every screen that draws an address reads from here, so a
 * name learned on one screen is already known on the next.
 *
 * Held for the session and mirrored into storage, because a name is worth
 * showing immediately on a cold start rather than a network round trip later. A
 * cached name can be out of date; that is the trade, and the address beside it
 * is what stays true.
 *
 * Two layers, kept apart. What someone calls themselves comes from the relay and
 * is replaced whenever they change it; what *you* call them is yours, never
 * leaves this device, and wins wherever both exist. They are stored separately
 * so a relay answer can never quietly overwrite a name you chose, and so the
 * name you overrode is still there to show you what you overrode.
 *
 * A name is never an identity. Nothing here resolves a name back to an address,
 * two people may pick the same one, and the relay does not check that anyone is
 * who they say. Every surface that shows a name to help you recognise someone
 * shows the address that actually identifies them.
 */

import { compact, shortenAddress } from "./address"
import { MAX_NAME_LEN, type Names } from "./relay"

/** One layer of names, keyed by [`key`] so spacing and case cannot split an entry. */
type Layer = Record<string, string>

/** Both layers of the directory. Read it through [`nameIn`] rather than by hand. */
export type Directory = {
  /** What each address calls itself, as the relay last reported it. */
  given: Layer
  /** What you decided to call them. This device only — the relay never sees it. */
  chosen: Layer
}

const STORAGE_PREFIX = "knock.names."
/**
 * Your own names live under their own key rather than in the same object.
 * Keeping them apart is what lets the relay's copy be rewritten wholesale on
 * every answer without any risk of taking your names down with it.
 */
const CHOSEN_PREFIX = "knock.nicknames."

/**
 * The directory key for an address.
 *
 * Addresses reach the app grouped, compact and occasionally lower-case — typed
 * into the knock field, read back from storage, quoted by a relay. All of those
 * are the same address, and keying on the raw string would file them as
 * different people.
 */
function key(address: string): string {
  return compact(address).toUpperCase()
}

/**
 * Control characters, which stand where a space was meant to be.
 *
 * A newline or a tab separates words, so it becomes a space. Deleting it would
 * run the words together, and "Nimiq\nSupport" collapsing into "NimiqSupport"
 * is a different name rather than a tidied one.
 */
// oxlint-disable-next-line no-control-regex -- matching them is the point
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/g

/**
 * Characters that take up no width, or that reorder the text around them.
 *
 * These are deleted outright, because that is what they were doing anyway: a
 * zero-width space exists to split a word without looking like it, so removing
 * it restores the word rather than breaking it.
 *
 * The relay refuses a name containing either kind, but the relay is not the last
 * word: `VITE_RELAY_URL` can point anywhere, and a deployment can be older than
 * this build. Rendering is where the deception would actually happen, so the
 * check happens here too — stripping rather than refusing, since the question
 * here is only what is safe to paint, not what is honest to store.
 */
const INVISIBLE =
  /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\uFFF9-\uFFFB]/g

/**
 * Make a name from the relay safe to draw: no invisible or reordering
 * characters, no runs of whitespace, no more than the agreed length.
 *
 * Returns `null` for anything that is left with nothing to show.
 */
export function sanitize(raw: string): string | null {
  const clean = raw
    .replace(CONTROL, " ")
    .replace(INVISIBLE, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
  if (!clean) return null
  // Sliced by character rather than by `length`, which counts UTF-16 units and
  // would cut a surrogate pair in half.
  return [...clean].slice(0, MAX_NAME_LEN).join("")
}

let owner: string | null = null
let directory: Directory = { given: {}, chosen: {} }
const listeners = new Set<() => void>()

function storageKey(forOwner: string): string {
  return `${STORAGE_PREFIX}${key(forOwner)}`
}

function chosenKey(forOwner: string): string {
  return `${CHOSEN_PREFIX}${key(forOwner)}`
}

function announce(): void {
  for (const listener of listeners) listener()
}

/**
 * Point the directory at an identity, loading whatever it already knew.
 *
 * Kept per owner because a directory is a view from somewhere: switching to a
 * development identity should not inherit the names the previous one had learnt.
 */
export function adopt(nextOwner: string | null): void {
  owner = nextOwner
  directory = {
    given: nextOwner ? load(storageKey(nextOwner)) : {},
    chosen: nextOwner ? load(chosenKey(nextOwner)) : {},
  }
  announce()
}

/** Whatever is at `at` that still looks like a name, keyed the way this file keys. */
function load(at: string): Layer {
  const names: Layer = {}
  try {
    const raw = localStorage.getItem(at)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Storage is user-writable, and was written by an older build at least
      // once — take only what still looks like a name.
      for (const [address, name] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof name !== "string") continue
        const clean = sanitize(name)
        if (clean) names[key(address)] = clean
      }
    }
  } catch {
    // Malformed or unavailable storage just means nothing was known.
  }
  return names
}

/**
 * Take in names that arrived with a list.
 *
 * The map is authoritative for the addresses it mentions and says nothing about
 * any other — an address absent from it has no name *in that response*, which is
 * not the same as having no name. Only `forget` removes an entry, so a knock
 * list cannot wipe a name the contact list taught us.
 */
export function remember(names: Names): void {
  let changed = false
  const given = { ...directory.given }
  for (const [address, raw] of Object.entries(names)) {
    const at = key(address)
    const clean = sanitize(raw)
    if (!clean || given[at] === clean) continue
    given[at] = clean
    changed = true
  }
  if (changed) commit({ given })
}

/**
 * Record one address's name, including the fact that it has none.
 *
 * Used where the relay answered about a single address and so can be believed
 * about the absence too — a reachability check, or saving your own name.
 */
export function rememberOne(address: string, name: string | null): void {
  const at = key(address)
  const clean = name === null ? null : sanitize(name)
  const given = { ...directory.given }
  if (clean === null) {
    if (!(at in given)) return
    delete given[at]
  } else {
    if (given[at] === clean) return
    given[at] = clean
  }
  commit({ given })
}

/**
 * Set what you call someone, or clear it with `null` to fall back to theirs.
 *
 * Local by design: this is a note to yourself about who an address is, and
 * sending it anywhere would turn a private label into a claim about somebody.
 * It also means a rename is instant and cannot fail — there is nothing to ask.
 */
export function rename(address: string, name: string | null): void {
  const at = key(address)
  const clean = name === null ? null : sanitize(name)
  const chosen = { ...directory.chosen }
  if (clean === null) {
    if (!(at in chosen)) return
    delete chosen[at]
  } else {
    if (chosen[at] === clean) return
    chosen[at] = clean
  }
  commit({ chosen })
}

/**
 * Drop an address, for when there is no longer any relationship to name.
 *
 * Takes your own name for them with it. Removing a contact undoes the reason
 * you had for naming them, and leaving the name behind would put it back on the
 * screen the day they knocked again.
 */
export function forget(address: string): void {
  const at = key(address)
  if (!(at in directory.given) && !(at in directory.chosen)) return
  const given = { ...directory.given }
  const chosen = { ...directory.chosen }
  delete given[at]
  delete chosen[at]
  commit({ given, chosen })
}

function commit(next: Partial<Directory>): void {
  directory = { ...directory, ...next }
  if (owner) {
    // Only the layer that moved: a relay answer arrives far more often than a
    // rename, and it has no business rewriting the file your names are in.
    if (next.given) save(storageKey(owner), next.given)
    if (next.chosen) save(chosenKey(owner), next.chosen)
  }
  announce()
}

function save(at: string, names: Layer): void {
  try {
    localStorage.setItem(at, JSON.stringify(names))
  } catch {
    // Quota or private mode — the session keeps working, it just won't persist.
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current directory. Stable between changes, so it is safe to compare by reference. */
export function snapshot(): Directory {
  return directory
}

/**
 * What to call `address`: your name for them, else theirs, else `null`.
 *
 * Yours wins because you wrote it down after knowing who they were, and theirs
 * can change under you at any time — that is the whole reason to be able to
 * write one down.
 */
export function nameIn(directory: Directory, address: string): string | null {
  const at = key(address)
  return directory.chosen[at] ?? directory.given[at] ?? null
}

/** What `address` calls itself, ignoring any name you gave them. */
export function givenNameIn(directory: Directory, address: string): string | null {
  return directory.given[key(address)] ?? null
}

/** What you call `address`, or `null` if you have not named them. */
export function chosenNameIn(directory: Directory, address: string): string | null {
  return directory.chosen[key(address)] ?? null
}

/**
 * The one line to show when there is room for only one.
 *
 * Falls back to the shortened address, which is what every screen showed before
 * anyone had a name, so a nameless address is never labelled "unknown" or left
 * blank — it is labelled with the thing that identifies it.
 */
export function labelIn(directory: Directory, address: string): string {
  return nameIn(directory, address) ?? shortenAddress(address)
}
