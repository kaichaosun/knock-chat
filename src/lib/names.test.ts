import { beforeEach, describe, expect, it, vi } from "vitest"

import { adopt, forget, labelIn, nameIn, remember, rememberOne, sanitize, snapshot } from "./names"
import { MAX_NAME_LEN } from "./relay"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"
const ME = "NQ34 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HY2"

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

describe("sanitize", () => {
  it("keeps an ordinary name as it is", () => {
    expect(sanitize("kai")).toBe("kai")
    expect(sanitize("Ana María")).toBe("Ana María")
  })

  it("removes characters that take up no width", () => {
    // A zero-width space is how one name is made to survive a comparison
    // against another that a reader would fail.
    expect(sanitize("ka​i")).toBe("kai")
    expect(sanitize("kai﻿")).toBe("kai")
  })

  it("removes characters that reorder the text around them", () => {
    // A right-to-left override prints what follows it backwards, which is how a
    // name is made to read as the address printed beside it.
    expect(sanitize("kai‮")).toBe("kai")
  })

  it("collapses whitespace and trims", () => {
    expect(sanitize("  kai   chao ")).toBe("kai chao")
    expect(sanitize("kai\nchao")).toBe("kai chao")
  })

  it("is null when nothing visible is left", () => {
    expect(sanitize("")).toBeNull()
    expect(sanitize("   ")).toBeNull()
    expect(sanitize("​‮")).toBeNull()
  })

  it("cuts an overlong name to the agreed length", () => {
    // The relay refuses one instead, but a name can arrive from a relay this
    // build did not agree that with.
    expect(sanitize("n".repeat(MAX_NAME_LEN + 10))).toHaveLength(MAX_NAME_LEN)
  })

  it("counts characters, not code units", () => {
    // `length` would call this twice as long as it looks and cut it in half,
    // splitting a surrogate pair into a pair of replacement characters.
    const emoji = "🛰".repeat(MAX_NAME_LEN)
    expect([...(sanitize(emoji) ?? "")]).toHaveLength(MAX_NAME_LEN)
  })
})

describe("the directory", () => {
  it("finds a name however the address is spaced", () => {
    remember({ [ALICE]: "alice" })
    expect(nameIn(snapshot(), ALICE.replace(/ /g, ""))).toBe("alice")
    expect(nameIn(snapshot(), ALICE.toLowerCase())).toBe("alice")
  })

  it("keeps names a later list did not mention", () => {
    // A knock list speaks only for the people knocking. Treating it as the whole
    // truth would blank out every contact each time one arrived.
    remember({ [ALICE]: "alice", [BOB]: "bob" })
    remember({ [BOB]: "bobby" })
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
    expect(nameIn(snapshot(), BOB)).toBe("bobby")
  })

  it("lets a single answer report that a name is gone", () => {
    remember({ [ALICE]: "alice" })
    rememberOne(ALICE, null)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
  })

  it("sanitizes on the way in, so no screen has to", () => {
    remember({ [ALICE]: "  ali​ce  " })
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
  })

  it("falls back to the address when there is no name", () => {
    expect(labelIn(snapshot(), ALICE)).toBe("NQ97 V68G … JLKY")
    remember({ [ALICE]: "alice" })
    expect(labelIn(snapshot(), ALICE)).toBe("alice")
  })

  it("forgets an address outright", () => {
    remember({ [ALICE]: "alice" })
    forget(ALICE)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
  })

  it("changes identity by reference, so a subscriber can compare cheaply", () => {
    const before = snapshot()
    remember({ [ALICE]: "alice" })
    expect(snapshot()).not.toBe(before)
  })

  it("does not churn when a name arrives unchanged", () => {
    remember({ [ALICE]: "alice" })
    const settled = snapshot()
    remember({ [ALICE]: "alice" })
    expect(snapshot()).toBe(settled)
  })
})

describe("persistence", () => {
  it("survives a reload", () => {
    remember({ [ALICE]: "alice" })
    adopt(null)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
    adopt(ME)
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
  })

  it("does not carry names between identities", () => {
    // Switching to a development identity is switching to someone else's view.
    remember({ [ALICE]: "alice" })
    adopt(BOB)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
  })

  it("ignores anything in storage that is not a name", () => {
    // Storage is user-writable, and was written by an older build at least once.
    stubStorage({
      [`knock.names.${ME.replace(/ /g, "")}`]: JSON.stringify({
        [ALICE.replace(/ /g, "")]: { nested: "object" },
        [BOB.replace(/ /g, "")]: "bob",
      }),
    })
    adopt(ME)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
    expect(nameIn(snapshot(), BOB)).toBe("bob")
  })

  it("treats malformed storage as an empty directory", () => {
    stubStorage({ [`knock.names.${ME.replace(/ /g, "")}`]: "{ not json" })
    expect(() => adopt(ME)).not.toThrow()
    expect(snapshot()).toEqual({})
  })
})
