import { useEffect } from "react"
import { useTranslation } from "react-i18next"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { LATEST, RELEASES } from "@/lib/changelog"
import { DEV_SERVER } from "@/lib/env"
import { update } from "@/lib/prefs"

/**
 * A release date as the day it says, in this device's own timezone.
 *
 * `new Date("2026-09-14")` is midnight **UTC**, which anybody west of it draws
 * as the thirteenth — a changelog dated the day before the day it shipped, on
 * every device in the Americas. Built from the parts instead, which is local by
 * definition.
 */
function on(date: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(year, month - 1, day)
}

/**
 * What has changed since last time.
 *
 * Opening it is what marks it read, rather than a button that says so: there is
 * nothing to agree to here, and a screen that has been looked at has been
 * looked at. The dots that led here go out together, at every level at once,
 * because they were all the same fact said three times.
 *
 * Every release stays, not only the unread ones. Somebody who has been away for
 * three of them wants to know what happened in all three, and a list that
 * showed only the newest would be a list that quietly threw the rest away.
 */
export function ChangelogSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()

  useEffect(() => {
    if (open && LATEST) update({ seen: LATEST })
  }, [open])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{t("changelog.title")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          {RELEASES.map((release) => (
            <section key={release.id} className="space-y-2">
              {/* In the reader's language rather than the device's, so a date
                  does not arrive in a different language from the sentence
                  under it. Long-form, because a changelog is read rarely and
                  "14 September 2026" needs no working out. */}
              <h3 className="text-muted-foreground text-[11px] font-semibold">
                {on(release.date).toLocaleDateString(i18n.language, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </h3>
              <ul className="space-y-1.5">
                {release.items.map((item) => (
                  <li key={item} className="flex gap-2.5 text-[13px] leading-relaxed">
                    {/* A dot rather than a list marker, so a line that wraps
                        hangs under its own text instead of under the bullet. */}
                    <span
                      aria-hidden
                      className="bg-muted-foreground/40 mt-[0.55rem] size-1 shrink-0 rounded-full"
                    />
                    <span className="min-w-0">{t(item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {/* Not in a shipped build, and not translated for that reason.
          
              Reading this once writes `seen`, and there is no console inside
              Nimiq Pay to unwrite it — so without this, testing the card is a
              thing you get exactly one attempt at per device.

              `DEV_SERVER` rather than the wallet's own dev mode: inside
              Nimiq Pay that reads `nimiq-pay` even when it is pointed at a dev
              server, which is the one place this has to work. See `lib/env`,
              which is also why this ships as nothing rather than shipping
              switched off. */}
          {DEV_SERVER && (
            <button
              type="button"
              onClick={() => {
                update({ seen: "" })
                onOpenChange(false)
              }}
              className="text-muted-foreground border-t pt-4 text-left text-[11px] font-medium"
            >
              Mark unread, and show the card again (dev only)
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
