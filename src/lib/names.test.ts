import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  adopt,
  chosenNameIn,
  directoryChangedAt,
  faceIn,
  forget,
  givenNameIn,
  isFingerprint,
  labelIn,
  nameIn,
  noteDirectoryChange,
  remember,
  rememberAll,
  rememberFace,
  rememberOne,
  rename,
  sanitize,
  snapshot,
  subscribe,
} from "./names"
import { compact } from "./address"
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

describe("an answer about addresses that were asked about", () => {
  it("takes a new name, which is the rename landing", () => {
    remember({ [ALICE]: "alice" })
    rememberAll([ALICE], { [ALICE]: "alicia" })
    expect(nameIn(snapshot(), ALICE)).toBe("alicia")
  })

  it("drops a name the answer left out, unlike a list", () => {
    // The whole difference. A list saying nothing about an address means it was
    // not asked; this was asked, so silence is the answer.
    remember({ [ALICE]: "alice", [BOB]: "bob" })
    rememberAll([ALICE, BOB], { [BOB]: "bob" })
    expect(nameIn(snapshot(), ALICE)).toBeNull()
    expect(nameIn(snapshot(), BOB)).toBe("bob")
  })

  it("says nothing about anyone it was not asked about", () => {
    remember({ [ALICE]: "alice", [BOB]: "bob" })
    rememberAll([BOB], { [BOB]: "bobby" })
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
  })

  it("matches however either side spaced the address", () => {
    rememberAll([compact(ALICE)], { [ALICE]: "alice" })
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
  })

  it("leaves the name you chose alone, name or no name", () => {
    rename(ALICE, "the neighbour")
    rememberAll([ALICE], {})
    expect(nameIn(snapshot(), ALICE)).toBe("the neighbour")
  })

  it("takes a picture off the address that stopped wearing one", () => {
    const face = "a".repeat(64)
    rememberAll([ALICE], { [ALICE]: "alice" }, { [ALICE]: face })
    expect(faceIn(snapshot(), ALICE)).toBe(face)
    rememberAll([ALICE], { [ALICE]: "alice" })
    expect(faceIn(snapshot(), ALICE)).toBeNull()
  })

  it("does not churn when nothing about anybody changed", () => {
    rememberAll([ALICE], { [ALICE]: "alice" })
    const settled = snapshot()
    rememberAll([ALICE], { [ALICE]: "alice" })
    expect(snapshot()).toBe(settled)
  })
})

describe("when the relay says the directory moved", () => {
  // Module state, deliberately: there is one relay and one answer from it. So
  // it has to be put back, or each test here would inherit the last one's.
  beforeEach(() => noteDirectoryChange(null))

  it("is nothing until the relay says, which is not the same as up to date", () => {
    expect(directoryChangedAt()).toBeNull()
  })

  it("keeps what the relay said, to be compared and not read", () => {
    noteDirectoryChange("2026-09-09T10:31:04Z")
    expect(directoryChangedAt()).toBe("2026-09-09T10:31:04Z")
  })

  it("wakes whoever is watching when it moves", () => {
    const woken = vi.fn()
    const stop = subscribe(woken)
    noteDirectoryChange("2026-09-09T10:31:04Z")
    expect(woken).toHaveBeenCalledTimes(1)
    stop()
  })

  it("says nothing when it has not moved, which is nearly every poll", () => {
    // Arrives every three seconds with the same value. Announcing each time
    // would wake every screen in the app to tell it nothing.
    noteDirectoryChange("2026-09-09T10:31:04Z")
    const woken = vi.fn()
    const stop = subscribe(woken)
    noteDirectoryChange("2026-09-09T10:31:04Z")
    expect(woken).not.toHaveBeenCalled()
    stop()
  })

  it("treats a relay that does not say as no reason to look", () => {
    // An older relay sends no field at all. Undefined and null are the same
    // silence, and neither should read as a change.
    noteDirectoryChange(undefined)
    const woken = vi.fn()
    const stop = subscribe(woken)
    noteDirectoryChange(undefined)
    expect(woken).not.toHaveBeenCalled()
    expect(directoryChangedAt()).toBeNull()
    stop()
  })
})

describe("a name you chose", () => {
  it("is what every screen shows", () => {
    remember({ [ALICE]: "alice" })
    rename(ALICE, "the landlord")
    expect(nameIn(snapshot(), ALICE)).toBe("the landlord")
    expect(labelIn(snapshot(), ALICE)).toBe("the landlord")
  })

  it("names someone who never named themselves", () => {
    rename(ALICE, "the landlord")
    expect(nameIn(snapshot(), ALICE)).toBe("the landlord")
  })

  it("keeps theirs visible underneath, so it can be shown as what you overrode", () => {
    remember({ [ALICE]: "alice" })
    rename(ALICE, "the landlord")
    expect(givenNameIn(snapshot(), ALICE)).toBe("alice")
    expect(chosenNameIn(snapshot(), ALICE)).toBe("the landlord")
  })

  it("survives the relay changing theirs", () => {
    // The whole point of writing one down: their name can move under you.
    rename(ALICE, "the landlord")
    remember({ [ALICE]: "something else entirely" })
    expect(nameIn(snapshot(), ALICE)).toBe("the landlord")
  })

  it("is not reported back as theirs", () => {
    // Nothing sends this anywhere, and nothing should mistake it for a claim
    // the address made about itself.
    rename(ALICE, "the landlord")
    expect(givenNameIn(snapshot(), ALICE)).toBeNull()
  })

  it("clears back to theirs", () => {
    remember({ [ALICE]: "alice" })
    rename(ALICE, "the landlord")
    rename(ALICE, null)
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
  })

  it("is sanitized like any other name", () => {
    rename(ALICE, "  the​ landlord  ")
    expect(chosenNameIn(snapshot(), ALICE)).toBe("the landlord")
  })

  it("goes when the contact goes", () => {
    remember({ [ALICE]: "alice" })
    rename(ALICE, "the landlord")
    forget(ALICE)
    expect(nameIn(snapshot(), ALICE)).toBeNull()
  })

  it("does not churn when set to what it already is", () => {
    rename(ALICE, "the landlord")
    const settled = snapshot()
    rename(ALICE, "the landlord")
    expect(snapshot()).toBe(settled)
  })

  it("survives a reload", () => {
    rename(ALICE, "the landlord")
    adopt(null)
    adopt(ME)
    expect(nameIn(snapshot(), ALICE)).toBe("the landlord")
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
    expect(snapshot()).toEqual({ given: {}, chosen: {}, faces: {} })
  })
})

