import { Clock, Loader2, ShieldOff } from "lucide-react"
import { useState } from "react"

import { GroupAvatar } from "@/components/group-avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatNim } from "@/lib/postage"
import type { Group } from "@/lib/relay"

/**
 * The door a link leads to.
 *
 * Shows what the room is and what getting in costs before anything is paid,
 * because the payment is real and is not refunded if the owner then says no.
 * The same reason the knock sheet shows a price before raising the wallet.
 */
export function JoinGroupSheet({
  open,
  onOpenChange,
  group,
  loading,
  onJoin,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null while the link is still being looked up. */
  group: Group | null
  loading: boolean
  onJoin: (group: Group) => Promise<void>
}) {
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    if (!group) return
    setJoining(true)
    setError("")
    try {
      await onJoin(group)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join")
    } finally {
      setJoining(false)
    }
  }

  const free = group?.join_price_luna === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{group ? "Join this group" : "Opening group"}</SheetTitle>
          <SheetDescription>
            {group?.requires_approval
              ? "The owner decides who comes in. You'll be asking, not walking in."
              : "Anyone with this link can get in."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {loading || !group ? (
            <div className="text-muted-foreground flex justify-center py-10">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="bg-muted flex items-center gap-3 rounded-2xl px-4 py-3">
                <GroupAvatar size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] leading-tight font-semibold">{group.name}</p>
                  <p className="text-muted-foreground text-[12px]">
                    {free ? "Free to join" : `${formatNim(group.join_price_luna)} NIM to join`}
                  </p>
                </div>
              </div>

              {group.requires_approval && (
                <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
                  <Clock className="mt-0.5 size-3 shrink-0" />
                  {free
                    ? "Your request goes to the owner to answer."
                    : "You pay now and the owner answers. Saying no doesn't return it — that's what makes asking cost something."}
                </p>
              )}

              <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
                <ShieldOff className="mt-0.5 size-3 shrink-0" />
                Group messages aren't encrypted.
              </p>

              {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

              <Button
                disabled={joining}
                onClick={() => void submit()}
                className="brand-gradient h-13 w-full rounded-2xl text-base"
              >
                {joining && <Loader2 className="animate-spin" />}
                {free
                  ? group.requires_approval
                    ? "Ask to join"
                    : "Join"
                  : `${group.requires_approval ? "Ask to join" : "Join"} — ${formatNim(group.join_price_luna)} NIM`}
              </Button>

              {/* Only where money is involved, and only before it is spent. The
                  owner can end the room whenever they like, and what you paid
                  to get in does not come back — which is a thing to know while
                  deciding, not afterwards. */}
              {!free && (
                <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                  Paid to the owner, and not refundable. If they disband the group, it
                  is not returned.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
