import { useState, type Dispatch, type SetStateAction } from "react"
import { Copy, DoorOpen, Loader2, Trash2, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
import { RemoveContactDialog } from "@/components/remove-contact-dialog"
import { SwipeRow } from "@/components/swipe-row"
import { copyText } from "@/lib/clipboard"
import { formatAddress, shortenAddress } from "@/lib/address"
import { useNames } from "@/hooks/use-names"
import { labelIn, nameIn, type Directory } from "@/lib/names"
import type { Contact } from "@/lib/relay"
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
  selectedAddress,
}: {
  /** Null until the first read lands. Held above this screen so it survives a
   *  trip to another tab — see [`useContacts`]. */
  contacts: Contact[] | null
  setContacts: Dispatch<SetStateAction<Contact[] | null>>
  error: string
  onOpen: (peer: string) => void
  /** Called once the relay has confirmed, so the chat goes with the channel. */
  onRemoved: (peer: string) => void
  /** The address currently selected, or null if none. */
  selectedAddress?: string | null
}) {
  const { t } = useTranslation()
  const names = useNames()
  const [revealed, setRevealed] = useState<string | null>(null)
  /** Who is being dropped, once asked about. See `RemoveContactDialog`. */
  const [confirming, setConfirming] = useState<Contact | null>(null)
  /** Whose actions are open. The same menu the chat list has. */
  const [holding, setHolding] = useState<Contact | null>(null)

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
        <h2 className="mt-6 text-xl font-bold tracking-tight">{t("contacts.emptyTitle")}</h2>
        <p className="text-muted-foreground mt-2 max-w-[17rem] text-balance">
          {t("contacts.emptyBody")}
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
            // The swipe reveals the one thing it has room for; holding opens
            // everything, which is how the chat list works and now how this one
            // does.
            onLongPress={() => setHolding(contact)}
            onMenu={() => setHolding(contact)}
            menuLabel={t("contacts.rowMenu")}
            onClick={() => onOpen(contact.address)}
            revealed={revealed === contact.address}
            onReveal={(open) => setRevealed(open ? contact.address : null)}
            selected={selectedAddress === contact.address}
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

      <AttachMenu
        open={holding !== null}
        onOpenChange={(open) => !open && setHolding(null)}
        title={holding ? labelIn(names, holding.address) : ""}
        actions={
          holding
            ? [
                {
                  icon: Copy,
                  label: t("contacts.copyAddress"),
                  description: t("contacts.copyAddressNote"),
                  onSelect: () => {
                    void copyText(formatAddress(holding.address)).then((ok) =>
                      toast[ok ? "success" : "info"](
                        ok ? t("app.addressCopied") : t("app.copyFailed"),
                      ),
                    )
                  },
                },
                {
                  icon: Trash2,
                  label: t("contacts.removeContact"),
                  description: t("contacts.removeContactNote"),
                  tone: "destructive" as const,
                  // Choosing it here is not the removal — the dialog is, and
                  // the swipe's own action goes through the same one.
                  onSelect: () => setConfirming(holding),
                },
              ]
            : []
        }
      />

      <RemoveContactDialog
        contact={confirming}
        setContacts={setContacts}
        onOpenChange={(open) => {
          if (open) return
          setConfirming(null)
          setRevealed(null)
        }}
        onRemoved={onRemoved}
      />
    </>
  )
}
