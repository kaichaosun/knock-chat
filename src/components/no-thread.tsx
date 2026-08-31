import { MessagesSquare, PanelLeftOpen } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { SIDEBAR_SHORTCUT_KEYS, SIDEBAR_SHORTCUT_LABEL } from "@/lib/shortcuts"

/**
 * The half of a wide window with nothing open in it.
 *
 * Only ever seen beside the list — on a phone there is no such thing as "no
 * thread open", because the list is what fills the screen instead. So this says
 * what to do rather than apologising for being empty: the answer is in the
 * column to the left, and pointing at it is the whole job.
 */
export function NoThread({ onShowSidebar }: { onShowSidebar?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full flex-col">
      {onShowSidebar && (
        <header className="bg-background/85 border-b backdrop-blur-xl pt-safe">
          <div className="flex items-center px-1.5 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowSidebar}
              aria-label={t("app.showSidebar")}
              aria-keyshortcuts={SIDEBAR_SHORTCUT_KEYS}
              title={`${t("app.showSidebar")} (${SIDEBAR_SHORTCUT_LABEL})`}
              className="size-11 shrink-0 rounded-full"
            >
              <PanelLeftOpen className="size-5" />
            </Button>
          </div>
        </header>
      )}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <div className="bg-foreground/5 text-foreground/40 flex size-16 items-center justify-center rounded-3xl">
          <MessagesSquare className="size-7" strokeWidth={1.5} />
        </div>
        <p className="text-muted-foreground max-w-xs text-[13px] text-balance">
          {t("app.pickAThread")}
        </p>
      </div>
    </div>
  )
}
