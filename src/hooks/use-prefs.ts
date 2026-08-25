import { useSyncExternalStore } from "react"

import { snapshot, subscribe, type Prefs } from "@/lib/prefs"

/**
 * This device's preferences, re-rendering whatever reads them when one changes.
 *
 * An external store rather than state passed down: a preference is read where
 * it takes effect, which is nowhere near the screen that sets it.
 */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
