import { useEffect, useState } from "react"
import { Copy, DoorClosed } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { formatAddress } from "@/lib/address"
import { chosenNameIn, givenNameIn, rename } from "@/lib/names"
import { MAX_NAME_LEN } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * Who somebody is, and what you call them.
 *
 * The header of a chat has room for one control, and copying an address is not
 * what it is for — you copy an address once, and you look up who you are talking
 * to whenever you are unsure. So the header opens this, and copying lives in
 * here with everything else about the person.
 *
 * The name you give somebody stays on this device. Nothing is sent, so there is
 * no failure to report and no moment where the screen and the relay disagree.
 */
export function ContactSheet({
  open,
  onOpenChange,
  address,
  onCopy,
  onForget,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
  onCopy: (address: string) => void
  /**
   * Shut the door this person came through.
   *
   * Absent where there is no door to shut: a thread can exist with somebody
   * whose channel was never opened, and offering to close one that is not there
   * is a button that does nothing.
   */
  onForget?: () => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const theirs = givenNameIn(names, address)
  const yours = chosenNameIn(names, address)

  const [draft, setDraft] = useState("")

  // Seeded when the sheet opens, and deliberately not kept in step with the
  // directory afterwards: a name arriving from a poll while you are halfway
  // through typing must not take the field away from you.
  useEffect(() => {
    if (open) setDraft(yours ?? "")
  }, [open, address])

  const trimmed = draft.trim()
  // Counted in characters rather than `length`, which counts UTF-16 units and
  // would call a name of emoji twice as long as it looks.
  const length = [...trimmed].length
  const tooLong = length > MAX_NAME_LEN
  const changed = trimmed !== (yours ?? "")

  const save = () => {
    rename(address, trimmed === "" ? null : trimmed)
    onOpenChange(false)
    toast.success(trimmed === "" ? t("contacts.nameCleared") : t("contacts.savedAs", { name: trimmed }))
  }

  const clear = () => {
    rename(address, null)
    onOpenChange(false)
    toast.success(theirs ? t("contacts.backTo", { name: theirs }) : t("contacts.nameCleared"))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("contacts.sheetTitle")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-7 pb-8">
          {/* The address leads, beside the face made from it — those two are
              the only things here that are true of the person rather than
              chosen about them. Unshortened, because this is the screen you
              come to in order to be sure, and the two ends of an address cannot
              make you sure. */}
          <section className="flex items-center gap-3.5">
            <AddressAvatar address={address} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[12px]">{t("contacts.address")}</p>
              <p className="select-value font-mono text-[13px] leading-relaxed font-semibold wrap-anywhere">
                {formatAddress(address)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCopy(formatAddress(address))}
                className="mt-2 h-8 rounded-lg"
              >
                <Copy className="size-3.5" />
                {t("contacts.copy")}
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t("contacts.originalName")}</h3>
            {theirs ? (
              <p className="mt-1.5 text-[15px] font-semibold text-muted-foreground">{theirs}</p>
            ) : (
              <p className="text-muted-foreground mt-1.5 text-[15px]">{t("contacts.notSet")}</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t("contacts.yourNameFor")}</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              {t("contacts.yourNameNote")}
            </p>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={theirs ?? t("contacts.unnamed")}
                  aria-label={t("contacts.yourNameLabel")}
                  aria-invalid={tooLong}
                  className={cn(
                    "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-medium outline-none",
                    "placeholder:text-muted-foreground/70 placeholder:font-normal",
                    "focus-visible:ring-ring/60 focus-visible:ring-2",
                    tooLong && "ring-destructive ring-2",
                  )}
                />
                {/* Only once it is close to mattering: a counter sitting there
                    from the first keystroke reads as a limit to aim for. */}
                {length > MAX_NAME_LEN - 8 && (
                  <span
                    className={cn(
                      "pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs tabular-nums",
                      tooLong ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {MAX_NAME_LEN - length}
                  </span>
                )}
              </div>
              <Button
                disabled={tooLong || !changed}
                onClick={save}
                className="h-12 rounded-2xl px-5"
              >
                {t("contacts.save")}
              </Button>
            </div>

            {/* Only once there is something to undo, and worded as what happens
                rather than as what is deleted — nothing of theirs is lost. */}
            {yours !== null && (
              <Button
                variant="ghost"
                onClick={clear}
                className="text-muted-foreground mt-2 h-10 w-full rounded-2xl"
              >
                {t(theirs ? "contacts.useTheirName" : "contacts.useAddress")}
              </Button>
            )}
          </section>

          {/* Last, under everything about who they are, because it is the one
              thing here that acts on them rather than on your own copy of
              them. The shape the room's own last row has, red for the same
              reason: what it ends, it ends for both of you. */}
          {onForget && (
            <section className="border-t pt-4">
              <button
                type="button"
                onClick={onForget}
                className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
              >
                <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-2xl">
                  <DoorClosed className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="text-destructive block text-[15px] font-semibold">
                    {t("contacts.forget")}
                  </span>
                  <span className="text-muted-foreground block text-[13px] leading-snug">
                    {t("contacts.forgetNote")}
                  </span>
                </span>
              </button>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
