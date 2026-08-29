import { MessagesSquare } from "lucide-react"
import { useTranslation } from "react-i18next"

/**
 * The half of a wide window with nothing open in it.
 *
 * Only ever seen beside the list — on a phone there is no such thing as "no
 * thread open", because the list is what fills the screen instead. So this says
 * what to do rather than apologising for being empty: the answer is in the
 * column to the left, and pointing at it is the whole job.
 */
export function NoThread() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="bg-foreground/5 text-foreground/40 flex size-16 items-center justify-center rounded-3xl">
        <MessagesSquare className="size-7" strokeWidth={1.5} />
      </div>
      <p className="text-muted-foreground max-w-xs text-[13px] text-balance">
        {t("app.pickAThread")}
      </p>
    </div>
  )
}
