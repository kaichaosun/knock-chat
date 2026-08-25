/**
 * Which palette the app paints in.
 *
 * The phone decided this on its own until now, which is right until it is not:
 * Nimiq Pay does not tell a Mini App what theme it is in, so the wallet being
 * dark and the app inside it being light is a thing that happens, and someone
 * reading messages in bed wants dark whatever the clock says.
 *
 * Three values rather than a switch, because a switch has no position that
 * means "whatever the phone is doing". Following the phone is a choice you can
 * make and go back to, so it is one of the three rather than the absence of the
 * other two.
 *
 * Not filed under an identity the way the name directory is: this is about the
 * screen in your hand rather than about who is signed in on it, and switching to
 * a development identity should not change the colour of anything.
 */

const STORAGE_KEY = "knock.theme"

/** The question the browser answers with the phone's own setting. */
const DARK = "(prefers-color-scheme: dark)"

/** What you chose. */
export type Theme = "system" | "light" | "dark"

/** What that choice comes to once the phone has been asked. */
export type Palette = "light" | "dark"

export type Appearance = {
  theme: Theme
  palette: Palette
}

let appearance: Appearance = resolve(read())
let watching = false
const listeners = new Set<() => void>()

/**
 * The stored choice, or `system` for anything else.
 *
 * Storage is user-writable and was not necessarily written by this build, so
 * anything unrecognised means nothing was ever chosen rather than a broken app.
 */
function read(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "light" || stored === "dark" ? stored : "system"
  } catch {
    // Private mode, or no storage at all — nothing was ever chosen.
    return "system"
  }
}

function resolve(theme: Theme): Appearance {
  if (theme !== "system") return { theme, palette: theme }
  const dark = typeof matchMedia === "function" && matchMedia(DARK).matches
  return { theme, palette: dark ? "dark" : "light" }
}

/**
 * Put the resolved palette on the document.
 *
 * The class is what the stylesheet keys on. `color-scheme` is what the browser
 * keys on for everything no stylesheet reaches — the caret, a scrollbar, the
 * inside of a native control — which otherwise stay in the phone's theme and
 * give the override away.
 */
function paint(): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.classList.toggle("dark", appearance.palette === "dark")
  root.style.colorScheme = appearance.palette

  // index.html declares a theme-color per system setting, so the browser's own
  // bar is right before any script runs. Once a choice overrides the system,
  // whichever of them the phone is reading has to be told. Taken from the
  // stylesheet rather than repeated here, so there is one definition of the
  // colour; before the stylesheet lands there is nothing to correct anyway,
  // since no choice can have been made yet.
  if (typeof getComputedStyle !== "function") return
  const background = getComputedStyle(root).getPropertyValue("--background").trim()
  if (!background) return
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute("content", background)
  })
}

function announce(): void {
  for (const listener of listeners) listener()
}

/** Adopt `theme`, repainting and telling subscribers only if something moved. */
function settle(theme: Theme): void {
  const next = resolve(theme)
  if (next.theme === appearance.theme && next.palette === appearance.palette) return
  appearance = next
  paint()
  announce()
}

/** Choose a theme, for the life of this device rather than this session. */
export function choose(theme: Theme): void {
  if (theme === appearance.theme) return
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The screen still changes; it just won't remember after a reload.
  }
  settle(theme)
}

/**
 * Take over the theme for the life of the app.
 *
 * index.html sets the class before the first paint, because a module loading is
 * already too late to avoid a flash of the wrong one. This repeats that work —
 * now that the stylesheet has arrived and the theme-color can be corrected —
 * and then stays to hear about the phone changing its mind.
 */
export function start(): void {
  appearance = resolve(read())
  paint()
  if (watching || typeof matchMedia !== "function") return
  watching = true
  matchMedia(DARK).addEventListener("change", () => settle(appearance.theme))
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The current appearance. Stable between changes, so it is safe to compare by reference. */
export function snapshot(): Appearance {
  return appearance
}
