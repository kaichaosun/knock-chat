import { useState } from "react"
import { Copy, Loader2, LogOut, Users } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AttachMenu } from "@/components/attach-menu"
import { GroupAvatar } from "@/components/group-avatar"
import { LeaveGroupDialog } from "@/components/leave-group-dialog"
import { SwipeRow } from "@/components/swipe-row"
import { copyText } from "@/lib/clipboard"
import { groupLink } from "@/lib/group-link"
import { formatNim } from "@/lib/postage"
import type { Group } from "@/lib/relay"

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
  selectedId,
}: {
  groups: Group[]
  owner: string
  /** True until the first read lands, so an empty list is not shown as "none". */
  loading: boolean
  onOpen: (id: string) => void
  /** Called once the relay has confirmed, so the chat goes with the room. */
  onLeft: (id: string) => void
  /** The group id currently selected, or null if none. */
  selectedId?: string | null
}) {
  const { t } = useTranslation()
  const [revealed, setRevealed] = useState<string | null>(null)
  /** The room being left, once asked about. See `LeaveGroupDialog`. */
  const [confirming, setConfirming] = useState<Group | null>(null)
  /** The room whose actions are open. The same menu the chat list has. */
  const [holding, setHolding] = useState<Group | null>(null)

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
              // The swipe reveals the one thing it has room for; holding opens
              // everything, which is how the chat list works and now how this
              // one does. Leaving is offered to an owner too: they cannot, and
              // the dialog is where that is said — hiding it would leave them
              // with the question and nowhere it is answered.
              onLongPress={() => setHolding(group)}
              onMenu={() => setHolding(group)}
              menuLabel={t("groups.rowMenu")}
              onClick={() => onOpen(group.id)}
              revealed={revealed === group.id}
              onReveal={(open) => setRevealed(open ? group.id : null)}
              selected={selectedId === group.id}
            >
              <GroupAvatar icon={group.icon} members={group.members} />
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

      <AttachMenu
        open={holding !== null}
        onOpenChange={(open) => !open && setHolding(null)}
        title={holding?.name ?? ""}
        actions={
          holding
            ? [
                {
                  icon: Copy,
                  label: t("groupSheet.copyInvite"),
                  description: t("groups.copyLinkNote"),
                  onSelect: () => {
                    void copyText(groupLink(holding.id)).then((ok) =>
                      toast[ok ? "success" : "info"](
                        ok ? t("groupSheet.inviteCopied") : t("groupSheet.clipboardFailed"),
                      ),
                    )
                  },
                },
                {
                  icon: LogOut,
                  label: t("groupSheet.leave"),
                  description: t("groupSheet.leaveNote"),
                  tone: "destructive" as const,
                  // Choosing it here is not the leaving — the dialog is, and
                  // the swipe's own action goes through the same one.
                  onSelect: () => setConfirming(holding),
                },
              ]
            : []
        }
      />

      <LeaveGroupDialog
        group={confirming}
        owner={owner}
        onOpenChange={(open) => {
          if (open) return
          setConfirming(null)
          setRevealed(null)
        }}
        onLeft={onLeft}
      />
    </>
  )
}
