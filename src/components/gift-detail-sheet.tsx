import { Crown, Gift as GiftIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { labelIn } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import type { GiftDetail } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * How long after the pot appeared somebody got to it.
 *
 * The race is the point of a random split, so the gap is shown rather than the
 * wall-clock time — "1.2s" says something "23:24:16" does not.
 */
export function sinceOpened(createdAt: string, claimedAt: string): string {
  const ms = Date.parse(claimedAt) - Date.parse(createdAt)
  if (!Number.isFinite(ms) || ms < 0) return ""
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  return `${Math.round(ms / 3_600_000)}h`
}

/**
 * Who got what.
 *
 * Everything here is already on the card's own reading of the gift — this is
 * the same answer laid out at length, so opening it costs nothing and cannot
 * disagree with the card that opened it.
 */
export function GiftDetailSheet({
  open,
  onOpenChange,
  detail,
  owner,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: GiftDetail | null
  /** Your address, so your own share is called yours. */
  owner: string | null
}) {
  const { t } = useTranslation()
  const names = useNames()

  if (!detail) return null
  const { gift, claims } = detail

  // The order people got there in. The relay returns them unordered; the race
  // is what makes the list worth reading.
  const inOrder = [...claims].sort(
    (a, b) => Date.parse(a.claimed_at) - Date.parse(b.claimed_at),
  )

  const taken = claims.reduce((sum, claim) => sum + claim.amount_luna, 0)
  const left = Math.max(0, gift.total_luna - taken)
  const done = gift.claimed >= gift.shares
  const expired = Date.parse(gift.expires_at) <= Date.now()

  // Crowned only once the race is over and only when there was luck in it —
  // in an even split everybody got the same, and calling one of them luckiest
  // would be an invention.
  const luckiest =
    gift.split === "random" && done && inOrder.length > 1
      ? inOrder.reduce((best, claim) => (claim.amount_luna > best.amount_luna ? claim : best))
      : null

  const sender = gift.sender === owner ? "You" : labelIn(names, gift.sender)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>
            {sender === "You" ? t("gift.yours") : t("gift.theirs", { name: sender })}
          </SheetTitle>
          <SheetDescription>
            {t(gift.split === "random" ? "gift.randomShares" : "gift.evenShares")}
            {" · "}
            {gift.shares} {gift.shares === 1 ? "share" : "shares"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="brand-gradient flex flex-col items-center gap-1 rounded-2xl px-4 py-5 text-white">
            <GiftIcon className="size-6 opacity-80" strokeWidth={2} />
            <p className="text-3xl leading-tight font-bold tabular-nums">
              {formatNim(gift.total_luna)} NIM
            </p>
            {gift.note && <p className="text-center text-[13px] text-white/85">{gift.note}</p>}
          </div>

          <p className="text-muted-foreground px-1 text-[13px] tabular-nums">
            {done
              ? `All ${gift.shares} taken`
              : expired
                ? `Ended · ${formatNim(left)} NIM went back`
                : `${gift.claimed} of ${gift.shares} taken · ${formatNim(left)} NIM left`}
          </p>

          {inOrder.length === 0 ? (
            <p className="text-muted-foreground px-1 py-6 text-center text-[13px]">
              {t("gift.nobodyYet")}
            </p>
          ) : (
            <ul className="space-y-1">
              {inOrder.map((claim) => {
                const yours = claim.address === owner
                const won = luckiest?.address === claim.address
                return (
                  <li
                    key={claim.address}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-2 py-2",
                      yours && "bg-muted/70",
                    )}
                  >
                    <AddressAvatar address={claim.address} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-[14px] font-semibold">
                        {yours ? "You" : labelIn(names, claim.address)}
                        {won && (
                          <span className="text-warning flex shrink-0 items-center gap-0.5 text-[11px] font-bold">
                            <Crown className="size-3.5" />
                            luckiest
                          </span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-[11px] tabular-nums">
                        {sinceOpened(gift.created_at, claim.claimed_at)}
                        {!claim.payout_tx && " · sending"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[15px] font-bold tabular-nums">
                      {formatNim(claim.amount_luna)}
                    </span>
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
