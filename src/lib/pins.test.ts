import { beforeEach, describe, expect, it, vi } from "vitest"

import { adopt, arrange, isPinned, MAX_PINS, pin, snapshot, toggle, unpin } from "./pins"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"
const ME = "NQ34 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HY2"
const ROOM = "room-7f3a"

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

const rows = (...keys: string[]) => keys.map((key) => ({ key }))

beforeEach(() => {
  stubStorage()
  adopt(ME)
})

describe("pinning", () => {
  it("holds a thread up", () => {
    pin(ALICE)
    expect(isPinned(snapshot(), ALICE)).toBe(true)
  })

  it("puts the newest pin above the older ones", () => {
    pin(ALICE)
    pin(BOB)
    pin(ROOM)
    expect(snapshot()).toEqual([ROOM, BOB, ALICE])
  })

  it("moves a thread back to the top when pinned again", () => {
    // The gesture has to mean something when it lands on a pinned row, and
    // this is the only way to reorder without a second gesture for it.
    pin(ALICE)
    pin(BOB)
    pin(ALICE)
    expect(snapshot()).toEqual([ALICE, BOB])
  })

  it("releases a thread", () => {
    pin(ALICE)
    unpin(ALICE)
    expect(snapshot()).toEqual([])
  })

  it("toggles both ways", () => {
    toggle(ALICE)
    expect(isPinned(snapshot(), ALICE)).toBe(true)
    toggle(ALICE)
    expect(isPinned(snapshot(), ALICE)).toBe(false)
  })

  it("does not churn when releasing something loose", () => {
    pin(ALICE)
    const settled = snapshot()
    unpin(BOB)
    expect(snapshot()).toBe(settled)
  })

  it("stops at a limit rather than growing without end", () => {
    for (let i = 0; i < MAX_PINS + 5; i++) pin(`thread-${i}`)
    expect(snapshot()).toHaveLength(MAX_PINS)
    // The oldest fall off the bottom, not the newest off the top.
    expect(snapshot()[0]).toBe(`thread-${MAX_PINS + 4}`)
  })
})

describe("arranging a list", () => {
  it("puts pinned threads first, in pin order", () => {
    pin(ALICE)
    pin(ROOM)
    expect(arrange(rows(BOB, ALICE, ROOM), snapshot()).map((r) => r.key)).toEqual([
      ROOM,
      ALICE,
      BOB,
    ])
  })

  it("leaves the rest in the order they arrived", () => {
    pin(ROOM)
    expect(arrange(rows(BOB, ALICE, ROOM), snapshot()).map((r) => r.key)).toEqual([
      ROOM,
      BOB,
      ALICE,
    ])
  })

  it("is the list itself when nothing is pinned", () => {
    const list = rows(BOB, ALICE)
    expect(arrange(list, snapshot())).toBe(list)
  })

  it("skips a pin whose thread is not here yet", () => {
    // A cold start has pins before it has messages. Dropping the pin then would
    // quietly unpin things nobody touched.
    pin(ALICE)
    pin(BOB)
    expect(arrange(rows(BOB), snapshot()).map((r) => r.key)).toEqual([BOB])
    expect(snapshot()).toContain(ALICE)
  })
})

describe("persistence", () => {
  it("survives a reload", () => {
    pin(ALICE)
    pin(BOB)
    adopt(null)
    expect(snapshot()).toEqual([])
    adopt(ME)
    expect(snapshot()).toEqual([BOB, ALICE])
  })

  it("does not carry pins between identities", () => {
    pin(ALICE)
    adopt(BOB)
    expect(snapshot()).toEqual([])
  })

  it("ignores anything in storage that is not a key", () => {
    stubStorage({
      [`knock.pins.${ME.replace(/ /g, "")}`]: JSON.stringify([ALICE, 42, "", null, ALICE, BOB]),
    })
    adopt(ME)
    expect(snapshot()).toEqual([ALICE, BOB])
  })

  it("treats malformed storage as nothing pinned", () => {
    stubStorage({ [`knock.pins.${ME.replace(/ /g, "")}`]: "{ not json" })
    expect(() => adopt(ME)).not.toThrow()
    expect(snapshot()).toEqual([])
  })
})
