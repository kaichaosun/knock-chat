import { Loader2, LockKeyhole } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { formatAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import type { Knock } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * One knock, whole.
 *
 * The card in the list is a summary and has to stay one: several of them sit
 * on top of an inbox, and a stranger's essay is not allowed to push the day's
 * messages off the screen. So the card clamps what it shows and this is where
 * the rest of it is — along with the full address, which is the other thing
 * too long to put in a row and too important to decide without.
 */
export function KnockRequestSheet({
  knock,
  note,
  busy,
  onOpenChange,
  onAccept,
  onDecline,
}: {
  /** The knock being read, or null when the sheet is closed. */
  knock: Knock | null
  /** What it says: null if this device cannot open it, absent until read. */
  note: string | null | undefined
  busy: boolean
  onOpenChange: (open: boolean) => void
  onAccept: () => void
  onDecline: () => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const name = knock ? nameIn(names, knock.from) : null

  return (
    <Sheet open={knock !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>Someone is knocking</SheetTitle>
        </SheetHeader>

        {knock && (
          <div className="space-y-6 pb-8">
            {/* Unshortened, for the same reason the contact sheet does it: this
                is the screen you come to in order to be sure, and the two ends
                of an address cannot make you sure. */}
            <section className="flex items-start gap-3.5">
              <AddressAvatar address={knock.from} size="lg" />
              <div className="min-w-0 flex-1">
                {name && <p className="truncate text-[15px] leading-tight font-semibold">{name}</p>}
                <p className="select-value mt-0.5 font-mono text-[13px] leading-relaxed font-semibold wrap-anywhere">
                  {formatAddress(knock.from)}
                </p>
                <p className="text-muted-foreground mt-1 text-[11px]">
                  knocked {relativeTime(knock.created_at)}
                </p>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold">What they wrote</h3>
              {note === null || note === undefined ? (
                <p className="text-muted-foreground mt-2 flex items-center gap-2 text-[13px] italic">
                  <LockKeyhole className="size-3.5 shrink-0" />
                  Can't be opened on this device
                </p>
              ) : (
                /* Scrolls inside itself rather than growing the sheet: however
                   much somebody wrote, the two buttons stay where they are. */
                <p className="bg-muted mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-2xl px-4 py-3 text-[15px] leading-snug whitespace-pre-wrap wrap-anywhere select-text">
                  {note}
                </p>
              )}
            </section>

            <section className="space-y-2">
              <Button
                size="lg"
                disabled={busy}
                onClick={onAccept}
                className="h-13 w-full rounded-2xl text-base"
              >
                {busy && <Loader2 className="animate-spin" />}
                {t("knocks.admit")}
              </Button>
              {/* Outlined rather than ghost. A muted borderless label sitting
                  directly above a muted line of explanation is two pieces of
                  grey text, and the one you can press has to look pressable. */}
              <Button
                variant="outline"
                disabled={busy}
                onClick={onDecline}
                className="h-12 w-full rounded-2xl text-[15px] font-semibold"
              >
                Decline
              </Button>
              <p className="text-muted-foreground px-1 pt-2 text-center text-[12px] leading-snug">
                {t("knocks.admitNote")}
                then on. Declining leaves the door shut.
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
