/**
 * Preferences about this device.
 *
 * Not about who is signed in, and never sent anywhere — the same reasoning as
 * [`theme`], which is the other thing on this shelf. A development identity
 * should not have its own idea of where the buttons are.
 *
 * Kept as one object under one key rather than a key per preference, so a
 * second one costs a field instead of a file. Everything unrecognised in
 * storage falls back to the default: storage is user-writable, and a build
 * older than this one may have written a preference this one has dropped.
 */

import { isLanguage, type LanguageChoice } from "@/i18n"

const STORAGE_KEY = "knock.prefs"

/**
 * Where the button that starts a new chat sits.
 *
 * Floating puts it within a thumb's reach and over the last rows of the list;
 * in the header it covers nothing and matches the other two tabs. Neither is
 * right for everyone, which is the whole reason this is a preference.
 */
export type ComposeSpot = "floating" | "header"

export type Prefs = {
  compose: ComposeSpot
  /**
   * Which language to speak, or `host` to take the answer from Nimiq Pay and
   * the device. A device preference rather than a profile one for the same
   * reason as the rest of this file: it is about this screen, not about you.
   */
  language: LanguageChoice
  /**
   * Whether to be told about messages that arrive while you are looking
   * elsewhere.
   *
   * Off until asked for, and only half the answer: the browser's own
   * permission is the other half, and this being on without that granted
   * means nothing can be shown — see `lib/notify`.
   */
  notify: boolean
  /**
   * Whether to show what a link in a message leads to.
   *
   * On, and worth understanding before turning it off — or leaving it on. The
   * card is fetched by the relay rather than by this device: the site is never
   * told who is reading, and a room of readers costs it one visit. What the
   * relay learns in exchange is which link is about to be read, which is less
   * than it would learn from a message and far less than the site learns the
   * moment anybody taps through. `lib/legal` says all of this to the person
   * who has to decide.
   */
  previews: boolean
}

const DEFAULTS: Prefs = {
  compose: "floating",
  language: "host",
  notify: false,
  previews: true,
}

let prefs: Prefs = DEFAULTS
const listeners = new Set<() => void>()

function read(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return DEFAULTS
    const stored = parsed as Record<string, unknown>
    return {
      compose: stored.compose === "header" ? "header" : DEFAULTS.compose,
      language: isLanguage(stored.language) ? stored.language : DEFAULTS.language,
      notify: stored.notify === true,
      // Anything but a stored `false` is the default, so a device that has
      // never been asked gets the card.
      previews: stored.previews !== false,
    }
  } catch {
    // Private mode, no storage, or something that is not JSON.
    return DEFAULTS
  }
}

function announce(): void {
  for (const listener of listeners) listener()
}

/** Load what this device already decided. Called once, before the first render. */
export function start(): void {
  prefs = read()
  announce()
}

/** Change one or more preferences, for the life of this device. */
export function update(next: Partial<Prefs>): void {
  const merged = { ...prefs, ...next }
  if ((Object.keys(merged) as (keyof Prefs)[]).every((key) => merged[key] === prefs[key])) return
  prefs = merged
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // The screen still changes; it just won't remember after a reload.
  }
  announce()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current preferences. Stable between changes, so it is safe to compare by reference. */
export function snapshot(): Prefs {
  return prefs
}
