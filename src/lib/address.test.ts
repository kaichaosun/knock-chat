import { describe, expect, it } from "vitest"

import { addressFrom } from "./address"

/** Checksummed vectors, the same ones the relay's tests use. */
const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"

describe("addressFrom", () => {
  it("reads an address on its own, in the form it is shown in", () => {
    expect(addressFrom(ALICE)).toBe(ALICE)
    expect(addressFrom(`  ${ALICE}  `)).toBe(ALICE)
  })

  it("reads one that lost its spacing or its case on the way", () => {
    expect(addressFrom(ALICE.replace(/\s/g, ""))).toBe(ALICE)
    expect(addressFrom(ALICE.toLowerCase())).toBe(ALICE)
  })

  it("finds one inside what carried it", () => {
    for (const text of [
      `http://192.168.1.101:5175/#${ALICE.replace(/\s/g, "")}`,
      `Here he is: ${ALICE}.`,
      `<${ALICE}>`,
      // A chat app wrapped the line mid-address; nothing but whitespace was
      // added, so nothing was lost.
      `${ALICE.slice(0, 20)}\n${ALICE.slice(20)}`,
    ]) {
      expect(addressFrom(text), text).toBe(ALICE)
    }
  })

  it("answers with the first of several, rather than guessing between them", () => {
    expect(addressFrom(`${ALICE} and ${BOB}`)).toBe(ALICE)
  })

  it("is null when there is no address in the text", () => {
    for (const text of ["", "   ", "hello", "9d23068a-287d-407d-ac4c-53f20451c5e2"]) {
      expect(addressFrom(text), text).toBeNull()
    }
  })

  it("turns away something address-shaped whose checksum does not hold", () => {
    // The right length and alphabet, one character mistyped — a slip rather
    // than a different address, and not a door to knock on.
    const typo = ALICE.slice(0, -1) + "X"
    expect(addressFrom(typo)).toBeNull()
  })

  it("answers in one spelling when the checksum admits two", () => {
    // Mod-97 leaves `NQ00…` valid for the body `NQ97…` names. Both are the
    // same 20 bytes, so both have to come back as the same string — the app
    // keys names and threads by it.
    const other = `NQ00${ALICE.replace(/\s/g, "").slice(4)}`
    expect(addressFrom(other)).toBe(ALICE)
  })
})
