import { beforeEach, describe, expect, it, vi } from "vitest"

import { adopt, forget, markGone, remember, roomIn, snapshot } from "./rooms"
import type { Group } from "./relay"

const ME = "NQ34 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HY2"

function room(id: string, name: string): Group {
  return {
    id,
    owner: ME,
    name,
    join_price_luna: 0,
    requires_approval: false,
    created_at: "2026-08-25T00:00:00Z",
  }
}

/** A localStorage that lives only as long as the test. */
function stubStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

beforeEach(() => {
  stubStorage()
  adopt(ME)
})

describe("remembering rooms", () => {
  it("keeps what the relay described", () => {
    remember([room("a", "Lobby")])
    expect(roomIn(snapshot(), "a")?.name).toBe("Lobby")
  })

  it("keeps a room a later list does not mention", () => {
    // A list of the rooms you are in says nothing about one you left, and that
    // is exactly when its thread still needs a name.
    remember([room("a", "Lobby"), room("b", "Garden")])
    remember([room("b", "Garden")])
    expect(roomIn(snapshot(), "a")?.name).toBe("Lobby")
  })

  it("takes a new name for a room it already knew", () => {
    remember([room("a", "Lobby")])
    remember([room("a", "Front room")])
    expect(roomIn(snapshot(), "a")?.name).toBe("Front room")
  })

  it("does not churn when nothing moved", () => {
    remember([room("a", "Lobby")])
    const settled = snapshot()
    remember([room("a", "Lobby")])
    expect(snapshot()).toBe(settled)
  })

  it("drops the faces when a room ends", () => {
    // The mosaic is drawn from the people who were in a room. A room that no
    // longer exists is not somewhere anybody is.
    remember([{ ...room("a", "Lobby"), members: [ME] }])
    expect(roomIn(snapshot(), "a")?.members).toEqual([ME])
    markGone("a")
    expect(roomIn(snapshot(), "a")?.members).toBeUndefined()
    expect(roomIn(snapshot(), "a")?.gone).toBe(true)
    expect(roomIn(snapshot(), "a")?.name).toBe("Lobby")
  })

  it("stays ended even if an older list still mentions it", () => {
    remember([{ ...room("a", "Lobby"), members: [ME] }])
    markGone("a")
    remember([{ ...room("a", "Lobby"), members: [ME] }])
    expect(roomIn(snapshot(), "a")?.gone).toBe(true)
    expect(roomIn(snapshot(), "a")?.members).toBeUndefined()
  })

  it("does not churn when told twice that a room ended", () => {
    remember([room("a", "Lobby")])
    markGone("a")
    const settled = snapshot()
    markGone("a")
    expect(snapshot()).toBe(settled)
  })

  it("remembers the ending across a reload", () => {
    remember([room("a", "Lobby")])
    markGone("a")
    adopt(null)
    adopt(ME)
    expect(roomIn(snapshot(), "a")?.gone).toBe(true)
  })

  it("forgets one outright", () => {
    remember([room("a", "Lobby")])
    forget("a")
    expect(roomIn(snapshot(), "a")).toBeUndefined()
  })

  it("survives a reload", () => {
    remember([room("a", "Lobby")])
    adopt(null)
    expect(roomIn(snapshot(), "a")).toBeUndefined()
    adopt(ME)
    expect(roomIn(snapshot(), "a")?.name).toBe("Lobby")
  })

  it("does not carry rooms between identities", () => {
    remember([room("a", "Lobby")])
    adopt("NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT")
    expect(roomIn(snapshot(), "a")).toBeUndefined()
  })

  it("drops anything in storage that could not be drawn", () => {
    stubStorage({
      [`knock.rooms.${ME.replace(/ /g, "")}`]: JSON.stringify({
        a: { id: "a" },
        b: room("b", "Garden"),
        c: "not a room",
      }),
    })
    adopt(ME)
    expect(roomIn(snapshot(), "a")).toBeUndefined()
    expect(roomIn(snapshot(), "b")?.name).toBe("Garden")
    expect(roomIn(snapshot(), "c")).toBeUndefined()
  })

  it("treats malformed storage as nothing remembered", () => {
    stubStorage({ [`knock.rooms.${ME.replace(/ /g, "")}`]: "{ not json" })
    expect(() => adopt(ME)).not.toThrow()
    expect(snapshot()).toEqual({})
  })
})
