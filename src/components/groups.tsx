import { useState } from "react"
import { Loader2, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
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
  const { t } = useTranslation()
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
      toast.error(error instanceof Error ? error.message : t("groups.leaveFailed"))
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
        <h2 className="mt-6 text-xl font-bold tracking-tight">{t("groups.emptyTitle")}</h2>
        <p className="text-muted-foreground mt-2 max-w-[18rem] text-balance">
          {t("groups.emptyBody")}
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="px-2 pb-24">
        {groups.map((group) => {
          const mine = group.owner === owner
          return (
            <SwipeRow
              key={group.id}
              actionLabel={`Leave ${group.name}`}
              onAction={() => setConfirming(group)}
              // The swipe's question, for a pointer that cannot swipe. Offered
              // for a room you own too: leaving is not something an owner can
              // do, and the dialog is where that is said — along with where to
              // go instead. Hiding it would leave an owner with the question
              // and nowhere it is answered.
              onMenu={() => setConfirming(group)}
              menuLabel={t("groups.rowMenu")}
              onClick={() => onOpen(group.id)}
              revealed={revealed === group.id}
              onReveal={(open) => setRevealed(open ? group.id : null)}
            >
              <GroupAvatar members={group.members} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{group.name}</p>
                {/* The door, not the calendar. How old a room is tells nobody
                    anything; what it costs to get in is the thing you check
                    before sending someone the link. */}
                <p className="text-muted-foreground mt-0.5 truncate text-[12px]">
                  {[
                    mine ? t("groups.yours") : null,
                    group.join_price_luna > 0
                      ? t("groups.priceToJoin", { amount: formatNim(group.join_price_luna) })
                      : t("groups.freeToJoin"),
                    group.requires_approval ? t("groups.approvalNeeded") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </SwipeRow>
          )
        })}
      </ul>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center text-center sm:text-center">
            <GroupAvatar members={confirming?.members} />
            <DialogTitle className="mt-2">{t("groups.leaveTitle")}</DialogTitle>
            <p className="text-[15px] font-semibold">{confirming?.name}</p>
            <DialogDescription className="text-balance">
              {confirming?.owner === owner
                ? t("groups.leaveOwner")
                : confirming?.requires_approval
                  ? t("groups.leaveApproval")
                  : confirming && confirming.join_price_luna > 0
                    ? t("groups.leavePaid", { amount: formatNim(confirming.join_price_luna) })
                    : t("groups.leaveFree")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              className="h-11 rounded-2xl"
              onClick={() => setConfirming(null)}
            >
              {t("groups.stay")}
            </Button>
            <Button
              variant="destructive"
              disabled={leaving || confirming?.owner === owner}
              className="h-11 rounded-2xl"
              onClick={() => confirming && void leave(confirming)}
            >
              {leaving && <Loader2 className="animate-spin" />}
              {t("groups.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
