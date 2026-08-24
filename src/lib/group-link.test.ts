import { describe, expect, it } from "vitest"

import { groupIdFrom } from "./group-link"

const ID = "9d23068a-287d-407d-ac4c-53f20451c5e2"

describe("groupIdFrom", () => {
  it("reads a link the app produced", () => {
    expect(groupIdFrom(`http://192.168.1.101:5175/?group=${ID}`)).toBe(ID)
  })

  it("reads a bare id, which is what gets read out loud", () => {
    expect(groupIdFrom(ID)).toBe(ID)
    expect(groupIdFrom(`  ${ID}  `)).toBe(ID)
  })

  it("survives what happens to a link on its way through other apps", () => {
    // Trailing punctuation, a fragment, extra query, a wrapping redirect, and
    // the host rearranging the path — the id outlives all of it.
    for (const text of [
      `Join us: http://192.168.1.101:5175/?group=${ID}.`,
      `http://192.168.1.101:5175/?group=${ID}#top`,
      `http://192.168.1.101:5175/?as=bob&group=${ID}`,
      `https://nimpay.app/miniapps/open/192.168.1.101%3A5175%2F%3Fgroup%3D${ID}`,
      `<http://192.168.1.101:5175/?group=${ID}>`,
    ]) {
      expect(groupIdFrom(text), text).toBe(ID)
    }
  })

  it("is case-insensitive, and answers in one case", () => {
    expect(groupIdFrom(ID.toUpperCase())).toBe(ID)
  })

  it("is null when there is no room in the text", () => {
    for (const text of ["", "   ", "hello", "http://192.168.1.101:5175/", "not-a-uuid-at-all"]) {
      expect(groupIdFrom(text), text).toBeNull()
    }
  })

  it("does not mistake an address for an id", () => {
    expect(groupIdFrom("NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY")).toBeNull()
  })
})
