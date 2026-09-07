import { useEffect, useRef, useState, type ReactNode } from "react"
import { MoreHorizontal, Trash2 } from "lucide-react"

import { cn } from "@/lib/utils"

/** How far the row slides to reveal Delete, and how far a swipe must go to stick. */
const REVEAL_PX = 92
const COMMIT_PX = 45
/**
 * How far a finger travels before the gesture has to declare itself.
 *
 * Lower than the slop above, and deliberately: the scroller commits within a
 * frame or two of the first movement, so an answer that arrives at 8px arrives
 * after the decision it was meant to influence.
 */
const AXIS_PX = 5
/**
 * How recently a finger must have landed for a `contextmenu` to be its doing.
 *
 * Comfortably past the ~500ms a browser waits before raising one, and far short
 * of anything somebody would call a separate gesture.
 */
const TOUCH_MENU_MS = 1500

/** How long a finger has to stay put before it counts as a press rather than
 *  the start of a swipe. */
const HOLD_MS = 450
/** Width at which the icon and label fit; below it they would be clipped. */
const LABEL_PX = 64

/**
 * A list row that swipes left to uncover a Delete button.
 *
 * Deleting is deliberately not a button sitting in the row: both of these lists
 * hold things that are expensive or impossible to get back — a conversation, or
 * a channel someone paid to open — and a target you can hit by accident is the
 * wrong shape for that.
 *
 * A held finger is reported separately and changes nothing about the swipe: the
 * two are told apart by whether the finger moved, which is the same question the
 * swipe already had to answer.
 *
 * Neither gesture exists for a mouse. Both are bound to touch, so on a desktop
 * every action behind them — deleting, pinning — was simply unreachable. What
 * stands in for them is `onMenu`: the right-click a list row is expected to
 * answer, and a button that appears on hover for anyone who does not think to
 * try it. Not a delete button, though, for the reason above; it opens the same
 * thing a held finger does, and the choosing still happens there.
 */
