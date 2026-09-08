import { useCallback, useEffect, useRef, useState } from "react"

import { ONE_TAB, claim, oneTab } from "@/lib/one-tab"
import type { Room, TabState } from "@/lib/one-tab"

/**
 * Whether this tab is the one that runs the app — see `lib/one-tab` for why
 * there can only be one.
 *
 * `null` while it is being settled, which is the first moment of every load.
 * Nothing should be drawn then: it is a fraction of a second, and drawing the
 * app or the other-tab screen means drawing the wrong one of the two.
 */
export function useOneTab(): { state: TabState | null; take: () => void } {
  // Where there is no lock to hold, this tab is the one. Which is exactly how
  // the app behaved before there was a lock at all — worse than one tab, and
  // no worse than it was.
  const [state, setState] = useState<TabState | null>(() => (usable() ? null : "held"))
  const room = useRef<Room | null>(null)

  useEffect(() => {
    if (!usable()) return
    const channel = new BroadcastChannel(ONE_TAB)
    room.current = channel
    const stop = oneTab(navigator.locks, channel, setState)
    return () => {
      // Closes the channel too, so nothing is posted on it after this.
      stop()
      room.current = null
    }
  }, [])

  const take = useCallback(() => {
    if (room.current) claim(room.current)
  }, [])

  return { state, take }
}

/** Whether this browser has the two things the arrangement is built on. */
function usable(): boolean {
  return typeof BroadcastChannel !== "undefined" && "locks" in navigator
}
