import type { LucideIcon } from "lucide-react"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

export type AttachAction = {
  icon: LucideIcon
  label: string
  description: string
  onSelect: () => void
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
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: AttachAction[]
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Send something else</SheetTitle>
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
                <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-2xl">
                  <action.icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">{action.label}</span>
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
