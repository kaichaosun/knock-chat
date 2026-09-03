import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { GroupAvatar } from "@/components/group-avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import type { Group, JoinRequest } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * Everybody waiting at one door.
 *
 * The same list the room's own details carry, reachable without going through
 * the room — that is the whole point of the card that opens it. Answering here
 * and answering there are the same call; neither is the real one.
 */
export function JoinQueueSheet({
  group,
  requests,
  onOpenChange,
  onAnswer,
}: {
  /** The room whose door this is, or null when the sheet is closed. */
  group: Group | null
  requests: JoinRequest[]
  onOpenChange: (open: boolean) => void
  onAnswer: (request: JoinRequest, admit: boolean) => Promise<void>
}) {
  const { t } = useTranslation()
  const names = useNames()
  const [busy, setBusy] = useState<string | null>(null)

  const answer = async (request: JoinRequest, admit: boolean) => {
    setBusy(request.id)
    try {
      await onAnswer(request, admit)
      toast.success(t(admit ? "queue.admitted" : "queue.declined"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("queue.answerFailed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={group !== null && requests.length > 0} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{t(requests.length === 1 ? "queue.oneWaiting" : "queue.manyWaiting")}</SheetTitle>
        </SheetHeader>

        {group && (
          <div className="space-y-5 pb-8">
            {/* The mark beside its two lines, and the pair of them centred as
                one block: which door this is, said the way a room is said
                everywhere else, without starting at an edge the sheet has no
                other content against. */}
            <section className="flex items-center justify-center gap-3">
              <GroupAvatar icon={group.icon} members={group.members} />
              <div className="min-w-0">
                <p className="truncate text-[15px] leading-tight font-semibold">{group.name}</p>
                <p className="text-muted-foreground truncate text-[12px]">
                  {group.join_price_luna > 0
                    ? `${formatNim(group.join_price_luna)} NIM to join`
                    : t("groups.freeToJoin")}
                </p>
              </div>
            </section>

            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="bg-card flex items-center gap-3 rounded-2xl border p-3 shadow-sm"
                >
                  <AddressAvatar address={request.address} size="sm" />
                  {/* Name over address, never instead of it: somebody at a door
                      you have not opened is by definition somebody you are
                      deciding about, and a name they chose is their claim. */}
                  <div className="min-w-0 flex-1">
                    {nameIn(names, request.address) && (
                      <p className="truncate text-[14px] leading-tight font-semibold">
                        {nameIn(names, request.address)}
                      </p>
                    )}
                    <p className="text-muted-foreground truncate font-mono text-[11px]">
                      {shortenAddress(request.address)}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      asked {relativeTime(request.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={t("queue.decline")}
                      disabled={busy === request.id}
                      onClick={() => void answer(request, false)}
                      className="size-9 rounded-full"
                    >
                      <X className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      aria-label={t("queue.admit")}
                      disabled={busy === request.id}
                      onClick={() => void answer(request, true)}
                      className="size-9 rounded-full"
                    >
                      {busy === request.id ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {/* The money is only mentioned where there is any: paying to ask is
                a transfer straight to the owner, so declining cannot send it
                back — the relay never held it. */}
            <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
              {t("misc.admitNote")}
              {group.join_price_luna > 0 && t("misc.admitPaidNote")}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
