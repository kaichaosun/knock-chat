import { useCallback, useState } from "react"

import { groupHistory, type Envelope } from "@/lib/relay"

/**
 * How far back a room has been read, and how to read further.
 *
 * A room's past does not arrive through the message feed. That feed is a queue
 * drained by a cursor that only moves forward, so a member who is up to date is
 * by definition past everything older than their membership — see
 * `groupHistory`. It is asked for instead, newest page first, walking backwards.
 *
 * Nothing is fetched on opening a room — only on being asked, by pulling the
 * top of the list down. A room therefore opens showing what this device already
 * holds, and somebody who deleted a chat does not find it quietly restored.
 *
 * Held per room and only for this session. The merge is keyed on message id and
 * leaves the feed's cursor alone, so pulling for a page already held costs a
 * request and changes nothing.
 */
export function useRoomHistory(
  room: string | null,
  /** Whether this room shares its past at all. A room that does not has none. */
  shares: boolean,
  absorb: (envelopes: Envelope[]) => void,
) {
  /**
   * Where each room's next page back starts.
   *
   * Three states, and they are not the same question: absent means nothing has
   * been asked for yet, `null` means the beginning of the room has been reached,
   * and a number is somewhere left to go.
   */
  const [pages, setPages] = useState<Record<string, { next: number | null; loading: boolean }>>({})

  const fetchPage = useCallback(
    async (id: string, before: number | null) => {
      setPages((current) => ({ ...current, [id]: { next: current[id]?.next ?? null, loading: true } }))
      try {
        const page = await groupHistory(id, before === null ? {} : { before })
        absorb(page.messages)
        setPages((current) => ({ ...current, [id]: { next: page.next, loading: false } }))
      } catch {
        // Nothing to say out loud: the room still works from here on, which is
        // what it did before there was any history to fetch. The cursor is left
        // where it was and the room forgotten, so asking again retries.
        setPages((current) => ({ ...current, [id]: { next: current[id]?.next ?? null, loading: false } }))
      }
    },
    [absorb],
  )

  /**
   * Forget what is known about a room's past, so opening it asks again.
   *
   * Deleting a chat throws away the messages but not the memory of having
   * fetched them — and that memory is what stops the fetch. Without this the
   * room opens empty and stays empty until the page is reloaded, which is a
   * strange thing for "delete" to have done.
   */
  const forget = useCallback((id: string) => {
    setPages((current) => {
      if (!(id in current)) return current
      const { [id]: _gone, ...rest } = current
      return rest
    })
  }, [])

  const state = room ? pages[room] : undefined

  const loadEarlier = useCallback(() => {
    if (!room || !shares) return
    const here = pages[room]
    if (here?.loading) return
    // The beginning of the room, already reached.
    if (here && here.next === null) return
    // `null` on the first pull, which asks for the newest page; after that,
    // wherever the last one ran out.
    void fetchPage(room, here?.next ?? null)
  }, [room, shares, pages, fetchPage])

  return {
    /**
     * Whether pulling would fetch anything — true before the first page too.
     *
     * That is the point of it. Nothing is fetched until it is asked for, so a
     * room opens holding only what this device already had, and reopening a
     * chat somebody deleted does not quietly hand back what they deleted.
     */
    hasEarlier: shares && (state === undefined || state.next !== null),
    /** A page is in flight, so the list should say so rather than look stuck. */
    loadingEarlier: state?.loading ?? false,
    loadEarlier,
    forget,
  }
}
