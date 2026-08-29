import { useSyncExternalStore } from "react"

/**
 * Whether there is room to show the list and a thread at the same time.
 *
 * 64rem because that is what the two panes need before either has to give
 * something up: a list narrower than about 22rem starts truncating the names
 * and previews that are the whole reason to look at it, and a thread narrower
 * than about 40rem sets message lines so short the eye travels more than it
 * reads. Below that the app stays what it is on a phone — one thing at a time,
 * a thread covering the list — because a cramped two-pane layout is worse than
 * an honest one-pane one.
 *
 * Matches Tailwind's `lg`, so a component can hide something with `lg:hidden`
 * and be certain it agrees with whatever this decided.
 */
const WIDE = "(min-width: 64rem)"

function subscribe(onChange: () => void): () => void {
  if (typeof matchMedia !== "function") return () => {}
  const query = matchMedia(WIDE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}

function snapshot(): boolean {
  return typeof matchMedia === "function" && matchMedia(WIDE).matches
}

/**
 * A boolean, so React re-renders when the window crosses the line.
 *
 * An external store rather than state and a resize listener: the browser
 * already knows when the answer changes and says so once, where a resize
 * handler fires for every pixel of a drag and computes the same answer each
 * time.
 */
export function useWide(): boolean {
  // Narrow before the first measurement, which is what a phone is.
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
