import { useEffect, useState } from "react"
import { DoorOpen, Loader2, Users } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { shortenAddress } from "@/lib/address"
import { listContacts, type Contact } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * Everyone you can write to freely.
 *
 * Read from the relay's channels rather than from local message history, so
 * this is complete even on a device that has never seen a message — which is
 * exactly the case where a chat list is empty and useless.
 */
export function Contacts({
  signedIn,
  onOpen,
}: {
  signedIn: boolean
  onOpen: (peer: string) => void
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    listContacts()
      .then((r) => !cancelled && setContacts(r.contacts))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't load"))
    return () => {
      cancelled = true
    }
  }, [signedIn])

  if (error) {
    return <p className="text-destructive px-6 py-10 text-center text-sm text-balance">{error}</p>
  }

  if (contacts === null) {
    return (
      <div className="text-muted-foreground flex justify-center py-16">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center px-10 py-16 text-center">
        <div className="bg-accent text-accent-foreground flex size-20 items-center justify-center rounded-3xl">
          <Users className="size-9" strokeWidth={1.5} />
        </div>
        <h2 className="mt-6 text-xl font-bold tracking-tight">No one yet</h2>
        <p className="text-muted-foreground mt-2 max-w-[17rem] text-balance">
          People appear here once you've knocked and been let in, or answered a knock of
          your own.
        </p>
      </div>
    )
  }

  return (
    <ul className="divide-border/60 divide-y px-2 pb-24">
      {contacts.map((contact) => (
        <li key={contact.address}>
          <button
            type="button"
            onClick={() => onOpen(contact.address)}
            className="active:bg-muted/70 flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left transition-colors"
          >
            <AddressAvatar address={contact.address} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] font-semibold tracking-tight">
                {shortenAddress(contact.address)}
              </p>
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[12px]">
                <DoorOpen className="size-3.5" />
                open since {relativeTime(contact.opened_at)}
              </p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
