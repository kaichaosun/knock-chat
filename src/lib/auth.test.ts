import { beforeEach, describe, expect, it, vi } from "vitest"

import { haveStoredSession } from "./auth"

/** A localStorage that can be enumerated, which is what the scan needs. */
function stubStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
}

const session = (days: number) =>
  JSON.stringify({
    token: "t",
    address: "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY",
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
  })

beforeEach(() => stubStorage())

describe("haveStoredSession", () => {
  it("is false with nothing stored", () => {
    expect(haveStoredSession()).toBe(false)
  })

  it("finds one under the production scope", () => {
    stubStorage({ "knock:session:wallet": session(30) })
    expect(haveStoredSession()).toBe(true)
  })

  it("finds one under a dev scope, whose name it cannot know in advance", () => {
    // The reason this scans rather than looks up: which scope applies is
    // decided by the wallet, and the wallet is what we are waiting for.
    stubStorage({ "knock:session:dev:alice": session(30) })
    expect(haveStoredSession()).toBe(true)
  })

  it("ignores a session too near expiry to be reused", () => {
    // `loadSession` would refuse this one, so treating it as signed in would
    // show a splash and then a sign-in screen anyway.
    stubStorage({ "knock:session:wallet": session(0.5) })
    expect(haveStoredSession()).toBe(false)
  })

  it("ignores keys belonging to something else", () => {
    stubStorage({
      "knock:devicekey:wallet": "ab".repeat(32),
      "knock:names:NQ97": "{}",
    })
    expect(haveStoredSession()).toBe(false)
  })

  it("says signed out when storage cannot be read at all", () => {
    vi.stubGlobal("localStorage", {
      get length(): number {
        throw new Error("blocked")
      },
    })
    expect(haveStoredSession()).toBe(false)
  })
})
