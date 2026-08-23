import { useRef, useState, type ReactNode } from "react"
import { Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

/** How far the row slides to reveal Delete, how far a swipe must go to stick, and
 *  how much travel separates a swipe from a tap. */
const REVEAL_PX = 92
const COMMIT_PX = 45
const SLOP_PX = 8
/** Width at which the icon and label fit; below it they would be clipped. */
const LABEL_PX = 64

/**
 * A list row that swipes left to uncover a Delete button.
 *
 * Deleting is deliberately not a button sitting in the row: both of these lists
 * hold things that are expensive or impossible to get back — a conversation, or
 * a channel someone paid to open — and a target you can hit by accident is the
 * wrong shape for that.
 */
export function SwipeRow({
  actionLabel,
  onAction,
  onClick,
  revealed,
  onReveal,
  children,
}: {
  /** Read out for the Delete button; say what is being deleted. */
  actionLabel: string
  onAction: () => void
  onClick: () => void
  revealed: boolean
  onReveal: (open: boolean) => void
  children: ReactNode
}) {
  // Tracked in a ref rather than state: this updates on every touchmove, and
  // re-rendering the list at that rate would stutter.
  const start = useRef<{ x: number; y: number } | null>(null)
  // Set once a gesture has travelled far enough to be a swipe. The browser fires a
  // click after touchend, and without this that click would open the row too.
  const swiped = useRef(false)
  const [drag, setDrag] = useState(0)

  const distance = revealed ? REVEAL_PX : drag
  // Either fully there or not at all — a partly faded label reads as blurry, and a
  // partly uncovered one reads as broken. It crosses over past the commit point, so
  // its arrival also says that letting go now will keep the row open.
  const showLabel = distance >= LABEL_PX

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Grows in from the right edge as the row slides, so it is never wider than
          what the swipe has actually uncovered — otherwise it would show through
          any row that is not fully opaque. */}
      <button
        type="button"
        aria-label={actionLabel}
        tabIndex={revealed ? 0 : -1}
        onClick={() => {
          onReveal(false)
          onAction()
        }}
        style={{ width: distance }}
        className="bg-destructive text-destructive-foreground absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 overflow-hidden"
      >
        <span
          className={cn(
            "flex flex-col items-center gap-1 transition-opacity duration-150",
            showLabel ? "opacity-100" : "opacity-0",
          )}
        >
          <Trash2 className="size-4.5" />
          <span className="text-[11px] font-semibold">Delete</span>
        </span>
      </button>

      <button
        type="button"
        style={{ transform: `translateX(${-distance}px)` }}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          start.current = { x: touch.clientX, y: touch.clientY }
          swiped.current = false
        }}
        onTouchMove={(event) => {
          if (!start.current) return
          const touch = event.touches[0]
          const dx = start.current.x - touch.clientX
          // Ignore mostly-vertical gestures so the list still scrolls.
          if (Math.abs(touch.clientY - start.current.y) > Math.abs(dx)) return
          if (Math.abs(dx) > SLOP_PX) swiped.current = true
          setDrag(Math.max(0, Math.min(dx, REVEAL_PX)))
        }}
        onTouchEnd={() => {
          if (drag > COMMIT_PX) onReveal(true)
          else if (revealed) onReveal(false)
          setDrag(0)
          start.current = null
        }}
        onClick={() => {
          // A swipe that fell short still ends in a click; it must not open the row.
          if (swiped.current) {
            swiped.current = false
            return
          }
          if (revealed) onReveal(false)
          else onClick()
        }}
        className={cn(
          // Opaque, always: a translucent row would let the Delete panel wash
          // through it while the finger is down.
          "bg-background relative flex w-full items-center gap-3.5 px-3 py-3.5 text-left",
          "active:bg-muted transition-colors",
          drag === 0 && "transition-transform",
        )}
      >
        {children}
      </button>
    </li>
  )
}
