import * as React from "react"
import { XIcon } from "lucide-react"
import { Dialog as SheetPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        // Which edge this came from, so index.css can turn the bottom ones into
        // centred dialogs where a bottom edge is the wrong place to come from.
        data-side={side}
        // Radix focuses the first tabbable thing in a sheet as it opens. On a
        // phone that means the keyboard rises over the sheet before it has been
        // read — and the field it lands on is whichever one happens to be first
        // in the DOM, which is nobody's decision. Focus the panel itself
        // instead: the trap and the screen-reader announcement both still work,
        // and nothing types.
        //
        // A field that genuinely wants the caret asks for it with `autoFocus`.
        // React applies that during the commit, before this runs, and Radix
        // leaves focus alone once it is already inside the panel.
        tabIndex={-1}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          const panel = event.currentTarget as HTMLElement | null
          panel?.focus({ preventScroll: true })
        }}
        className={cn(
          // `outline-none` because of the focus above. The panel is focused to
          // anchor the trap, not to be operated, but the `*` rule in index.css
          // gives everything an outline colour — so whenever WebKit decides
          // programmatic focus counts as focus-visible, it rings the sheet. The
          // sheet is full-width and anchored to the bottom, so the only part of
          // that ring on screen is the top edge: a line that comes and goes
          // with nothing you did.
          "fixed z-50 flex flex-col gap-4 bg-background shadow-lg outline-none transition ease-in-out data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:animate-in data-[state=open]:duration-500",
          side === "right" &&
            "inset-y-0 right-0 h-full w-3/4 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
          side === "left" &&
            "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
          side === "top" &&
            "inset-x-0 top-0 h-auto border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          side === "bottom" && [
            // No top border. The shadcn default assumes a square-cornered panel
            // flush to an edge, where the rule is what separates it from the
            // page. This one is rounded and floats over a dimmed overlay, which
            // does that already — and a border on one edge has to stop
            // somewhere, which on a curve is a hairline dying halfway round it.
            "inset-x-0 h-auto data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
            // Anchored to the bottom of what is visible, not the bottom of the
            // layout viewport — otherwise a sheet that opens the keyboard opens
            // behind it. See `--keyboard-inset` in lib/viewport.
            "bottom-[var(--keyboard-inset,0px)]",
            // Stops short of the top: a sheet that reaches the very top reads
            // as a page. A long one scrolls inside that instead of growing.
            "max-h-[var(--sheet-max)] overflow-y-auto",
          ],
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-secondary">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
