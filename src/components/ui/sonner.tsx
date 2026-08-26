"use client"

import { AlertTriangle, CircleCheck, Info, Loader2, OctagonX } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/hooks/use-theme"

/**
 * Toasts, dressed like the rest of the app.
 *
 * Sonner injects its own stylesheet at runtime, which lands after Tailwind's
 * and therefore wins every tie — so what can be said with the variables it
 * exposes is said there, and the rest is marked important on purpose rather
 * than by habit. Its own defaults are a system font on a white rounded
 * rectangle, which is exactly the "some website" look this is here to avoid.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  // Toasts are portalled to the body, outside #root, so they inherit none of
  // the app's styling and have to be told which palette to paint in.
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      // Above, where nothing else is. The bottom of a phone is the composer,
      // the tab bar and the compose button, and a toast landing on any of them
      // is a toast that gets tapped through.
      position="top-center"
      duration={3500}
      // Below the notch rather than through it, and inset by the gutter the
      // lists use so it reads as part of the same page.
      offset={{ top: "calc(env(safe-area-inset-top) + 0.75rem)", left: "1rem", right: "1rem" }}
      mobileOffset={{
        top: "calc(env(safe-area-inset-top) + 0.75rem)",
        left: "0.875rem",
        right: "0.875rem",
      }}
      // Our own marks, coloured by what they mean. `richColors` is not used:
      // it paints the whole toast green or red, which is a banner rather than a
      // message and belongs to a louder app than this one.
      icons={{
        success: <CircleCheck className="text-success size-4.5" strokeWidth={2.25} />,
        info: <Info className="text-primary size-4.5" strokeWidth={2.25} />,
        warning: <AlertTriangle className="text-warning size-4.5" strokeWidth={2.25} />,
        error: <OctagonX className="text-destructive size-4.5" strokeWidth={2.25} />,
        loading: <Loader2 className="text-muted-foreground size-4.5 animate-spin" />,
      }}
      style={
        {
          // Inline, so it beats the stylesheet sonner injects: without this the
          // toast is the one thing on screen not set in the app's own face.
          fontFamily: "inherit",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // The radius every card, sheet and dialog here uses.
          "--border-radius": "1rem",
          "--width": "min(calc(100vw - 2rem), 24rem)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Lifted more than sonner lifts it: this floats over a coloured app
          // rather than over a document.
          toast: "shadow-lg! items-center! gap-3!",
          title: "text-[13.5px]! leading-snug! font-semibold!",
          // Sonner hard-codes two greys here, one per theme, and neither is
          // ours.
          description: "text-muted-foreground! text-[12.5px]! leading-snug!",
          icon: "m-0! size-4.5! shrink-0!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
