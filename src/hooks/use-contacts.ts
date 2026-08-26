import { useCallback, useEffect, useRef, useState } from "react"

import { remember } from "@/lib/names"
import { listContacts, type Contact } from "@/lib/relay"

/**
 * Everyone you can write to freely.
 *
 * Held here rather than inside the Contacts screen, because a tab that is not
 * being looked at is not rendered — so a list owned by that screen is thrown
 * away every time you leave it, and every return is a cold start with a
 * spinner. The rooms next door never did that, for no better reason than that
 * their state happened to live a level up. This is that level.
 *
 * Reloaded when the identity changes, which the screen could not see: it was
 * told only whether somebody was signed in, so switching between development
 * identities left one identity's contacts on another one's screen.
 *
 * Read again whenever the list is opened, because the event that adds a
 * contact happens on somebody else's phone: accepting a knock opens the
 * channel from the recipient's side and the relay tells the sender nothing.
 * This used to be covered by accident — the screen refetched every time the
 * tab was opened, back when leaving it threw the list away.
 *
 * Not polled. The one case an event cannot cover is waiting on this screen for
 * a knock to be answered, and a beat nobody can see is a poor answer to that:
 * pulling the list down is the same read, asked for, at the moment somebody
 * wants it.
 */
export function useContacts(
  signedIn: boolean,
  owner: string | null,
  /** Whether the list is on screen. */
  looking: boolean,
) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState("")
  // What is on screen, for the refreshes to be quiet about. Only a first read
  // has nothing to fall back on, so only a first read is worth an error.
  const held = useRef<Contact[] | null>(null)
  // Which identity a read was started for. A request in flight when the
  // identity changes comes back holding somebody else's list.
  const era = useRef(0)

  const read = useCallback(async () => {
    const mine = era.current
    try {
      const { contacts, names } = await listContacts()
      if (mine !== era.current) return
      remember(names)
      held.current = contacts
      setContacts(contacts)
      setError("")
    } catch (failure) {
      if (mine !== era.current || held.current !== null) return
      setError(failure instanceof Error ? failure.message : "Couldn't load")
    }
  }, [])

  // Loaded for whoever is signed in, whether or not anybody is looking yet:
  // that is what makes opening the tab instant rather than a cold start.
  useEffect(() => {
    if (!signedIn || !owner) return

    // Somebody else's contacts are not a stale version of yours; they are the
    // wrong list, and showing them until the right one lands would be worse
    // than showing nothing.
    era.current += 1
    held.current = null
    setContacts(null)
    setError("")

    void read()
  }, [signedIn, owner, read])

  // While it is open: once on opening, and again whenever the app comes back to
  // the front.
  useEffect(() => {
    if (!signedIn || !owner || !looking) return

    let cancelled = false
    const refresh = () => {
      if (!cancelled) void read()
    }

    refresh()
    const onVisible = () => {
      if (!document.hidden) refresh()
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [signedIn, owner, looking, read])

  return { contacts, setContacts, error, refresh: read }
}
