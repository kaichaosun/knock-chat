import { useTranslation } from "react-i18next"

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { EMOJI } from "@/lib/emoji"

/**
 * Any emoji, from a grid of our own.
 *
 * A grid rather than the device's keyboard, because a keyboard costs taps a
 * picker does not: a text field to focus, an emoji key to find, a layout that
 * jumps as the keyboard opens, and a sheet that has to guess when somebody has
 * finished. Every messenger has its own picker for the same reason.
 *
 * What a picker usually costs is its data, and that is mostly the *names* — the
 * keywords a search box needs, in every language it supports. There is no
 * search here, so none of it is bought: see `lib/emoji`, which is a few
 * kilobytes of characters.
 *
 * Chosen and gone. Nothing is confirmed, because there is nothing to confirm —
 * and the one that was picked is the row's first offer next time, so the grid
 * is a place somebody visits rarely rather than a screen in the way.
 */
export function EmojiSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (emoji: string) => void
}) {
  const { t } = useTranslation()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{t("room.reactTitle")}</SheetTitle>
        </SheetHeader>

        {/* Tall enough to be worth scrolling, short enough to leave the thread
            visible behind it — the message being answered is the context for
            the whole choice. */}
        <div className="scrollbar-none max-h-[50vh] overflow-y-auto overscroll-contain pb-8">
          {EMOJI.map((group) => (
            <section key={group.key}>
              <h3 className="text-muted-foreground bg-background sticky top-0 py-2 text-[12px] font-semibold">
                {t(group.key)}
              </h3>
              <div className="grid grid-cols-8 gap-1">
                {group.emoji.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      onOpenChange(false)
                      onPick(emoji)
                    }}
                    aria-label={emoji}
                    className="active:bg-muted flex aspect-square items-center justify-center rounded-xl text-2xl transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
