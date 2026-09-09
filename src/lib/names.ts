/**
 * The directory: what to call an address, and what to draw beside it.
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
 * Three layers, kept apart. What someone calls themselves comes from the relay
 * and is replaced whenever they change it; what *you* call them is yours, never
 * leaves this device, and wins wherever both exist. They are stored separately
 * so a relay answer can never quietly overwrite a name you chose, and so the
 * name you overrode is still there to show you what you overrode. The third is
 * the picture an address wears, which travels with the names and is read the
 * same way.
 *
 * Neither a name nor a picture is ever an identity. Nothing here resolves a name back to an address,
 * two people may pick the same one, and the relay does not check that anyone is
 * who they say. Every surface that shows a name to help you recognise someone
 * shows the address that actually identifies them.
 *
 * Pictures are the sharper edge of that, which is why one place deliberately
 * does not learn them: an unanswered knock. A picture is the strongest thing on
 * a row — stronger than the name, far stronger than the address underneath — so
 * somebody arriving unasked is drawn as their identicon until you have let them
 * in. See `use-knocks`.
 */

import { compact, shortenAddress } from "./address"
import { MAX_NAME_LEN, type Faces, type Names } from "./relay"

/** One layer, keyed by [`key`] so spacing and case cannot split an entry. */
type Layer = Record<string, string>

/** All three layers. Read it through [`nameIn`] and [`faceIn`], not by hand. */
export type Directory = {
  /** What each address calls itself, as the relay last reported it. */
  given: Layer
  /** What you decided to call them. This device only — the relay never sees it. */
  chosen: Layer
  /**
   * The picture each address wears, by fingerprint, as the relay last reported.
   *
   * A third layer rather than a field on the other two, because a picture and a
   * name arrive from the same responses but change independently: somebody can
   * rename themselves without touching their picture, and a map keyed by address
   * lets either land without disturbing the other.
   *
   * There is deliberately no `chosen` equivalent. A name you give somebody is a
   * note to yourself that fits in a text field; a picture you give them would be
   * an image library on the device, which is a different feature.
   */
  faces: Layer
}

const STORAGE_PREFIX = "knock.names."
/**
 * Your own names live under their own key rather than in the same object.
 * Keeping them apart is what lets the relay's copy be rewritten wholesale on
 * every answer without any risk of taking your names down with it.
 */
const CHOSEN_PREFIX = "knock.nicknames."
/**
 * Pictures get their own key for the same reason names and nicknames do: the
 * layers are rewritten at different moments and must not be able to take each
 * other down.
 */
const FACES_PREFIX = "knock.faces."

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

/**
 * A picture's fingerprint, as the relay writes one: 64 lower-case hex digits.
 *
 * Checked rather than trusted, because this string is pasted into a URL path.
 * The relay only ever emits this shape, but `VITE_RELAY_URL` can point anywhere
 * and storage is user-writable, so anything else is discarded — a missing
 * picture falls back to the identicon, which is the honest answer for one.
 *
 * Exactly one spelling is accepted, so a picture cannot occupy two cache entries.
 */
const FINGERPRINT = /^[0-9a-f]{64}$/

export function isFingerprint(value: string): boolean {
  return FINGERPRINT.test(value)
}

let owner: string | null = null
let directory: Directory = { given: {}, chosen: {}, faces: {} }
const listeners = new Set<() => void>()

function storageKey(forOwner: string): string {
  return `${STORAGE_PREFIX}${key(forOwner)}`
}

function chosenKey(forOwner: string): string {
  return `${CHOSEN_PREFIX}${key(forOwner)}`
}

function facesKey(forOwner: string): string {
  return `${FACES_PREFIX}${key(forOwner)}`
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
    faces: nextOwner ? load(facesKey(nextOwner), isFingerprint) : {},
  }
  announce()
}

/**
 * Whatever is at `at` that still survives `clean`, keyed the way this file keys.
 *
 * `clean` defaults to the name sanitiser; the faces layer passes the fingerprint
 * check instead. Either way nothing reaches the directory without going through
 * the same gate a fresh relay answer would.
 */
function load(at: string, clean: (raw: string) => string | null | boolean = sanitize): Layer {
  const values: Layer = {}
  try {
    const raw = localStorage.getItem(at)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // Storage is user-writable, and was written by an older build at least
      // once — take only what still looks like what belongs here.
      for (const [address, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value !== "string") continue
        const kept = clean(value)
        if (kept === true) values[key(address)] = value
        else if (typeof kept === "string") values[key(address)] = kept
      }
    }
  } catch {
    // Malformed or unavailable storage just means nothing was known.
  }
  return values
}

/**
 * Take in names that arrived with a list.
 *
 * The map is authoritative for the addresses it mentions and says nothing about
 * any other — an address absent from it has no name *in that response*, which is
 * not the same as having no name. Only `forget` removes an entry, so a knock
 * list cannot wipe a name the contact list taught us.
 */
