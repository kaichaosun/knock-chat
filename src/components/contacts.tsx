import { useState, type Dispatch, type SetStateAction } from "react"
import { DoorOpen, Loader2, Users } from "lucide-react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { SwipeRow } from "@/components/swipe-row"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { shortenAddress } from "@/lib/address"
import { useNames } from "@/hooks/use-names"
import { forget, labelIn, nameIn, type Directory } from "@/lib/names"
import { removeContact, type Contact } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * A contact's name, or their address when they have not chosen one.
 *
 * The two are set in different type: a name is prose and an address is a code,
 * and rendering an address in a proportional face makes it harder to compare
 * against another one — which is the only thing an address is ever read for.
 */
function PeerName({ address, names }: { address: string; names: Directory }) {
  const name = nameIn(names, address)
  return (
    <p
      className={
        name
          ? "truncate text-[15px] font-semibold"
          : "truncate font-mono text-[13px] font-semibold tracking-tight"
      }
    >
      {name ?? shortenAddress(address)}
    </p>
  )
}

/**
 * Everyone you can write to freely.
 *
 * Read from the relay's channels rather than from local message history, so
 * this is complete even on a device that has never seen a message — which is
 * exactly the case where a chat list is empty and useless.
 */
export function Contacts({
  contacts,
  setContacts,
  error,
  onOpen,
  onRemoved,
}: {
  /** Null until the first read lands. Held above this screen so it survives a
   *  trip to another tab — see [`useContacts`]. */
  contacts: Contact[] | null
  setContacts: Dispatch<SetStateAction<Contact[] | null>>
  error: string
  onOpen: (peer: string) => void
  /** Called once the relay has confirmed, so the chat goes with the channel. */
  onRemoved: (peer: string) => void
}) {
  const names = useNames()
  const [revealed, setRevealed] = useState<string | null>(null)
  // Held until confirmed: removing costs the other side real money to undo, so
  // it does not happen on a gesture alone.
  const [confirming, setConfirming] = useState<Contact | null>(null)

  async function remove(contact: Contact) {
    setConfirming(null)
    setRevealed(null)
    // Drop it now and put it back if the relay disagrees, so the list never
    // sits there looking unchanged while the request is in flight.
    setContacts((current) => current?.filter((c) => c.address !== contact.address) ?? null)
    try {
      await removeContact(contact.address)
      // Only now: the row can be put back if this fails, but messages cannot.
      onRemoved(contact.address)
      forget(contact.address)
      toast.success("Removed. The chat is gone, and they'd have to knock again.")
    } catch (e) {
      setContacts((current) =>
        current ? [contact, ...current].sort((a, b) => b.opened_at.localeCompare(a.opened_at)) : current,
      )
      toast.error(e instanceof Error ? e.message : "Couldn't remove them")
    }
  }

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
    <>
      <ul className="px-2 pb-24">
        {contacts.map((contact) => (
          <SwipeRow
            key={contact.address}
            actionLabel={`Remove ${labelIn(names, contact.address)}`}
            onAction={() => setConfirming(contact)}
            onClick={() => onOpen(contact.address)}
            revealed={revealed === contact.address}
            onReveal={(open) => setRevealed(open ? contact.address : null)}
          >
            <AddressAvatar address={contact.address} />
            <div className="min-w-0 flex-1">
              <PeerName address={contact.address} names={names} />
              {/* The address stays on the row even for someone with a name.
                  This is the screen you would come to in order to check who
                  someone is, and a name alone cannot answer that. */}
              <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[12px]">
                {nameIn(names, contact.address) ? (
                  <span className="truncate font-mono">{shortenAddress(contact.address)}</span>
                ) : (
                  <>
                    <DoorOpen className="size-3.5 shrink-0" />
                    open since {relativeTime(contact.opened_at)}
                  </>
                )}
              </p>
            </div>
          </SwipeRow>
        ))}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center">
            {confirming && <AddressAvatar address={confirming.address} />}
            <DialogTitle className="mt-2">Remove this contact?</DialogTitle>
            {confirming && nameIn(names, confirming.address) && (
              <p className="text-[15px] font-semibold">{nameIn(names, confirming.address)}</p>
            )}
            <p className="font-mono text-[13px] font-semibold tracking-tight">
              {confirming ? shortenAddress(confirming.address) : ""}
            </p>
            <DialogDescription className="text-balance">
              The door shuts both ways. Neither of you can write to the other for free,
              and reaching you again means knocking and paying your postage. Your chat
              with them is deleted too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => setConfirming(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              className="h-11 rounded-2xl"
              onClick={() => confirming && remove(confirming)}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
