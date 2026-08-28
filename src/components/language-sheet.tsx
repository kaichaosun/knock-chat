import { Check } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePrefs } from "@/hooks/use-prefs"
import { LANGUAGES, LANGUAGE_NAMES, type LanguageChoice } from "@/i18n"
import { update } from "@/lib/prefs"
import { cn } from "@/lib/utils"

/**
 * Which language to speak.
 *
 * Only the ones written. Offering a language with no dictionary behind it
 * shows English under a French heading, which reads as broken rather than as
 * unfinished — so a language appears here when it is done and not before.
 */
export function LanguageSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { language } = usePrefs()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("settings.language.title")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-1 pb-8">
          {(["host", ...LANGUAGES] as LanguageChoice[]).map((value) => {
            const picked = language === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={picked}
                onClick={() => {
                  update({ language: value })
                  onOpenChange(false)
                }}
                className={cn(
                  "active:bg-muted flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left text-[15px] transition-colors",
                  picked ? "font-semibold" : "font-medium",
                )}
              >
                {value === "host" ? t("settings.language.host") : LANGUAGE_NAMES[value]}
                {picked && <Check className="text-primary size-5 shrink-0" />}
              </button>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
