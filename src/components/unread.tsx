import { useCallback, useEffect, useState, type RefObject } from "react"
import { useTranslation } from "react-i18next"

/**
 * The line above the first message that was unread when the thread was opened.
 *
 * A thread always opens at its newest message, so this is how somebody who
 * scrolls back finds where they had got to. Drawn in the thread rather than
 * over it, like the day separators, and in the same small type.
 */
export function UnreadLine({ ref }: { ref: (node: HTMLDivElement | null) => void }) {
  const { t } = useTranslation()
  return (
    <div ref={ref} className="flex items-center gap-3 py-2" role="separator">
      <span className="bg-primary/30 h-px flex-1" />
      <span className="text-primary text-[11px] font-medium">{t("chat.unreadLine")}</span>
      <span className="bg-primary/30 h-px flex-1" />
    </div>
  )
}

/** The way up to that line, floated over the top of the thread. */
export function JumpToUnread({ onJump }: { onJump: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center">
      <button
        type="button"
        onClick={onJump}
        className="bg-card text-foreground pointer-events-auto rounded-full border px-3.5 py-1.5 text-[13px] font-medium shadow-sm active:opacity-60"
      >
        {t("chat.jumpToUnread")}
      </button>
    </div>
  )
}

/**
 * Everything the two thread views share about the unread line.
 *
 * The button is offered until the line has been on screen once, and then not
 * again for the visit: whoever has seen it has found what it was pointing at,
 * whether they jumped or scrolled. Keyed on the line's message rather than
 * reset by hand, because a room's screen is not remounted between rooms.
 *
 * `leaving` is told before the jump, so a view that follows the bottom can stop
 * — otherwise the next link card to finish loading would pull the reader back
 * down from what they just asked to read.
 */
export function useUnreadLine(
  scroller: RefObject<HTMLElement | null>,
  from: string | null,
  leaving?: () => void,
) {
  const [line, setLine] = useState<HTMLDivElement | null>(null)
  const [seen, setSeen] = useState<string | null>(null)

  useEffect(() => {
    const root = scroller.current
    if (!line || !root || !from || seen === from || typeof IntersectionObserver === "undefined") {
      return
    }
    // Set up after the view has put itself at the bottom — its own effects run
    // first — so the first answer is about where the reader actually starts,
    // not the top of a list that has not been scrolled yet.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(from)
      },
      { root },
    )
    observer.observe(line)
    return () => observer.disconnect()
  }, [scroller, line, from, seen])

  /**
   * Put the line a third of the way down, so a few of the messages already read
   * sit above it for context. A thread with fewer than that above the line
   * simply stops at its top.
   */
  const jump = useCallback(() => {
    const root = scroller.current
    if (!root || !line) return
    leaving?.()
    const top =
      line.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop
    root.scrollTo({ top: Math.max(0, top - root.clientHeight / 3), behavior: "smooth" })
  }, [scroller, line, leaving])

  return {
    holdLine: setLine,
    offer: from !== null && line !== null && seen !== from,
    jump,
  }
}
