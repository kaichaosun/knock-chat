import { useEffect, useState } from "react"

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
 */
export function useContacts(signedIn: boolean, owner: string | null) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!signedIn || !owner) return
    let cancelled = false
    setError("")
    listContacts()
      .then((r) => {
        if (cancelled) return
        remember(r.names)
        setContacts(r.contacts)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load"))
    return () => {
      cancelled = true
    }
  }, [signedIn, owner])

  return { contacts, setContacts, error }
}
