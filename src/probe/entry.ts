/**
 * Ways to reach the probe screen — throwaway, alongside the rest of `src/probe`.
 *
 * Whether Nimiq Pay preserves a query string is one of the things we are trying
 * to find out, so the probes cannot be reachable only by query string. Every
 * URL shape is accepted, and `useSecretTap` provides a route that needs no URL
 * support at all.
 */

import { useCallback, useRef } from "react"

/** True if any URL form asks for the probes: `?probe`, `#probe`, or `/probe`. */
export function probeRequested(): boolean {
  const { search, hash, pathname } = window.location
  return (
    new URLSearchParams(search).has("probe") ||
    hash.replace(/^#/, "").split("?")[0] === "probe" ||
    pathname.replace(/\/+$/, "").endsWith("/probe")
  )
}

/** Taps needed, and how long the streak survives between them. */
const TAPS_REQUIRED = 5
const STREAK_TIMEOUT_MS = 1500

/**
 * Fires after `TAPS_REQUIRED` quick taps. The last resort for opening the
 * probes when the host app rewrites or strips the URL.
 */
export function useSecretTap(onTrigger: () => void) {
  const count = useRef(0)
  const timer = useRef<number | undefined>(undefined)

  return useCallback(() => {
    window.clearTimeout(timer.current)
    count.current += 1

    if (count.current >= TAPS_REQUIRED) {
      count.current = 0
      onTrigger()
      return
    }

    timer.current = window.setTimeout(() => {
      count.current = 0
    }, STREAK_TIMEOUT_MS)
  }, [onTrigger])
}

export { TAPS_REQUIRED }
