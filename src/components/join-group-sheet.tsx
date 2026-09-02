import { Clock, Loader2, ShieldOff } from "lucide-react"
import { useTranslation } from "react-i18next"
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
 *
 * A door is for somebody standing outside it, and most people who are already
 * in are taken straight to the room instead — see `openCode`. But a membership
 * can change on another device, and the list that decides is a poll behind, so
 * a member does still arrive here. For them this is not a door: no price, no
 * terms, and a way in rather than an offer to sell them what they own.
 */
export function JoinGroupSheet({
  open,
  onOpenChange,
  group,
  full,
  joined,
  loading,
  onJoin,
  onOpen,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Null while the link is still being looked up. */
  group: Group | null
  /** The room is at its limit. Said here because here is before the money. */
  full: boolean
  /** You are already in. The relay's answer, taken from the room's detail. */
  joined: boolean
  loading: boolean
  onJoin: (group: Group) => Promise<void>
  /** Go in, for a room you are already in. */
  onOpen: (group: Group) => void
}) {
  const { t } = useTranslation()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState("")

  const submit = async () => {
    if (!group) return
    if (joined) {
      onOpen(group)
      onOpenChange(false)
      return
    }
    setJoining(true)
    setError("")
    try {
      await onJoin(group)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("joinGroup.failed"))
    } finally {
      setJoining(false)
    }
  }

  const free = group?.join_price_luna === 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>
            {t(
              !group
                ? "joinGroup.opening"
                : joined
                  ? "joinGroup.openTitle"
                  : "joinGroup.title",
            )}
          </SheetTitle>
          <SheetDescription>
            {joined
              ? t("joinGroup.openAlready")
              : group?.requires_approval
                ? t("joinGroup.approvalNote")
                : t("joinGroup.openNote")}
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
                  {/* What it costs, to somebody it could still cost. Quoting a
                      price to a member is the whole thing this avoids. */}
                  {!joined && (
                    <p className="text-muted-foreground text-[12px]">
                      {free
                        ? t("groups.freeToJoin")
                        : t("groups.priceToJoin", { amount: formatNim(group.join_price_luna) })}
                    </p>
                  )}
                </div>
              </div>

              {!joined && group.requires_approval && (
                <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
                  <Clock className="mt-0.5 size-3 shrink-0" />
                  {free
                    ? t("joinGroup.requestNote")
                    : t("joinGroup.payNote")}
                </p>
              )}

              {!joined && (
                <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
                  <ShieldOff className="mt-0.5 size-3 shrink-0" />
                  {t("misc.groupNotEncrypted")}
                </p>
              )}

              {/* Before the wallet, not after. The relay refuses a join into a
                  full room, but a refusal cannot call back a transfer that has
                  already left — so the only useful place to say this is on the
                  screen where the decision is still being made. */}
              {!joined && full && (
                <p className="text-destructive px-1 text-[13px] leading-snug">
                  {t("misc.groupFull")}
                </p>
              )}

              {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

              <Button
                // A full room stops nobody who is already in it.
                disabled={joining || (!joined && full)}
                onClick={() => void submit()}
                className="brand-gradient h-13 w-full rounded-2xl text-base"
              >
                {joining && <Loader2 className="animate-spin" />}
                {joined
                  ? t("joinGroup.open")
                  : free
                    ? group.requires_approval
                      ? t("joinGroup.ask")
                      : t("joinGroup.join")
                    : t(group.requires_approval ? "joinGroup.askFor" : "joinGroup.joinFor", {
                        amount: formatNim(group.join_price_luna),
                      })}
              </Button>

              {/* Only where money is involved, and only before it is spent. The
                  owner can end the room whenever they like, and what you paid
                  to get in does not come back — which is a thing to know while
                  deciding, not afterwards. */}
              {!joined && !free && (
                <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                  {t("misc.notRefundable")}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
