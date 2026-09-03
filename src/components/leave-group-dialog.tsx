import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { GroupAvatar } from "@/components/group-avatar"
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
 * Walking out of a room.
 *
 * Held until confirmed, because getting back in is not always possible: a room
 * that charges will charge again, and one that asks its owner may simply say
 * no. What the dialog says turns on which of those it is, so the warning is the
 * true one rather than a general one.
 *
 * Shared by the two places a room can be left from — its row in the list, and
 * its own details sheet — for the same reason `RemoveMemberDialog` is shared:
 * what somebody is told about a consequence should not depend on which screen
 * they happened to be looking at.
 *
 * It does the leaving as well as the asking. There is one way out of a room and
 * one thing it costs, so having each caller make the call again is how the two
 * come to disagree about what happens after it.
 */
export function LeaveGroupDialog({
  group,
  owner,
  onOpenChange,
  onLeft,
}: {
  /** The room being left, or null when nothing is. */
  group: Group | null
  /** Your address — the member being removed is you. */
  owner: string
  onOpenChange: (open: boolean) => void
  /** Called once the relay has confirmed, so the chat can go with the room. */
  onLeft: (id: string) => void
}) {
  const { t } = useTranslation()
  const [leaving, setLeaving] = useState(false)
  // An owner cannot leave their own room; they end it instead. The dialog still
  // opens for them, because the question is theirs to ask and this is where it
  // is answered — see the note on the row that opens it.
  const owned = group?.owner === owner

  async function leave(room: Group) {
    setLeaving(true)
    try {
      await removeGroupMember(room.id, owner)
      onOpenChange(false)
      onLeft(room.id)
      toast.success(t("groups.left", { name: room.name }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("groups.leaveFailed"))
    } finally {
      setLeaving(false)
    }
  }

  return (
    <Dialog open={group !== null} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DialogContent className="max-w-[20rem] rounded-3xl">
        <DialogHeader className="items-center text-center sm:text-center">
          <GroupAvatar icon={group?.icon} members={group?.members} />
          <DialogTitle className="mt-2">{t("groups.leaveTitle")}</DialogTitle>
          <p className="text-[15px] font-semibold">{group?.name}</p>
          <DialogDescription className="text-balance">
            {owned
              ? t("groups.leaveOwner")
              : group?.requires_approval
                ? t("groups.leaveApproval")
                : group && group.join_price_luna > 0
                  ? t("groups.leavePaid", { amount: formatNim(group.join_price_luna) })
                  : t("groups.leaveFree")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => onOpenChange(false)}>
            {t("groups.stay")}
          </Button>
          <Button
            variant="destructive"
            disabled={leaving || owned}
            className="h-11 rounded-2xl"
            onClick={() => group && void leave(group)}
          >
            {leaving && <Loader2 className="animate-spin" />}
            {t("groups.leave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
