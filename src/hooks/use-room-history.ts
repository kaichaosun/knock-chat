import { useCallback, useEffect, useRef, useState } from "react"

import { groupHistory, type Envelope } from "@/lib/relay"

/**
 * How far back a room has been read, and how to read further.
 *
 * A room's past does not arrive through the message feed. That feed is a queue
 * drained by a cursor that only moves forward, so a member who is up to date is
 * by definition past everything older than their membership — see
 * `groupHistory`. It is asked for instead, newest page first, walking backwards.
 *
 * Held per room and only for this session. Reopening a room asks for its newest
 * page again, which costs one request and cannot duplicate anything: the merge
 * is keyed on message id and leaves the feed's cursor alone.
 */
export function useRoomHistory(
  room: string | null,
  /** Whether this room shares its past at all. A room that does not has none. */
  shares: boolean,
  absorb: (envelopes: Envelope[]) => void,
  /**
   * Changes every time somebody opens a room, including the one already open.
   *
   * The room's id cannot carry that on its own. Delete a chat in the two-pane
   * layout and the room never closes, so picking it from the list again leaves
   * the id exactly as it was — and asking for it back is precisely what that
   * tap means.
   */
  opened: number,
) {
  /**
   * Where each room's next page back starts.
   *
   * Three states, and they are not the same question: absent means nothing has
   * been asked for yet, `null` means the beginning of the room has been reached,
   * and a number is somewhere left to go.
   */
  const [pages, setPages] = useState<Record<string, { next: number | null; loading: boolean }>>({})

  /**
   * Rooms whose first page has been asked for.
   *
   * A ref rather than derived from `pages`, because the request is in flight
   * long before any state lands — two renders in that window would both see no
   * entry and both fetch.
   */
  const asked = useRef<Set<string>>(new Set())

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
        asked.current.delete(id)
        setPages((current) => ({ ...current, [id]: { next: current[id]?.next ?? null, loading: false } }))
      }
    },
    [absorb],
  )

  // The newest page, once per room per session. Only for rooms that share their
  // past, so an ordinary room costs no request at all.
  useEffect(() => {
    if (!room || !shares || asked.current.has(room)) return
    asked.current.add(room)
    void fetchPage(room, null)
  }, [room, shares, fetchPage, opened])

  /**
   * Forget what is known about a room's past, so opening it asks again.
   *
   * Deleting a chat throws away the messages but not the memory of having
   * fetched them — and that memory is what stops the fetch. Without this the
   * room opens empty and stays empty until the page is reloaded, which is a
   * strange thing for "delete" to have done.
   */
  const forget = useCallback((id: string) => {
    asked.current.delete(id)
    setPages((current) => {
      if (!(id in current)) return current
      const { [id]: _gone, ...rest } = current
      return rest
    })
  }, [])

  const state = room ? pages[room] : undefined

  const loadEarlier = useCallback(() => {
    if (!room) return
    const here = pages[room]
    if (!here || here.loading || here.next === null) return
    void fetchPage(room, here.next)
  }, [room, pages, fetchPage])

  return {
    /** Whether there is anything older to fetch. False before the first page lands. */
    hasEarlier: state?.next != null,
    /** A page is in flight, so the list should say so rather than look stuck. */
    loadingEarlier: state?.loading ?? false,
    loadEarlier,
    forget,
  }
}
