import { useEffect, useSyncExternalStore } from "react"

import { compact } from "@/lib/address"
import { directoryChangedAt, rememberAll, subscribe } from "@/lib/names"
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
 * So the screen asks about the people it is drawing: when it opens, when
 * somebody new appears in it, and when the relay says a name somewhere has
 * changed. Never for a new message from somebody already here, which is the
 * common case and would be a request per message.
 *
 * That third one is what makes this work while somebody is sitting in a room
 * rather than only when they open one. The feed already polls every few seconds
 * and now carries a stamp saying when the directory last moved — see
 * `noteDirectoryChange`. It sits still almost always, so this asks almost never;
 * when it does move, every open screen catches up within a poll.
 */
export function useDirectory(addresses: string[]): void {
  // A stable description of who is on screen. Order is the caller's, which for
  // a thread is the order people first spoke, so a new message from somebody
  // already here leaves this untouched and nothing is asked.
  const who = [...new Set(addresses.map(compact))].slice(0, MAX_LOOKUP).join(",")
  const changed = useSyncExternalStore(subscribe, directoryChangedAt, directoryChangedAt)

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
    // `changed` is not read in here on purpose: what it means is "ask again",
    // and asking again is the whole body above.
  }, [who, changed])
}
