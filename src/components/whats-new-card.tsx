import { Sparkles, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { usePrefs } from "@/hooks/use-prefs"
import { LATEST, RELEASES, unseen } from "@/lib/changelog"
import { update } from "@/lib/prefs"

/**
 * What changed, above the inbox, until it has been read.
 *
 * An announcement has to arrive. Putting it behind a dot in a menu makes
 * finding out the reader's job, which is the same mistake the feature it was
 * announcing had already made — group discovery went in behind a `+` menu, and
 * hiding its announcement behind three more taps would have been the joke
 * telling itself twice.
 *
 * The shape is `KnockRequests` and `GroupRequests`: above the list, gone when
 * there is nothing, and acted on where it appears. That is already what this
 * app does with things that want an answer, and this wants the smallest answer
 * of the three.
 *
 * Not a notification centre, and not a modal on launch. A centre would be empty
 * between releases; a modal would interrupt somebody who opened the app to read
 * a message. This costs one line of the list, once.
 */
export function WhatsNewCard({ onRead }: { onRead: () => void }) {
  const { t } = useTranslation()
  const { seen } = usePrefs()

  if (!unseen(seen)) return null

  /** Read or dismissed, both end the same way: it does not come back. */
  const settle = () => {
    if (LATEST) update({ seen: LATEST })
  }

  const count = RELEASES.filter((release) => release.id > seen).length

  return (
    // The same gutter and the same breathing room as `KnockRequests` and
    // `GroupRequests`, which is what it sits above or beside. Without the
    // bottom half of it the card met the first chat row edge to edge and read
    // as part of the list rather than as something above it.
    <section className="px-3 pt-3 pb-3">
      <div className="bg-accent/60 flex items-center gap-3 rounded-2xl p-3">
        {/* Tapping anywhere but the X reads it, which is the thing somebody is
            most likely to mean. */}
        <button
          type="button"
          onClick={onRead}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="size-5" strokeWidth={1.75} />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] leading-tight font-semibold">
              {t("changelog.title")}
            </span>
            {/* What is in it, not that there is something in it. A card that
                only says "updates available" spends a line of the inbox asking
                somebody to tap to find out whether they care. */}
            <span className="text-muted-foreground mt-0.5 block truncate text-[12px]">
              {count > 1 ? t("changelog.cardMany", { count }) : t(RELEASES[0].items[0])}
            </span>
          </span>
        </button>

        <Button
          variant="ghost"
          size="icon"
          aria-label={t("changelog.dismiss")}
          onClick={settle}
          className="text-muted-foreground size-8 shrink-0 rounded-full"
        >
          <X className="size-4" />
        </Button>
      </div>
    </section>
  )
}
