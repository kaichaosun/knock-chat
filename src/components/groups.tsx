import { useState } from "react"
import { DoorOpen, Loader2, Users } from "lucide-react"
import { toast } from "sonner"

import { GroupAvatar } from "@/components/group-avatar"
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
import { formatNim } from "@/lib/postage"
import { removeGroupMember, type Group } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * Every room you are in.
 *
 * Sits beside Contacts for the same reason Contacts sits beside Chats: a thread
 * is a local view of something, and this is the something. Deleting a room's
 * chat tidies this device; leaving the room is a different act with a different
 * consequence, and it belongs on a different screen.
 */
export function Groups({
  groups,
  owner,
  loading,
  onOpen,
  onLeft,
}: {
  groups: Group[]
  owner: string
  /** True until the first read lands, so an empty list is not shown as "none". */
  loading: boolean
  onOpen: (id: string) => void
  /** Called once the relay has confirmed, so the chat goes with the room. */
  onLeft: (id: string) => void
}) {
  const [revealed, setRevealed] = useState<string | null>(null)
  // Held until confirmed: getting back into a room can cost money, and for a
  // room that asks the owner it may not be possible at all.
  const [confirming, setConfirming] = useState<Group | null>(null)
  const [leaving, setLeaving] = useState(false)

  async function leave(group: Group) {
    setLeaving(true)
    try {
      await removeGroupMember(group.id, owner)
      setConfirming(null)
      setRevealed(null)
      onLeft(group.id)
      toast.success(`Left ${group.name}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't leave")
    } finally {
      setLeaving(false)
    }
  }

  if (loading && groups.length === 0) {
    return (
      <div className="text-muted-foreground flex justify-center py-16">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center px-10 py-16 text-center">
        <div className="bg-accent text-accent-foreground flex size-20 items-center justify-center rounded-3xl">
          <Users className="size-9" strokeWidth={1.5} />
        </div>
        <h2 className="mt-6 text-xl font-bold tracking-tight">No groups yet</h2>
        <p className="text-muted-foreground mt-2 max-w-[18rem] text-balance">
          Groups appear here once you make one, or open a link someone sends you.
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-border/60 divide-y px-2 pb-24">
        {groups.map((group) => {
          const mine = group.owner === owner
          return (
            <SwipeRow
              key={group.id}
              actionLabel={`Leave ${group.name}`}
              onAction={() => setConfirming(group)}
              onClick={() => onOpen(group.id)}
              revealed={revealed === group.id}
              onReveal={(open) => setRevealed(open ? group.id : null)}
            >
              <GroupAvatar />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{group.name}</p>
                <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[12px]">
                  <DoorOpen className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {mine ? "Yours" : "Joined"} {relativeTime(group.created_at)}
                    {group.join_price_luna > 0 &&
                      ` · ${formatNim(group.join_price_luna)} NIM to join`}
                  </span>
                </p>
              </div>
            </SwipeRow>
          )
        })}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center">
            <GroupAvatar />
            <DialogTitle className="mt-2">Leave this group?</DialogTitle>
            <p className="text-[15px] font-semibold">{confirming?.name}</p>
            <DialogDescription className="text-balance">
              {confirming?.owner === owner
                ? "You own this group, so you can't leave it."
                : confirming?.requires_approval
                  ? "You'd stop seeing what's said here, and getting back in means asking the owner again."
                  : confirming && confirming.join_price_luna > 0
                    ? `You'd stop seeing what's said here, and getting back in would cost ${formatNim(confirming.join_price_luna)} NIM again.`
                    : "You'd stop seeing what's said here. Your chat with the group is deleted too."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              className="h-11 rounded-2xl"
              onClick={() => setConfirming(null)}
            >
              Stay
            </Button>
            <Button
              variant="destructive"
              disabled={leaving || confirming?.owner === owner}
              className="h-11 rounded-2xl"
              onClick={() => confirming && void leave(confirming)}
            >
              {leaving && <Loader2 className="animate-spin" />}
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
