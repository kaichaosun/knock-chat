import { Copy, MessageSquare, UserMinus } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { compact, formatAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"

/**
 * Somebody in a room.
 *
 * Deliberately not the contact sheet. Being in a room together is not knowing
 * somebody: there is no channel, which is exactly why writing to them costs
 * their postage — and the private name you give a contact belongs where you
 * have one, not to a stranger who happens to be standing in the same room.
 *
 * So this says who they are and what can be done about it, and nothing else.
 */
export function MemberSheet({
  address,
  onOpenChange,
  you,
  roomOwner,
  mine,
  onCopy,
  onOpenChat,
  onRemove,
}: {
  /** Who is being looked at, or null when nobody is. */
  address: string | null
  onOpenChange: (open: boolean) => void
  /** Your own address, so your row offers nothing to do to yourself. */
  you: string
  /** Whoever owns the room, who cannot be shown out of it. */
  roomOwner: string
  /** Whether you own the room, which is who may show anybody out. */
  mine: boolean
  onCopy: (address: string) => void
  onOpenChat: (address: string) => void
  /** Absent where removing is not on offer — a room you do not own. */
  onRemove?: (address: string) => void
}) {
  const names = useNames()
  const called = address ? nameIn(names, address) : null

  // Compared without spaces, because the two forms of an address both arrive
  // here: a member list carries what the relay published, while a name over a
  // message carries what local history stored, which is compact. Comparing the
  // strings as they came offered the owner a way to remove themselves.
  const same = (one: string, other: string) => compact(one) === compact(other)

  // Nothing to do to yourself, and nothing to be done to the owner: there is
  // no way out of a room you own, which is what disbanding is for.
  const isOwner = address !== null && same(address, roomOwner)
  const canWrite = address !== null && !same(address, you)
  const canRemove = mine && address !== null && !isOwner && onRemove !== undefined

  return (
    <Sheet open={address !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          {/* What they are here, said once. A room has one owner and everybody
              else, so the title carries it rather than a line underneath
              repeating what the title could have said. */}
          <SheetTitle>{isOwner ? "Owner" : "Member"}</SheetTitle>
        </SheetHeader>

        {address && (
          <div className="space-y-7 pb-8">
            {/* Laid out as the contact sheet lays it out, because it is the
                same question — who is this — asked somewhere else. The address
                leads, beside the face made from it: those two are the only
                things true of somebody rather than chosen about them, and it
                is unshortened because this is where you come to be sure. */}
            <section className="flex items-center gap-3.5">
              <AddressAvatar address={address} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-[11px]">Address</p>
                <p className="select-value font-mono text-[13px] leading-relaxed font-semibold wrap-anywhere">
                  {formatAddress(address)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onCopy(formatAddress(address))}
                  className="mt-2 h-8 rounded-lg"
                >
                  <Copy className="size-3.5" />
                  Copy
                </Button>
              </div>
            </section>

            <section>
              {/* Just "Name". The contact sheet says "Original name" because it
                  has a second one to tell it apart from — the private one you
                  give somebody you have a channel with. Here there is only the
                  one they publish. */}
              <h3 className="text-sm font-semibold">Name</h3>
              {called ? (
                <p className="text-muted-foreground mt-1.5 text-[15px] font-semibold">{called}</p>
              ) : (
                <p className="text-muted-foreground mt-1.5 text-[15px]">Not set</p>
              )}
            </section>

            {(canWrite || canRemove) && (
              <section className="space-y-1 border-t pt-4">
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => onOpenChat(address)}
                    className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
                  >
                    <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-2xl">
                      <MessageSquare className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold">Open chat</span>
                      <span className="text-muted-foreground block text-[13px] leading-snug">
                        Write to them privately.
                      </span>
                    </span>
                  </button>
                )}

                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove?.(address)}
                    className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
                  >
                    <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-2xl">
                      <UserMinus className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0">
                      <span className="text-destructive block text-[15px] font-semibold">
                        Remove from group
                      </span>
                      <span className="text-muted-foreground block text-[13px] leading-snug">
                        They stop getting new messages.
                      </span>
                    </span>
                  </button>
                )}
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
