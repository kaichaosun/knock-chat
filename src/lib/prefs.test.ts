import { beforeEach, describe, expect, it, vi } from "vitest"

import { snapshot, start, subscribe, update } from "./prefs"

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
  start()
})

describe("preferences", () => {
  it("start out where most people want them", () => {
    expect(snapshot().compose).toBe("floating")
  })

  it("change when asked", () => {
    update({ compose: "header" })
    expect(snapshot().compose).toBe("header")
  })

  it("survive a reload", () => {
    update({ compose: "header" })
    start()
    expect(snapshot().compose).toBe("header")
  })

  it("take only what they recognise out of storage", () => {
    // Storage is user-writable, and a build older than this one may have
    // written a preference this one has dropped.
    stubStorage({ "knock.prefs": JSON.stringify({ compose: "sideways", ghosts: true }) })
    start()
    expect(snapshot()).toEqual({ compose: "floating", language: "host", notify: false })
  })

  it("keep a language that is spoken and drop one that is not", () => {
    stubStorage({ "knock.prefs": JSON.stringify({ language: "zh" }) })
    start()
    expect(snapshot().language).toBe("zh")

    stubStorage({ "knock.prefs": JSON.stringify({ language: "kli" }) })
    start()
    expect(snapshot().language).toBe("host")
  })

  it("treat malformed storage as nothing chosen", () => {
    stubStorage({ "knock.prefs": "{ not json" })
    expect(() => start()).not.toThrow()
    expect(snapshot().compose).toBe("floating")
  })

  it("change identity by reference, so a subscriber can compare cheaply", () => {
    const before = snapshot()
    update({ compose: "header" })
    expect(snapshot()).not.toBe(before)
  })

  it("do not churn when set to what they already are", () => {
    update({ compose: "header" })
    const settled = snapshot()
    update({ compose: "header" })
    expect(snapshot()).toBe(settled)
  })

  it("tell subscribers when one changes", () => {
    const heard = vi.fn()
    subscribe(heard)
    update({ compose: "header" })
    expect(heard).toHaveBeenCalled()
  })

  it("keep working when storage refuses to write", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied")
      },
    })
    start()
    expect(() => update({ compose: "header" })).not.toThrow()
    expect(snapshot().compose).toBe("header")
  })
})
