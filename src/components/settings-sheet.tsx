import { useState } from "react"
import { ChevronRight, CirclePlus, Moon, PanelTop, Smartphone, Sun } from "lucide-react"
import { useTranslation } from "react-i18next"

import { BrandMark } from "@/components/brand-mark"
import { LanguageSheet } from "@/components/language-sheet"
import { LegalSheet } from "@/components/legal-sheet"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { usePrefs } from "@/hooks/use-prefs"
import { LANGUAGE_NAMES } from "@/i18n"
import { useTheme } from "@/hooks/use-theme"
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legal"
import { update, type ComposeSpot } from "@/lib/prefs"
import { choose, type Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"

/**
 * System first, because it is the default and because it is the one people
 * reach back for. Light before dark to match every other place these two are
 * offered together.
 */
const THEMES: { value: Theme; key: string; icon: typeof Sun }[] = [
  { value: "system", key: "settingsMore.system", icon: Smartphone },
  { value: "light", key: "settingsMore.light", icon: Sun },
  { value: "dark", key: "settingsMore.dark", icon: Moon },
]

/**
 * Where the button that starts a new chat can sit.
 *
 * Floating first, because it is the default and because it is what the tab
 * looks like before anybody comes here.
 */
const SPOTS: { value: ComposeSpot; key: string; icon: typeof Sun }[] = [
  { value: "floating", key: "settingsMore.floating", icon: CirclePlus },
  { value: "header", key: "settingsMore.inHeader", icon: PanelTop },
]

/**
 * Preferences that are yours alone.
 *
 * The profile is what the relay knows about you and anyone can look up. This is
 * the other kind of setting: it changes what you see, it is kept on this device,
 * and nothing about it is anyone else's business — which is why the two are
 * separate screens rather than two sections of one.
 */
export function SettingsSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const { theme, palette } = useTheme()
  const { compose, language } = usePrefs()
  /** Whichever document is being read, if either. */
  const [reading, setReading] = useState<LegalDoc | null>(null)
  const [picking, setPicking] = useState(false)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("settings.title")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-7 pb-8">
          <section>
            <h3 className="text-sm font-semibold">{t("settingsMore.appearance")}</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              {t("settingsMore.appearanceNote")}
            </p>

            {/* A row rather than a list: three choices that exclude each other,
                where seeing them side by side is most of the answer. */}
            <div
              role="radiogroup"
              aria-label={t("settingsMore.appearance")}
              className="bg-muted mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1"
            >
              {THEMES.map(({ value, key, icon: Icon }) => {
                const picked = theme === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    onClick={() => choose(value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-colors",
                      picked
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground active:bg-background/50",
                    )}
                  >
                    <Icon className="size-4.5" />
                    {t(key)}
                  </button>
                )
              })}
            </div>

            {/* Only under System, and only ever as an answer: it says which way
                the phone is currently pointing, which is the one thing the row
                above cannot show. */}
            {theme === "system" && (
              <p className="text-muted-foreground mt-2.5 text-[12px]">
                {t("settingsMore.phoneIs", { palette })}
              </p>
            )}
          </section>

          <section>
            {/* One line, because there are only two things to say: what it is,
                and what it is set to. A heading with a row under it would spend
                three lines saying them. */}
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="active:bg-muted -mx-3 flex w-[calc(100%+1.5rem)] items-center justify-between rounded-xl px-3 py-2.5 text-left transition-colors"
            >
              <span className="text-sm font-semibold">{t("settings.language.title")}</span>
              <span className="text-muted-foreground flex items-center gap-1 text-sm font-medium">
                {language === "host" ? t("settings.language.host") : LANGUAGE_NAMES[language]}
                <ChevronRight className="size-4 shrink-0" />
              </span>
            </button>
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t("settingsMore.composeTitle")}</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              {t("settingsMore.composeNote")}
            </p>

            <div
              role="radiogroup"
              aria-label={t("settingsMore.composeTitle")}
              className="bg-muted mt-3 grid grid-cols-2 gap-1 rounded-2xl p-1"
            >
              {SPOTS.map(({ value, key, icon: Icon }) => {
                const picked = compose === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    onClick={() => update({ compose: value })}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl py-3 text-[13px] font-semibold transition-colors",
                      picked
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground active:bg-background/50",
                    )}
                  >
                    <Icon className="size-4.5" />
                    {t(key)}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Where the mark gets to be a mark. Centred and given a line of its
              own, because this is the one place in the app that answers what
              Knock is rather than doing something with it — and the profile
              footer, which only had room for the name, points here. */}
          <section className="flex flex-col items-center gap-2 border-t pt-7 text-center">
            <BrandMark className="w-12" />
            <h3 className="font-semibold">Knock</h3>
            <p className="text-muted-foreground max-w-[17rem] text-[13px] leading-snug text-balance">
              {t("settingsMore.about")}
            </p>

            {/* Agreed to at sign-in, and readable ever after — which is the
                half people actually need, since the screen that asked is one
                they may never see again. */}
            <div className="mt-3 w-full space-y-1">
              {[
                { label: t("settingsMore.terms"), doc: TERMS },
                { label: t("settingsMore.privacy"), doc: PRIVACY },
              ].map(({ label, doc }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setReading(doc)}
                  className="active:bg-muted flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition-colors"
                >
                  {label}
                  <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </SheetContent>

      <LanguageSheet open={picking} onOpenChange={setPicking} />

      <LegalSheet
        doc={reading}
        open={reading !== null}
        onOpenChange={(next) => !next && setReading(null)}
      />
    </Sheet>
  )
}
