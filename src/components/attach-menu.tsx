import type { LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

export type AttachAction = {
  icon: LucideIcon
  label: string
  description: string
  onSelect: () => void
  /**
   * Marks the one row in a menu that takes something away.
   *
   * Colour rather than position, because the list is short enough that a row at
   * the bottom is no further from the thumb than a row at the top — and reading
   * a menu is how you find the destructive item, not counting down it.
   */
  tone?: "destructive"
}

/**
 * What else a message can be.
 *
 * A sheet rather than a popover: these are the things you do instead of typing,
 * they each open something of their own, and a row you can hit with a thumb
 * without looking is worth more here than one that saves a few pixels.
 *
 * Only actions that work are listed. A greyed-out row promising a feature is a
 * control that does nothing, and this app already refuses those elsewhere — the
 * retry that cannot succeed while a door is shut is not shown either.
 */
export function AttachMenu({
  open,
  onOpenChange,
  title,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What this particular menu is offering. Defaults to the composer's own. */
  title?: string
  actions: AttachAction[]
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Tighter than a sheet's default. That default assumes a title with a
          description under it and content below that; this is a title and then
          the answer to it, and 16px of header padding plus a 16px column gap
          puts them a thumb apart. */}
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] gap-2 rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0 pb-0">
          <SheetTitle>{title ?? t("attach.title")}</SheetTitle>
        </SheetHeader>

        <ul className="space-y-2 pb-8">
          {actions.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  action.onSelect()
                }}
                className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
              >
                <span
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-2xl",
                    action.tone === "destructive"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-accent text-accent-foreground",
                  )}
                >
                  <action.icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[15px] font-semibold",
                      action.tone === "destructive" && "text-destructive",
                    )}
                  >
                    {action.label}
                  </span>
                  <span className="text-muted-foreground block text-[13px] leading-snug">
                    {action.description}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
