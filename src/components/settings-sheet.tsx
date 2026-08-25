import { Moon, Smartphone, Sun } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useTheme } from "@/hooks/use-theme"
import { choose, type Theme } from "@/lib/theme"
import { cn } from "@/lib/utils"

/**
 * System first, because it is the default and because it is the one people
 * reach back for. Light before dark to match every other place these two are
 * offered together.
 */
const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Smartphone },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
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
  const { theme, palette } = useTheme()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <div className="space-y-7 pb-8">
          <section>
            <h3 className="text-sm font-semibold">Appearance</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              Choose how Knock looks on this phone.
            </p>

            {/* A row rather than a list: three choices that exclude each other,
                where seeing them side by side is most of the answer. */}
            <div
              role="radiogroup"
              aria-label="Appearance"
              className="bg-muted mt-3 grid grid-cols-3 gap-1 rounded-2xl p-1"
            >
              {THEMES.map(({ value, label, icon: Icon }) => {
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
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Only under System, and only ever as an answer: it says which way
                the phone is currently pointing, which is the one thing the row
                above cannot show. */}
            {theme === "system" && (
              <p className="text-muted-foreground mt-2.5 text-[12px]">
                Your phone is set to {palette} right now.
              </p>
            )}
          </section>

          {/* Where the mark gets to be a mark. Centred and given a line of its
              own, because this is the one place in the app that answers what
              Knock is rather than doing something with it — and the profile
              footer, which only had room for the name, points here. */}
          <section className="flex flex-col items-center gap-2 border-t pt-7 text-center">
            <BrandMark className="size-14" />
            <h3 className="font-semibold">Knock</h3>
            <p className="text-muted-foreground max-w-[17rem] text-[13px] leading-snug text-balance">
              Messages between Nimiq wallets, with spam priced out instead of guessed at.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
