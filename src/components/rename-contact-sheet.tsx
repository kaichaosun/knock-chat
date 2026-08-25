import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { formatAddress } from "@/lib/address"
import { chosenNameIn, givenNameIn, rename } from "@/lib/names"
import { MAX_NAME_LEN } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * Give somebody a name of your own.
 *
 * Anyone can call themselves anything, and plenty of people call themselves
 * nothing — so the name on a row is often either missing or not the one you
 * think of them by. This is where you write down the one you do.
 *
 * It stays on this device. Nothing is sent, so there is no failure to report
 * and no moment where the screen and the relay disagree.
 */
export function RenameContactSheet({
  open,
  onOpenChange,
  address,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
}) {
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
    toast.success(trimmed === "" ? "Name cleared" : `Saved as ${trimmed}`)
  }

  const clear = () => {
    rename(address, null)
    onOpenChange(false)
    toast.success(theirs ? `Back to ${theirs}` : "Name cleared")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Name this contact</SheetTitle>
          <SheetDescription>
            Only you see it. They are never told, and it stays on this phone.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          {/* Who you are naming, in the terms that actually identify them. The
              address is spelled out in full rather than shortened: this is the
              one screen where you decide an address is a particular person, so
              it is the one screen where guessing from the ends is not enough. */}
          <section className="bg-muted flex items-center gap-3 rounded-2xl p-3">
            <AddressAvatar address={address} />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[11px]">
                {theirs ? "Calls themselves" : "Has not chosen a name"}
              </p>
              {theirs && <p className="truncate text-[15px] font-semibold">{theirs}</p>}
              <p className="mt-0.5 font-mono text-[11px] leading-relaxed font-semibold wrap-anywhere">
                {formatAddress(address)}
              </p>
            </div>
          </section>

          <div className="relative">
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={theirs ?? "Their name"}
              aria-label="Your name for this contact"
              aria-invalid={tooLong}
              className={cn(
                "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-medium outline-none",
                "placeholder:text-muted-foreground/70 placeholder:font-normal",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                tooLong && "ring-destructive ring-2",
              )}
            />
            {/* Only once it is close to mattering: a counter sitting there from
                the first keystroke reads as a limit to aim for. */}
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
            className="h-13 w-full rounded-2xl text-base"
          >
            Save
          </Button>

          {/* Only once there is something to undo, and worded as what happens
              rather than as what is deleted — nothing of theirs is lost. */}
          {yours !== null && (
            <Button
              variant="ghost"
              onClick={clear}
              className="text-muted-foreground h-11 w-full rounded-2xl"
            >
              {theirs ? "Use their own name instead" : "Show their address instead"}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
