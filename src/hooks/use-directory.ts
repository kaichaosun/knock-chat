import { useEffect } from "react"

import { compact } from "@/lib/address"
import { rememberAll } from "@/lib/names"
import { MAX_LOOKUP, lookUpNames } from "@/lib/relay"

/**
 * Keep the names of the people on this screen current.
 *
 * Names normally arrive attached to something the app was already asking for —
 * see `lib/names` — and for every list that works, because a list carries the
 * addresses in it. A room's messages are the case it does not cover: a room's
 * details name its first few members, which is who arrived, not who is talking.
 * Somebody who joined after them could rename themselves and go on being called
 * the old thing in every room they spoke in, while a direct chat with them
 * showed the new one, because opening a chat asks about that one address.
 *
 * So the screen asks about the people it is drawing. Once when it opens, and
 * again whenever somebody new appears in it — never for a new message from
 * somebody already here, which is the common case and would be a request per
 * message.
 */
export function useDirectory(addresses: string[]): void {
  // A stable description of who is on screen. Order is the caller's, which for
  // a thread is the order people first spoke, so a new message from somebody
  // already here leaves this untouched and nothing is asked.
  const who = [...new Set(addresses.map(compact))].slice(0, MAX_LOOKUP).join(",")

  useEffect(() => {
    if (!who) return
    let cancelled = false
    const asked = who.split(",")

    lookUpNames(asked)
      .then((answer) => {
        // Believed about absence as well as presence, because this named the
        // addresses it asked about — `rememberAll` says why that matters.
        if (!cancelled) rememberAll(asked, answer.names, answer.faces)
      })
      .catch(() => {
        // Offline, or a relay that predates this route. Names stay as they
        // were, which is what they would have been anyway.
      })

    return () => {
      cancelled = true
    }
  }, [who])
}
