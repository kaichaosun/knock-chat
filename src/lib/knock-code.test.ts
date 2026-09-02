import { describe, expect, it } from "vitest"

import { ownCode, readCode } from "./knock-code"

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

describe("ownCode", () => {
  const HERE = "https://knock.example"

  it("reads a room link that leads back here", () => {
    expect(ownCode(`${HERE}/?group=${ID}`, HERE)).toEqual({ kind: "group", id: ID })
  })

  it("reads a knock link that leads back here", () => {
    expect(ownCode(`${HERE}/?knock=${ALICE.replace(/\s/g, "")}`, HERE)).toEqual({
      kind: "peer",
      address: ALICE,
    })
  })

  it("lets a link that goes somewhere else go there", () => {
    // Somebody else's uuid is somebody else's uuid, whatever it looks like.
    expect(ownCode(`https://elsewhere.example/?group=${ID}`, HERE)).toBeNull()
    // The same host is not the same origin.
    expect(ownCode(`http://knock.example/?group=${ID}`, HERE)).toBeNull()
    expect(ownCode(`${HERE}:8443/?group=${ID}`, HERE)).toBeNull()
  })

  it("is null for one of ours that says nothing", () => {
    expect(ownCode(`${HERE}/`, HERE)).toBeNull()
    expect(ownCode(`${HERE}/?probe`, HERE)).toBeNull()
  })

  it("is null for something that is not a link", () => {
    expect(ownCode("not a url", HERE)).toBeNull()
  })
})
