import { useEffect, useState } from "react"
import { Check, Loader2, UserRound } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { labelIn, nameIn, remember } from "@/lib/names"
import { listContacts, type Contact } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * Who to bring into a room.
 *
 * Contacts only, and not by design choice — an invite is an ordinary message,
 * so it can only go where a channel already exists. Someone you have never
 * spoken to has to be knocked on first, which is exactly the wall this app is
 * built around and not something a group should route around.
 */
export function PickContactSheet({
  open,
  onOpenChange,
  /** Already in the room. Shown as such rather than hidden, so their absence
   *  from the list is never mistaken for them not being a contact. */
  members,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: string[]
  onPick: (address: string) => void
}) {
  const names = useNames()
  const [contacts, setContacts] = useState<Contact[] | null>(null)
  const [sent, setSent] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setSent([])
    let cancelled = false
    listContacts()
      .then((answer) => {
        if (cancelled) return
        remember(answer.names)
        setContacts(answer.contacts)
      })
      .catch(() => !cancelled && setContacts([]))
    return () => {
      cancelled = true
    }
  }, [open])

  const inRoom = new Set(members)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Add someone</SheetTitle>
          <SheetDescription>
            They'll get an invite in your chat with them, and can see what the group is
            before joining.
          </SheetDescription>
        </SheetHeader>

        <div className="pb-8">
          {contacts === null ? (
            <div className="text-muted-foreground flex justify-center py-10">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <div className="bg-accent text-accent-foreground flex size-16 items-center justify-center rounded-2xl">
                <UserRound className="size-7" strokeWidth={1.5} />
              </div>
              <p className="text-muted-foreground mt-4 text-sm text-balance">
                An invite is an ordinary message, so it can only go to someone you can
                already write to. Knock on them first.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {contacts.map((contact) => {
                const already = inRoom.has(contact.address)
                const done = sent.includes(contact.address)
                return (
                  <li key={contact.address}>
                    <button
                      type="button"
                      disabled={already || done}
                      onClick={() => {
                        setSent((current) => [...current, contact.address])
                        onPick(contact.address)
                      }}
                      className={cn(
                        "flex w-full items-center gap-3.5 rounded-2xl p-2.5 text-left transition-colors",
                        already || done ? "opacity-55" : "active:bg-muted",
                      )}
                    >
                      <AddressAvatar address={contact.address} size="sm" />
                      <span className="min-w-0 flex-1">
                        {nameIn(names, contact.address) && (
                          <span className="block truncate text-[15px] leading-tight font-semibold">
                            {labelIn(names, contact.address)}
                          </span>
                        )}
                        <span className="text-muted-foreground block truncate font-mono text-[12px]">
                          {shortenAddress(contact.address)}
                        </span>
                      </span>
                      {(already || done) && (
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-[12px]">
                          <Check className="size-3.5" />
                          {already ? "In the group" : "Invited"}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
