import { describe, expect, it } from "vitest"

import { mentionOf, sameAddress, segments } from "./mentions"

/** Checksummed vectors, the same ones the relay's tests use. */
const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"

const alice = mentionOf(ALICE)
const bob = mentionOf(BOB)

describe("mentionOf", () => {
  it("writes the address, spaced or not, as one run behind an @", () => {
    expect(alice).toBe("@NQ97V68GX92J86C27P1EALS66CGG0V5EJLKY")
    expect(mentionOf(ALICE.replace(/\s/g, ""))).toBe(alice)
    expect(mentionOf(ALICE.toLowerCase())).toBe(alice)
  })
})

describe("segments", () => {
  it("leaves a message with nobody in it alone", () => {
    expect(segments("no one in particular")).toEqual([
      { kind: "text", text: "no one in particular" },
    ])
  })

  it("says nothing about an empty message", () => {
    expect(segments("")).toEqual([])
  })

  it("finds who a message names, and keeps the words around them", () => {
    expect(segments(`hey ${alice} look`)).toEqual([
      { kind: "text", text: "hey " },
      { kind: "mention", address: ALICE },
      { kind: "text", text: " look" },
    ])
  })

  it("finds one at either end", () => {
    expect(segments(`${alice} hello`)).toEqual([
      { kind: "mention", address: ALICE },
      { kind: "text", text: " hello" },
    ])
    expect(segments(`ask ${alice}`)).toEqual([
      { kind: "text", text: "ask " },
      { kind: "mention", address: ALICE },
    ])
  })

  it("finds several, and tells two people apart however they are named", () => {
    expect(segments(`${alice} ${bob}`)).toEqual([
      { kind: "mention", address: ALICE },
      { kind: "text", text: " " },
      { kind: "mention", address: BOB },
    ])
  })

  it("reads one followed by punctuation, which is where a sentence ends", () => {
    for (const mark of [",", ".", "?", ")", ":", "\n"]) {
      expect(segments(`${alice}${mark}`), mark).toEqual([
        { kind: "mention", address: ALICE },
        { kind: "text", text: mark },
      ])
    }
  })

  it("gives back the address it was handed, in the spelling the app writes", () => {
    // Mod-97 leaves `NQ00…` valid for the body `NQ97…` names. One address must
    // not arrive as two people.
    const other = `@NQ00${ALICE.replace(/\s/g, "").slice(4)}`
    expect(segments(other)).toEqual([{ kind: "mention", address: ALICE }])
  })

  it("keeps a run that only looks like a mention as the text it is", () => {
    for (const text of [
      // The alphabet is right and the checksum is not.
      "@NQ11V68GX92J86C27P1EALS66CGG0V5EJLKY",
      // Too short to be an address.
      "@NQ97V68GX92J",
      // An address with no @ in front of it is prose, not a mention.
      ALICE,
      "@nobody",
      "@",
    ]) {
      expect(segments(text), text).toEqual([{ kind: "text", text }])
    }
  })

  it("will not read a longer run of base32 as somebody with a tail", () => {
    const text = `${alice}JLKY`
    expect(segments(text)).toEqual([{ kind: "text", text }])
  })

  it("adds up to what was said, whatever it found", () => {
    for (const text of [
      `hey ${alice} and ${bob}!`,
      `${alice}`,
      "@NQ11V68GX92J86C27P1EALS66CGG0V5EJLKY is nobody",
      "plain words",
    ]) {
      const rebuilt = segments(text)
        .map((segment) => (segment.kind === "text" ? segment.text : mentionOf(segment.address)))
        .join("")
      expect(rebuilt, text).toBe(text)
    }
  })
})

describe("sameAddress", () => {
  it("sees through spacing and case", () => {
    expect(sameAddress(ALICE, ALICE.replace(/\s/g, ""))).toBe(true)
    expect(sameAddress(ALICE, ALICE.toLowerCase())).toBe(true)
  })

  it("still tells two people apart", () => {
    expect(sameAddress(ALICE, BOB)).toBe(false)
  })
})
