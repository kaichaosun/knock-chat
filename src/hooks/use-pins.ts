import { useSyncExternalStore } from "react"

import { snapshot, subscribe } from "@/lib/pins"

/**
 * The pinned thread keys, newest first.
 *
 * An external store rather than state passed down, for the same reason the name
 * directory is one: the gesture that changes it is in a list row, and the thing
 * that reads it is the list itself.
 */
export function usePins(): string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
