import { type Dispatch, type SetStateAction } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
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
import { forget, nameIn } from "@/lib/names"
import { removeContact, type Contact } from "@/lib/relay"

/**
 * Shutting a door that was opened.
 *
 * Held until confirmed, because it is not yours to undo: getting back in costs
 * the *other* side postage and a knock, and they are not told that the door
 * closed. A gesture is not enough to spend somebody else's money.
 *
 * Shared by the two places a contact can be dropped from — their row in the
 * list, and their own sheet — and it does the dropping as well as the asking,
 * so the row that vanishes and the chat that goes with it cannot come to differ
 * depending on which screen asked.
 */
export function RemoveContactDialog({
  contact,
  setContacts,
  onOpenChange,
  onRemoved,
}: {
  /** Who is being dropped, or null when nobody is. */
  contact: Contact | null
  setContacts: Dispatch<SetStateAction<Contact[] | null>>
  onOpenChange: (open: boolean) => void
  /** Called once the relay has confirmed, so the chat goes with the channel. */
  onRemoved: (peer: string) => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const called = contact ? nameIn(names, contact.address) : null

  async function remove(dropped: Contact) {
    onOpenChange(false)
    // Gone now, and put back if the relay disagrees, so the list never sits
    // there looking unchanged while the request is in flight.
    setContacts((current) => current?.filter((c) => c.address !== dropped.address) ?? null)
    try {
      await removeContact(dropped.address)
      // Only now: a row can be put back if this fails, but messages cannot.
      onRemoved(dropped.address)
      forget(dropped.address)
      toast.success(t("contacts.removed"))
    } catch (e) {
      setContacts((current) =>
        current
          ? [dropped, ...current].sort((a, b) => b.opened_at.localeCompare(a.opened_at))
          : current,
      )
      toast.error(e instanceof Error ? e.message : t("contacts.removeFailed"))
    }
  }

  return (
    <Dialog open={contact !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-[20rem] rounded-3xl">
        <DialogHeader className="items-center text-center sm:text-center">
          {contact && <AddressAvatar address={contact.address} />}
          <DialogTitle className="mt-2">{t("contacts.removeTitle")}</DialogTitle>
          {called && <p className="text-[15px] font-semibold">{called}</p>}
          <p className="font-mono text-[13px] font-semibold tracking-tight">
            {contact ? shortenAddress(contact.address) : ""}
          </p>
          <DialogDescription className="text-balance">
            {t("contacts.removeBody")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => onOpenChange(false)}>
            {t("contacts.keep")}
          </Button>
          <Button
            variant="destructive"
            className="h-11 rounded-2xl"
            onClick={() => contact && void remove(contact)}
          >
            {t("contacts.remove")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
