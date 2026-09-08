import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { useOneTab } from "@/hooks/use-one-tab"

/**
 * The app, in whichever tab is the one running it.
 *
 * Wrapped rather than switched inside: a tab that stands down unmounts the
 * whole app, so every poll stops, every timer is cleared and nothing of it is
 * left to write over what the tab that took over is writing. Coming back is a
 * fresh mount, which reads the history from storage the way a reload does —
 * which is the point, since by then it is somebody else's history.
 *
 * See `lib/one-tab` for what is being protected and why one tab is the answer.
 */
export function OneTab({ children }: { children: ReactNode }) {
  const { state, take } = useOneTab()

  // Which tab this is has not been settled yet. A moment, and the page is
  // blank until React draws anyway — but showing either answer here would mean
  // showing the wrong one for a frame.
  if (state === null) return null
  if (state === "held") return children
  return <OtherTab onTake={take} />
}

/**
 * What the tabs that are not the one show.
 *
 * It says what to do, and doing it is one tap: nothing is lost by taking it
 * back, and nothing was lost by standing down. The reason is given plainly
 * rather than as an apology, because it is a real constraint and not a fault —
 * mail that is delivered once cannot be collected twice.
 */
function OtherTab({ onTake }: { onTake: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="flex h-full flex-col justify-center overflow-y-auto px-6 pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center text-center">
        <BrandMark className="w-20" />

        <h1 className="mt-7 text-xl font-bold tracking-tight text-balance">{t("oneTab.title")}</h1>
        <p className="text-muted-foreground mt-2 text-[13px] leading-snug text-balance">
          {t("oneTab.note")}
        </p>

        <Button size="lg" className="mt-8 h-13 w-full rounded-2xl text-base" onClick={onTake}>
          {t("oneTab.action")}
        </Button>
      </div>
    </div>
  )
}
