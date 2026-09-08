import { afterEach, describe, expect, it, vi } from "vitest"

import { SETTLING_MS, claim, oneTab } from "./one-tab"
import type { LockGate, Room, TabState } from "./one-tab"

/**
 * A lock manager, in as much as this needs one: exclusive, and first in line
 * first served. The real one is per browser profile and takes the lock back
 * when a tab dies; neither happens in a test, and neither is what the protocol
 * built on top can get wrong.
 */
function locks(): LockGate {
  let held = false
  const line: Array<() => void> = []

  const next = () => {
    const waiting = line.shift()
    waiting?.()
  }

  return {
    request(_name, { signal }, run) {
      return new Promise<void>((granted, dropped) => {
        // Granted a turn later, never during the call that asked. The real one
        // runs the callback in a task, and the difference is the whole of two
        // tabs opening together: both are in the line before either holds
        // anything, so neither can hand over what it has not got.
        // Taken at once, but handed over a turn later — never during the call
        // that asked for it. The real one runs the callback in a task, and the
        // difference is the whole of two tabs opening together: both are in the
        // line before either holds anything, so neither can hand over what it
        // has not got.
        const start = () => {
          held = true
          queueMicrotask(() => {
            void run().then(() => {
              held = false
              granted()
              next()
            })
          })
        }
        if (!held) {
          start()
          return
        }
        const queued = () => start()
        line.push(queued)
        signal.addEventListener("abort", () => {
          const at = line.indexOf(queued)
          if (at === -1) return
          line.splice(at, 1)
          dropped(new Error("aborted"))
        })
      })
    },
  }
}

/** Channels on one bus, each hearing everything but its own. */
function bus() {
  const rooms = new Set<{
    room: Room
    listeners: Array<(event: { data: unknown }) => void>
  }>()
  return {
    join(): Room {
      const listeners: Array<(event: { data: unknown }) => void> = []
      const mine = {
        room: {
          addEventListener(_type: "message", listen: (event: { data: unknown }) => void) {
            listeners.push(listen)
          },
          postMessage(message: string) {
            for (const other of rooms) {
              if (other === mine) continue
              for (const listen of other.listeners) listen({ data: message })
            }
          },
          close() {
            rooms.delete(mine)
          },
        },
        listeners,
      }
      rooms.add(mine)
      return mine.room
    },
  }
}

/** Let every pending `then` run. */
const settle = () => new Promise((done) => setTimeout(done, 0))

/** One tab, remembering what it has been told. */
function tab(gate: LockGate, wires: ReturnType<typeof bus>) {
  const said: TabState[] = []
  const room = wires.join()
  const stop = oneTab(gate, room, (state) => said.push(state))
  return {
    room,
    stop,
    said,
    get state() {
      return said[said.length - 1]
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("one tab at a time", () => {
  it("gives it to the only tab there is", async () => {
    const wires = bus()
    const only = tab(locks(), wires)
    await settle()
    expect(only.state).toBe("held")
  })

  it("hands it to a tab that opens later, and stands the first one down", async () => {
    // The one that matters: a room link opens in a new tab, and a link that
    // leads to a wall is a link that does not work.
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    await settle()

    const second = tab(gate, wires)
    await settle()

    expect(second.state).toBe("held")
    expect(first.state).toBe("waiting")
  })

  it("says nothing on the way in, so the ordinary tab never sees the wall", async () => {
    const wires = bus()
    const only = tab(locks(), wires)
    expect(only.said).toEqual([])
    await settle()
    expect(only.said).toEqual(["held"])
  })

  it("hands it back to whoever asks for it again", async () => {
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    await settle()
    const second = tab(gate, wires)
    await settle()

    claim(first.room)
    await settle()

    expect(first.state).toBe("held")
    expect(second.state).toBe("waiting")
  })

  it("wakes the tab standing by when the one holding it closes", async () => {
    // What keeps a tab that stood down from being dead: it is still in the
    // queue, so closing the other one is enough.
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    await settle()
    const second = tab(gate, wires)
    await settle()
    expect(first.state).toBe("waiting")

    second.stop()
    await settle()

    expect(first.state).toBe("held")
  })

  it("leaves the holder alone when a tab standing by closes", async () => {
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    await settle()
    const second = tab(gate, wires)
    await settle()

    first.stop()
    await settle()

    expect(second.state).toBe("held")
  })

  it("tells a tab that opened alongside another to stand by", async () => {
    // Two at once — a session restored, or two links opened together. Neither
    // hears the other's claim while holding anything, so the line settles where
    // it is instead of passing it back and forth.
    vi.useFakeTimers()
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    const second = tab(gate, wires)
    await vi.advanceTimersByTimeAsync(SETTLING_MS)

    expect(first.state).toBe("held")
    expect(second.state).toBe("waiting")
  })

  it("does not take a lock it has already been told to let go of", async () => {
    // Mounted and unmounted before the grant arrives, which is every effect in
    // development. The queued request must not come back holding anything.
    const gate = locks()
    const wires = bus()
    const first = tab(gate, wires)
    await settle()

    const second = tab(gate, wires)
    second.stop()
    await settle()

    expect(second.said).toEqual([])
    expect(first.state).toBe("held")
  })
})
