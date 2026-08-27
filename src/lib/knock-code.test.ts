import { describe, expect, it } from "vitest"

import { readCode } from "./knock-code"

const ID = "9d23068a-287d-407d-ac4c-53f20451c5e2"
const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"

describe("readCode", () => {
  it("reads a room, however the id arrived", () => {
    expect(readCode(ID)).toEqual({ kind: "group", id: ID })
    expect(readCode(`http://192.168.1.101:5175/?group=${ID}`)).toEqual({
      kind: "group",
      id: ID,
    })
  })

  it("reads a peer, however the address arrived", () => {
    expect(readCode(ALICE)).toEqual({ kind: "peer", address: ALICE })
    expect(readCode(ALICE.replace(/\s/g, "").toLowerCase())).toEqual({
      kind: "peer",
      address: ALICE,
    })
    expect(readCode(`http://192.168.1.101:5175/?knock=${ALICE.replace(/\s/g, "")}`)).toEqual({
      kind: "peer",
      address: ALICE,
    })
  })

  it("is null when the text leads nowhere", () => {
    for (const text of ["", "   ", "hello", "https://example.com/"]) {
      expect(readCode(text), text).toBeNull()
    }
  })

  it("does not confuse one kind for the other", () => {
    expect(readCode(ID)?.kind).toBe("group")
    expect(readCode(ALICE)?.kind).toBe("peer")
  })
})