export function remember(names: Names, faces?: Faces): void {
  const given = { ...directory.given }
  let changed = false
  for (const [address, raw] of Object.entries(names)) {
    const at = key(address)
    const clean = sanitize(raw)
    if (!clean || given[at] === clean) continue
    given[at] = clean
    changed = true
  }

  // Pictures behave exactly as names do here, including the part where a map
  // that does not mention an address says nothing about it. A relay that
  // predates pictures sends no map at all, which is also nothing said.
  const withFaces = { ...directory.faces }
  let facesChanged = false
  for (const [address, fingerprint] of Object.entries(faces ?? {})) {
    const at = key(address)
    if (!isFingerprint(fingerprint) || withFaces[at] === fingerprint) continue
    withFaces[at] = fingerprint
    facesChanged = true
  }

  if (changed || facesChanged) {
    commit({
      ...(changed ? { given } : {}),
      ...(facesChanged ? { faces: withFaces } : {}),
    })
  }
}

/**
 * Take in an answer about a set of addresses that were named in the asking.
 *
 * The difference from [`remember`] is the whole reason this exists: a list says
 * nothing about an address it does not mention, because it never claimed to be
 * about that address. A lookup did. So an address that was asked about and came
 * back without a name has no name, and the one this device has been showing
 * since whenever it last heard is wrong and goes.
 *
 * Which is what makes a rename land. `remember` can only ever replace a name
 * with another name; without this, somebody who cleared theirs would go on
 * being called the old one everywhere it had already been seen.
 *
 * One commit for the lot, so a screenful of people is one re-render.
 */
export function rememberAll(asked: string[], names: Names, faces?: Faces): void {
  const given = { ...directory.given }
  const withFaces = { ...directory.faces }
  let changed = false
  let facesChanged = false

  // Keyed the way this file keys everything, so it does not matter which of
  // them wrote the address grouped and which wrote it compact.
  const answered = new Map<string, string>()
  for (const [address, raw] of Object.entries(names)) answered.set(key(address), raw)
  const worn = new Map<string, string>()
  for (const [address, print] of Object.entries(faces ?? {})) worn.set(key(address), print)

  for (const address of asked) {
    const at = key(address)

    const name = sanitize(answered.get(at) ?? "")
    if (name === null) {
      if (at in given) {
        delete given[at]
        changed = true
      }
    } else if (given[at] !== name) {
      given[at] = name
      changed = true
    }

    const face = worn.get(at) ?? null
    if (face === null || !isFingerprint(face)) {
      if (at in withFaces) {
        delete withFaces[at]
        facesChanged = true
      }
    } else if (withFaces[at] !== face) {
      withFaces[at] = face
      facesChanged = true
    }
  }

  if (changed || facesChanged) {
    commit({
      ...(changed ? { given } : {}),
      ...(facesChanged ? { faces: withFaces } : {}),
    })
  }
}

/**
 * Record one address's name, including the fact that it has none.
 *
 * Used where the relay answered about a single address and so can be believed
 * about the absence too — a reachability check, or saving your own name.
 */
/**
 * Record one address's picture, including the fact that it has none.
 *
 * Used where the relay answered about a single address and so can be believed
 * about the absence too — a reachability check, or setting your own picture.
 */
export function rememberFace(address: string, fingerprint: string | null): void {
  const at = key(address)
  const faces = { ...directory.faces }
  if (fingerprint === null || !isFingerprint(fingerprint)) {
    if (!(at in faces)) return
    delete faces[at]
  } else {
    if (faces[at] === fingerprint) return
    faces[at] = fingerprint
  }
  commit({ faces })
}

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
  if (!(at in directory.given) && !(at in directory.chosen) && !(at in directory.faces)) return
  const given = { ...directory.given }
  const chosen = { ...directory.chosen }
  const faces = { ...directory.faces }
  delete given[at]
  delete chosen[at]
  delete faces[at]
  commit({ given, chosen, faces })
}

function commit(next: Partial<Directory>): void {
  directory = { ...directory, ...next }
  if (owner) {
    // Only the layer that moved: a relay answer arrives far more often than a
    // rename, and it has no business rewriting the file your names are in.
    if (next.given) save(storageKey(owner), next.given)
    if (next.chosen) save(chosenKey(owner), next.chosen)
    if (next.faces) save(facesKey(owner), next.faces)
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
 * The picture `address` wears, or `null` for the ones who wear none.
 *
 * `null` is the ordinary answer, not a failure: an address without a picture has
 * the identicon it always had, which is a face rather than a blank.
 */
export function faceIn(directory: Directory, address: string): string | null {
  return directory.faces[key(address)] ?? null
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
