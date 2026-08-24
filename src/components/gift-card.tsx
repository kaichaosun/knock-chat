import { Clock, Gift as GiftIcon, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useGift } from "@/hooks/use-gift"
import type { GiftNote } from "@/lib/payload"
import { formatNim } from "@/lib/postage"
import { cn } from "@/lib/utils"

/**
 * A pot in the room, and the race for it.
 *
 * Everything that changes — how many shares are left, whether you already took
 * one, whether the money has actually gone out — is read from the relay rather
 * than the message, because a message is fixed at the moment it was sent and
 * every one of those facts moves afterwards.
 */
export function GiftCard({
  note,
  outgoing,
  faded,
}: {
  note: GiftNote
  outgoing: boolean
  faded: boolean
}) {
  const { detail, claiming, error, claim } = useGift(note.gift)

  const gift = detail?.gift
  const shares = gift?.shares ?? note.shares
  const claimed = gift?.claimed ?? 0
  const left = Math.max(0, shares - claimed)
  const yours = detail?.yours ?? null
  // The relay's own answer, so an expiry that has passed while this was open is
  // not hidden by a stale message.
  const expired = gift ? Date.parse(gift.expires_at) <= Date.now() : false
  const mine = detail?.claims.find((claim) => claim.amount_luna === yours)

  return (
    <div
      className={cn(
        "bg-card min-w-56 overflow-hidden rounded-2xl border shadow-sm",
        faded && "opacity-60",
      )}
    >
      <div className="brand-gradient flex items-center gap-3 px-3.5 py-3 text-white">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20">
          <GiftIcon className="size-4.5" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-white/75">
            {outgoing ? "You left a gift" : "A gift for the room"}
          </p>
          <p className="text-xl leading-tight font-bold tabular-nums">
            {formatNim(note.total_luna)} NIM
          </p>
        </div>
      </div>

      <div className="space-y-2 px-3.5 py-2.5">
        {note.note && <p className="text-[13px] leading-snug">{note.note}</p>}

        {yours !== null ? (
          // Taken. What it says next depends on whether the money actually
          // moved, which is a different question from whether the share is
          // yours — and the one people care about.
          <p className="text-success flex items-center gap-1.5 text-[13px] font-semibold">
            <GiftIcon className="size-3.5 shrink-0" />
            You got {formatNim(yours)} NIM
            {mine && !mine.payout_tx && (
              <span className="text-muted-foreground font-normal">· sending</span>
            )}
          </p>
        ) : expired ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-[12px]">
            <Clock className="size-3 shrink-0" />
            Over — what was left went back to the sender.
          </p>
        ) : left === 0 ? (
          <p className="text-muted-foreground text-[12px]">All gone.</p>
        ) : (
          <Button
            size="sm"
            disabled={claiming}
            onClick={() => void claim()}
            className="h-9 w-full rounded-xl"
          >
            {claiming && <Loader2 className="animate-spin" />}
            Take a share
          </Button>
        )}

        <p className="text-muted-foreground text-[11px] tabular-nums">
          {claimed} of {shares} taken
        </p>

        {error && <p className="text-destructive text-[12px] leading-snug">{error}</p>}
      </div>
    </div>
  )
}