export function SwipeRow({
  actionLabel,
  onAction,
  onClick,
  revealed,
  onReveal,
  onLongPress,
  onMenu,
  menuLabel,
  menuAlign = "center",
  className,
  surface,
  selected,
  children,
}: {
  /** Read out for the Delete button; say what is being deleted. */
  actionLabel: string
  onAction: () => void
  onClick: () => void
  revealed: boolean
  onReveal: (open: boolean) => void
  /** Fires when the finger stays put. Omit and the row has no press. */
  onLongPress?: () => void
  /**
   * The pointer's way to whatever a held finger opens — right-click, or the
   * button that appears on hover. Omit and the row offers neither.
   */
  onMenu?: () => void
  /** Read out for that button; say what it opens and for which row. */
  menuLabel?: string
  /**
   * Where that button sits.
   *
   * `top` for a row that already puts something in its top-right corner — a
   * time — which then steps aside for it. Anywhere else the corner is empty
   * and the middle of the row is the natural place. Neither ever moves the
   * row's own content: covering it and pushing it aside are both worse than
   * trading places with the one thing that can spare the moment.
   */
  menuAlign?: "center" | "top"
  /** For the row's outer shape — rounding a run of rows into one block. */
  className?: string
  /**
   * What the row is drawn on. Must be opaque: the Delete panel sits underneath
   * and would wash through anything less.
   */
  surface?: string
  /** Whether this row is the one currently selected. */
  selected?: boolean
  children: ReactNode
}) {
  // Tracked in a ref rather than state: this updates on every touchmove, and
  // re-rendering the list at that rate would stutter.
  const start = useRef<{ x: number; y: number } | null>(null)
  // Set once a gesture has travelled far enough to be a swipe. The browser fires a
  // click after touchend, and without this that click would open the row too.
  const swiped = useRef(false)
  /**
   * Which way this gesture turned out to be going, decided once.
   *
   * Asking per move instead is what makes a list feel loose: a finger on its
   * way down wanders sideways by a pixel or two, and for that one frame the
   * horizontal distance is the larger of the two, so the row shifts and then
   * goes back. Android never showed it because Chrome settles on a scroll axis
   * itself and stops delivering the moves; WebKit hands over every one.
   */
  const axis = useRef<"x" | "y" | null>(null)
  const row = useRef<HTMLButtonElement>(null)
  // The pending press, and whether one already fired. The second exists for the
  // same reason `swiped` does: a click still arrives after the finger lifts, and
  // opening the thread behind the menu that just opened would be a surprise.
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  /**
   * When a finger last landed on this row.
   *
   * Kept for one question, asked below: a `contextmenu` is a right-click on a
   * desktop and a long press on Android, and only one of those was meant to
   * open anything.
   *
   * A time rather than a flag, because a flag has to be cleared and there is no
   * safe moment to clear it. Chrome may cancel the touch *before* raising the
   * menu, which would clear it too early; never clearing it would leave a
   * touchscreen laptop unable to right-click afterwards. A stamp answers the
   * question — was a finger involved — whatever order the events arrive in.
   */
  const fingered = useRef(0)
  const [drag, setDrag] = useState(0)

  /**
   * Touchmove, bound by hand.
   *
   * React registers this event passively, so `preventDefault` inside an
   * `onTouchMove` prop is a no-op — the browser has already been promised it
   * can scroll. A fast swipe is never purely sideways, WebKit sees the vertical
   * part of it and starts panning, and nothing in a passive handler can take
   * that back. Bound here instead, non-passive, so the row can say the gesture
   * is spoken for.
   *
   * Mounted once. Everything it reads is a ref or a setter, both of which
   * outlive a render.
   */
  useEffect(() => {
    const element = row.current
    if (!element) return

    const onMove = (event: TouchEvent) => {
      if (!start.current) return
      const touch = event.touches[0]
      const dx = start.current.x - touch.clientX
      const dy = touch.clientY - start.current.y

      // Settled on the first movement worth reading, and kept for the rest of
      // the gesture. Below that this is neither yet, and nothing moves.
      if (axis.current === null) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
        // Whichever way it went, it went somewhere, so it is not a press.
        stopHolding()
      }
      // A scroll stays a scroll, however the finger wanders on the way down.
      if (axis.current === "y") return

      // Spoken for. Without this the list scrolls under a sideways swipe,
      // which is the whole reason this listener is not the React one.
      if (event.cancelable) event.preventDefault()

      swiped.current = true
      setDrag(Math.max(0, Math.min(dx, REVEAL_PX)))
    }

    element.addEventListener("touchmove", onMove, { passive: false })
    return () => element.removeEventListener("touchmove", onMove)
  }, [])

  const stopHolding = () => {
    if (holding.current === null) return
    clearTimeout(holding.current)
    holding.current = null
  }

  const distance = revealed ? REVEAL_PX : drag
  // Either fully there or not at all — a partly faded label reads as blurry, and a
  // partly uncovered one reads as broken. It crosses over past the commit point, so
  // its arrival also says that letting go now will keep the row open.
  const showLabel = distance >= LABEL_PX

  return (
    // The rule between rows starts where the text does, not at the edge of the
    // screen: it separates what is being read, and running it under the avatar
    // chops the column of faces in half instead of letting it read as a
    // gutter. 4.375rem is px-3 + size-11 + gap-3.5 below — the row's own
    // measurements, so the two cannot drift apart.
    <li
      className={cn(
        // `group` so the hover button below can key off the whole row rather
        // than only the few pixels it covers.
        "group relative overflow-hidden rounded-2xl",
        "after:bg-border/70 after:pointer-events-none after:absolute after:right-4",
        "after:bottom-0 after:left-[4.375rem] after:h-px last:after:hidden",
        className,
      )}
    >
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
        ref={row}
        style={{ transform: `translateX(${-distance}px)` }}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          fingered.current = Date.now()
          start.current = { x: touch.clientX, y: touch.clientY }
          swiped.current = false
          axis.current = null
          held.current = false
          if (!onLongPress) return
          holding.current = setTimeout(() => {
            holding.current = null
            held.current = true
            onLongPress()
          }, HOLD_MS)
        }}
        onTouchCancel={stopHolding}
        onContextMenu={
          onMenu &&
          ((event) => {
            // The browser's own menu offers nothing for a row like this, and
            // having both would bury ours under it. Refused either way.
            event.preventDefault()
            // A right-click, which is what this was written for — a mouse has
            // neither of the gestures above and would otherwise reach nothing.
            // Android raises the same event for a held finger, and answering it
            // there put a confirmation in front of anyone who rested a thumb on
            // a row. Touch has the swipe; this is the other half.
            if (Date.now() - fingered.current < TOUCH_MENU_MS) return
            onMenu()
          })
        }
        onTouchEnd={() => {
          stopHolding()
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
          if (held.current) {
            held.current = false
            return
          }
          if (revealed) onReveal(false)
          else onClick()
        }}
        className={cn(
          // The browser owns the vertical, this owns the horizontal. Unless it
          // is told, WebKit keeps both live at once and they fight over every
          // diagonal.
          "touch-pan-y",
          "relative flex w-full items-center gap-3.5 px-3 py-3.5 text-left transition-colors",
          // Opaque, always: a translucent row would let the Delete panel wash
          // through it while the finger is down.
          surface ?? "bg-background active:bg-muted",
          // Which thread the pane beside this is showing, on a wide window.
          //
          // The bar always; the tint only on a row that had no surface of its
          // own. Half-strength accent is what the pinned block is made of at
          // full strength, so laying it over one of those rows made it *lighter*
          // than the rows around it — selection reading as less emphasis rather
          // than more. There is nothing to say by tinting a row that is already
          // tinted, and the bar says it on any surface.
          selected && !surface && "bg-accent/50",
          selected && "border-l-2 border-primary",
          drag === 0 && "transition-transform",
        )}
      >
        {children}
      </button>

      {/* Only where there is a pointer to hover with. On a phone the row is
          already covered by the swipe and the press, and a permanent target
          this close to the whole row is what those two were avoiding.

          Kept present rather than mounted on hover so it can be tabbed to,
          which is the other way a mouseless desktop reaches it. */}
      {onMenu && (
        <button
          type="button"
          aria-label={menuLabel}
          onClick={onMenu}
          className={cn(
            "text-muted-foreground hover:bg-muted hover:text-foreground absolute right-2",
            "hidden rounded-lg p-1.5 opacity-0 transition-opacity lg:block",
            "focus-visible:opacity-100 group-hover:opacity-100",
            menuAlign === "top" ? "top-2" : "top-1/2 -translate-y-1/2",
          )}
        >
          <MoreHorizontal className="size-4" />
        </button>
      )}
    </li>
  )
}
