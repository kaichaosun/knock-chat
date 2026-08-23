import { useSyncExternalStore } from "react"

import { snapshot, subscribe, type Directory } from "@/lib/names"

/**
 * The display-name directory, re-rendering whatever reads it when a name lands.
 *
 * An external store rather than state passed down: names arrive in three
 * unrelated places — the contact list, the knock poll, a reachability check —
 * and threading a setter into each of them would put the plumbing in every
 * component between here and there.
 */
export function useNames(): Directory {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
