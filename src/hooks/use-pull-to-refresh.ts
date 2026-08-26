import { useEffect, useRef, useState } from "react"

/** How far the list has to come down before letting go means anything. */
const THRESHOLD_PX = 56

/** As far as it will come, however hard it is pulled. */
const MAX_PULL_PX = 96

/**
 * How much of the finger's travel the list follows.
 *
 * Under one, so the list feels weighed down rather than stuck to the finger —
 * the resistance is what says this is a gesture with an end to reach.
 */
const FOLLOW = 0.55

/** Which way the first few pixels went. Below this, a touch has said nothing. */
const AXIS_PX = 5

/**
 * The shortest a refresh is allowed to look like it took.
 *
 * A read that answers in eighty milliseconds is a spinner that blinks, which
 * reads as a glitch rather than as an answer. Long enough to be seen, short
 * enough not to be waited on.
 */
const MIN_SPIN_MS = 450

export type Pull = {
  /** How far the list is held down, in pixels. */
  distance: number
  /** Whether a refresh is running. */
  refreshing: boolean
  /** Whether a finger is on it, so the caller can drop its transition. */
  dragging: boolean
}

/**
 * Pull the top of a list down to read it again.
 *
 * The gesture only starts at the very top and only downwards; a sideways drag
 * belongs to whatever row is under it, and an upward one is the list being
 * scrolled. Once it has decided it is a pull it holds the touch — otherwise
 * the list scrolls under the gesture and both happen at once.
 *
 * Bound natively with `passive: false`, because React registers touch handlers
 * as passive and `preventDefault` inside one does nothing at all.
 *
 * Takes the element rather than a ref to it, so that binding follows the
 * element: opening a chat unmounts this whole screen, and a ref read once on
 * mount goes on pointing at a node that is no longer on the page — or at
 * nothing at all, if the app started on a screen that has no list.
 */
export function usePullToRefresh(
  scroller: HTMLElement | null,
  onRefresh: () => Promise<void> | void,
): Pull {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [dragging, setDragging] = useState(false)

  // The handlers are bound once and live for as long as the element does, so
  // everything they read has to be a ref rather than a captured render value.
  const held = useRef(0)
  const from = useRef<{ x: number; y: number } | null>(null)
  const axis = useRef<"x" | "y" | null>(null)
  const pulling = useRef(false)
  const busy = useRef(false)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const element = scroller
    if (!element) return

    const hold = (px: number) => {
      held.current = px
      setDistance(px)
    }

    const stop = () => {
      pulling.current = false
      from.current = null
      axis.current = null
      setDragging(false)
    }

    const onStart = (event: TouchEvent) => {
      if (busy.current || event.touches.length !== 1 || element.scrollTop > 0) return
      const touch = event.touches[0]
      from.current = { x: touch.clientX, y: touch.clientY }
      axis.current = null
      pulling.current = true
    }

    const onMove = (event: TouchEvent) => {
      if (!pulling.current || !from.current) return
      const touch = event.touches[0]
      const dx = touch.clientX - from.current.x
      const dy = touch.clientY - from.current.y

      if (axis.current === null) {
        if (Math.abs(dx) < AXIS_PX && Math.abs(dy) < AXIS_PX) return
        axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y"
      }

      // Sideways is a row being swiped, upwards is the list being scrolled, and
      // a list that has moved off its top is being scrolled whatever the finger
      // is doing now. None of those are this gesture.
      if (axis.current === "x" || dy <= 0 || element.scrollTop > 0) {
        stop()
        hold(0)
        return
      }

      if (event.cancelable) event.preventDefault()
      setDragging(true)
      hold(Math.min(MAX_PULL_PX, dy * FOLLOW))
    }

    const onEnd = () => {
      if (!pulling.current) return
      const far = held.current >= THRESHOLD_PX
      stop()

      if (!far || busy.current) {
        hold(0)
        return
      }

      // Rests at the threshold while it works, so the spinner has somewhere to
      // sit and letting go does not look like the pull was ignored.
      busy.current = true
      setRefreshing(true)
      hold(THRESHOLD_PX)
      void Promise.all([
        Promise.resolve(refresh.current()).catch(() => {}),
        new Promise((done) => window.setTimeout(done, MIN_SPIN_MS)),
      ]).then(() => {
        busy.current = false
        setRefreshing(false)
        hold(0)
      })
    }

    element.addEventListener("touchstart", onStart, { passive: true })
    element.addEventListener("touchmove", onMove, { passive: false })
    element.addEventListener("touchend", onEnd)
    element.addEventListener("touchcancel", onEnd)

    return () => {
      element.removeEventListener("touchstart", onStart)
      element.removeEventListener("touchmove", onMove)
      element.removeEventListener("touchend", onEnd)
      element.removeEventListener("touchcancel", onEnd)
    }
  }, [scroller])

  return { distance, refreshing, dragging }
}

/** How much of the way to the threshold a pull has come, from 0 to 1. */
export function pullProgress(distance: number): number {
  return Math.min(1, distance / THRESHOLD_PX)
}