/** A fingerprint of the shape the relay actually emits. */
const FACE = "a".repeat(64)
const OTHER_FACE = "b3".repeat(32)

describe("faces", () => {
  it("learns a picture alongside the name it arrived with", () => {
    remember({ [ALICE]: "alice" }, { [ALICE]: FACE })
    expect(nameIn(snapshot(), ALICE)).toBe("alice")
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
  })

  it("has no picture for somebody who has not chosen one", () => {
    // The ordinary state, not a failure: their address still draws its own.
    remember({ [ALICE]: "alice" })
    expect(faceIn(snapshot(), ALICE)).toBeNull()
  })

  it("takes a relay that predates pictures as saying nothing about them", () => {
    remember({ [ALICE]: "alice" }, { [ALICE]: FACE })
    // No `faces` at all, which is what an older relay sends.
    remember({ [ALICE]: "alice" })
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
  })

  it("says nothing about addresses a picture map does not mention", () => {
    // Same rule as names: a knock list cannot wipe what the contact list taught.
    remember({}, { [ALICE]: FACE })
    remember({}, { [BOB]: OTHER_FACE })
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
    expect(faceIn(snapshot(), BOB)).toBe(OTHER_FACE)
  })

  it("replaces a picture when its owner changes it", () => {
    remember({}, { [ALICE]: FACE })
    remember({}, { [ALICE]: OTHER_FACE })
    expect(faceIn(snapshot(), ALICE)).toBe(OTHER_FACE)
  })

  it("refuses anything that is not a fingerprint", () => {
    // This string is pasted into a URL path, so its shape is checked rather
    // than trusted — `VITE_RELAY_URL` can point anywhere.
    for (const hostile of [
      "../../etc/passwd",
      "a".repeat(63),
      "a".repeat(65),
      "A".repeat(64), // one spelling only, so one picture is one cache entry
      `${"a".repeat(60)}/../`,
      "",
    ]) {
      expect(isFingerprint(hostile)).toBe(false)
      remember({}, { [ALICE]: hostile })
      expect(faceIn(snapshot(), ALICE)).toBeNull()
    }
  })

  it("records one address's picture, including that it has none", () => {
    rememberFace(ALICE, FACE)
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
    // Where the relay answered about one address, it can be believed about
    // the absence too — this is how taking your own picture off lands.
    rememberFace(ALICE, null)
    expect(faceIn(snapshot(), ALICE)).toBeNull()
  })

  it("keeps a picture across a cold start", () => {
    remember({ [ALICE]: "alice" }, { [ALICE]: FACE })
    adopt(ME)
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
  })

  it("does not carry pictures between identities", () => {
    remember({}, { [ALICE]: FACE })
    adopt(BOB)
    expect(faceIn(snapshot(), ALICE)).toBeNull()
  })

  it("ignores anything in storage that is not a fingerprint", () => {
    stubStorage({
      [`knock.faces.${ME.replace(/ /g, "")}`]: JSON.stringify({
        [ALICE.replace(/ /g, "")]: "not-a-fingerprint",
        [BOB.replace(/ /g, "")]: FACE,
      }),
    })
    adopt(ME)
    expect(faceIn(snapshot(), ALICE)).toBeNull()
    expect(faceIn(snapshot(), BOB)).toBe(FACE)
  })

  it("takes the picture with it when an address is forgotten", () => {
    // Removing a contact undoes the reason to have any of it.
    remember({ [ALICE]: "alice" }, { [ALICE]: FACE })
    rename(ALICE, "mum")
    forget(ALICE)
    expect(faceIn(snapshot(), ALICE)).toBeNull()
    expect(nameIn(snapshot(), ALICE)).toBeNull()
    expect(chosenNameIn(snapshot(), ALICE)).toBeNull()
  })

  it("keeps a picture and a name from disturbing each other", () => {
    remember({ [ALICE]: "alice" }, { [ALICE]: FACE })
    // A rename that says nothing about pictures leaves the picture alone...
    remember({ [ALICE]: "alice again" })
    expect(faceIn(snapshot(), ALICE)).toBe(FACE)
    // ...and a new picture leaves the name alone.
    remember({}, { [ALICE]: OTHER_FACE })
    expect(nameIn(snapshot(), ALICE)).toBe("alice again")
    expect(givenNameIn(snapshot(), ALICE)).toBe("alice again")
  })
})
