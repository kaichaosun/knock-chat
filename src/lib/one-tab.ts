/**
 * One tab of this app at a time, and which one.
 *
 * Two tabs signed into the same address are two readers of things that only
 * survive being read once. The relay holds a direct message for its recipient
 * and deletes it as it is collected — `ack` in the store — so whichever tab
 * collects a piece of an answer is the only one that will ever have it, and the
 * other is left waiting for something that no longer exists. Local history is
 * worse: it is one blob under one key, written whole on every change from
 * whatever that tab happens to hold, so a tab that has not looked since it
 * opened writes its own past over everything said since. Both of those are
 * shared-state problems with the same shape, and both go away when there is
 * exactly one reader and one writer.
 *
 * The Web Locks API is what makes it exact rather than approximate: a lock is
 * per origin per browser profile, which is precisely the boundary the identity
 * key, the session and the history are stored on, and the browser takes it back
 * when a tab closes or crashes. Nothing has to notice a tab that went away.
 *
 * Newest wins. A tab that opens takes it from the one that had it, because
 * opening a room link is how people arrive and a link that leads to a wall is
 * a link that does not work. Nothing is lost by standing down — everything is
 * in storage — and the tab that stood down keeps its place in the queue, so it
 * comes back by itself when the holder closes.
 */

/** The name of both the lock and the channel: one thing, one conversation. */
export const ONE_TAB = "knock:one-tab"

/** What a tab says when it wants to be the one. */
const CLAIM = "claim"

/**
 * How long to say nothing while it is settled.
 *
 * A tab that is given the lock straight away — the ordinary case, one tab —
 * must not show the other-tab screen on its way in, and the grant arrives a
 * task later rather than at once. So nothing is drawn until either the lock
 * arrives or this passes, which is short enough to read as part of loading.
 */
export const SETTLING_MS = 250

/** Whether this tab is the one, or is standing by until it can be. */
export type TabState = "held" | "waiting"

/** The part of `navigator.locks` this needs. */
export type LockGate = {
  request(
    name: string,
    options: { signal: AbortSignal },
    run: () => Promise<void>,
  ): Promise<void>
}

/**
 * The part of a `BroadcastChannel` this needs.
 *
 * There is no `removeEventListener` because there is nothing to remove it for:
 * a closed channel delivers nothing, so `close` ends the listening as well as
 * the talking.
 */
export type Room = {
  postMessage(message: string): void
  close(): void
  addEventListener(type: "message", listen: (event: { data: unknown }) => void): void
}

/**
 * Hold the lock for as long as this tab lives, and hand it over when asked.
 *
 * `told` is called whenever the answer changes, and not before it is known: a
 * caller starts out knowing nothing and draws nothing until this says.
 *
 * Returns the way to stop, which releases the lock or leaves the queue.
 */
export function oneTab(
  gate: LockGate,
  room: Room,
  told: (state: TabState) => void,
): () => void {
  const going = new AbortController()
  /** Hands the lock back. Null whenever this tab is not the one holding it. */
  let letGo: (() => void) | null = null
  /** Declared before it is set: the lock can arrive before this line does. */
  let settling: ReturnType<typeof setTimeout> | undefined

  const queue = () => {
    gate
      .request(
        ONE_TAB,
        { signal: going.signal },
        () =>
          new Promise<void>((done) => {
            letGo = done
            clearTimeout(settling)
            told("held")
          }),
      )
      .then(() => {
        // Given up: handed over, or this tab is going away.
        letGo = null
        if (going.signal.aborted) return
        told("waiting")
        // Back of the line rather than out of it, so closing whichever tab took
        // it over brings this one back to life without anybody asking.
        queue()
      })
      .catch(() => {
        // Dropped from the queue by `stop`, having never held anything.
      })
  }

  room.addEventListener("message", (event) => {
    if (event.data !== CLAIM) return
    // Only whoever has it can give it up. A tab that is waiting has nothing to
    // hand over and is already in the line — and answering would be how two
    // tabs that started together could pass it back and forth forever.
    letGo?.()
  })

  // Queued before anybody is told, so a holder letting go cannot be overtaken:
  // by the time it hears, this tab's place in the line is already taken.
  queue()
  room.postMessage(CLAIM)

  // Only for the tab that has to wait and will not be handed anything: two tabs
  // opened together queue behind each other, and the one that loses hears
  // nothing more. Cleared the moment the lock arrives.
  if (!letGo) {
    settling = setTimeout(() => {
      if (!letGo) told("waiting")
    }, SETTLING_MS)
  }

  return () => {
    going.abort()
    clearTimeout(settling)
    letGo?.()
    letGo = null
    room.close()
  }
}

/**
 * Ask whoever has it to hand it over.
 *
 * For the tab that is standing by: it is already in the queue, so all this does
 * is get the holder to let go and let the line move.
 */
export function claim(room: Room): void {
  room.postMessage(CLAIM)
}
