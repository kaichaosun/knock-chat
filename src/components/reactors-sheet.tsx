import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { compact } from "@/lib/address"
import { labelIn } from "@/lib/names"
import type { Reacted } from "@/lib/reactions"

/**
 * Who put one emoji on one message.
 *
 * A count answers "how many" and immediately raises "who", which in a room of
 * any size is the more useful of the two — and the only one a person cannot
 * work out by looking.
 *
 * Named the way everybody else on this screen is named: out of this device's
 * own directory, so somebody you have renamed reads as you renamed them. The
 * order is the order they arrived in, not alphabetical — who got there first is
 * information, and sorting throws it away.
 */
export function ReactorsSheet({
  reacted,
  you,
  onOpenChange,
  onOpenPerson,
}: {
  /** The emoji being asked about, or null when nothing is. */
  reacted: Reacted | null
  /** Your own address, so your own row says so. */
  you: string
  onOpenChange: (open: boolean) => void
  /** Absent where there is nobody to open — a thread has only two people. */
  onOpenPerson?: (address: string) => void
}) {
  const { t } = useTranslation()
  const names = useNames()

  return (
    <Sheet open={reacted !== null} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>
            {reacted?.emoji} {t("room.reactedBy", { count: reacted?.count ?? 0 })}
          </SheetTitle>
        </SheetHeader>

        <ul className="scrollbar-none max-h-[50vh] space-y-1 overflow-y-auto pb-8">
          {(reacted?.by ?? []).map((address) => {
            const mine = compact(address) === compact(you)
            const row = (
              <>
                <AddressAvatar address={address} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                  {mine ? t("members.you") : labelIn(names, address)}
                </span>
              </>
            )
            return (
              <li key={address}>
                {/* Yours opens nothing: there is no card to look at about
                    yourself, and a row that does nothing is worse than one that
                    plainly is not a button. */}
                {onOpenPerson && !mine ? (
                  <button
                    type="button"
                    onClick={() => onOpenPerson(address)}
                    className="active:bg-muted flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors"
                  >
                    {row}
                  </button>
                ) : (
                  <div className="flex w-full items-center gap-3 p-2">{row}</div>
                )}
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
