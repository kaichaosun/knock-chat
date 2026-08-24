import { beforeEach, describe, expect, it, vi } from "vitest"

import { all, drop, keep, outstanding, postageStep } from "./receipts"

const ME = "NQ32 QPH1 MCE9 XQ12 T0E3 N9F3 8DNB FUEY EYUN"
const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"

const proof = (peer: string, txHash = "aa") => ({
  peer,
  sealed: "sealed-body",
  body: "let me in",
  txHash,
  nonce: "beef",
})

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
  vi.useRealTimers()
  stubStorage()
})

describe("an outstanding payment", () => {
  it("is found again however the address is written", () => {
    keep(ME, proof(ALICE))
    expect(outstanding(ME, ALICE.replace(/\s+/g, ""))?.txHash).toBe("aa")
    expect(outstanding(ME, ALICE)?.txHash).toBe("aa")
  })

  it("survives a reload, because that is the whole point", () => {
    // The proof is written before the relay is contacted. If it did not
    // outlive the app, the next attempt would pay a second time.
    const store = stubStorage()
    keep(ME, proof(ALICE))
    stubStorage(Object.fromEntries(store))
    expect(outstanding(ME, ALICE)).not.toBeNull()
  })

  it("is one per peer, so paying again replaces rather than accumulates", () => {
    keep(ME, proof(ALICE, "first"))
    keep(ME, proof(ALICE, "second"))
    expect(all(ME)).toHaveLength(1)
    expect(outstanding(ME, ALICE)?.txHash).toBe("second")
  })

  it("says nothing about anybody else", () => {
    keep(ME, proof(ALICE))
    expect(outstanding(ME, BOB)).toBeNull()
  })

  it("does not carry between identities", () => {
    keep(ME, proof(ALICE))
    expect(outstanding(ALICE, ALICE)).toBeNull()
  })

  it("is forgotten once it has opened a door", () => {
    keep(ME, proof(ALICE))
    drop(ME, ALICE)
    expect(outstanding(ME, ALICE)).toBeNull()
  })

  it("expires, so a payment that was wrong to begin with stops blocking", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-24T00:00:00Z"))
    keep(ME, proof(ALICE))

    vi.setSystemTime(new Date("2026-08-24T23:00:00Z"))
    expect(outstanding(ME, ALICE)).not.toBeNull()

    vi.setSystemTime(new Date("2026-08-25T01:00:00Z"))
    expect(outstanding(ME, ALICE)).toBeNull()
  })

  it("ignores anything in storage that is not a receipt", () => {
    // Storage is user-writable, and a half-written proof is worse than none:
    // it would be handed to the relay as if it were money.
    stubStorage({
      [`knock:postage:${ME.replace(/\s+/g, "")}`]: JSON.stringify([
        { peer: ALICE, sealed: "x", txHash: "y" },
        "nonsense",
      ]),
    })
    expect(all(ME)).toEqual([])
  })

  it("rejects a receipt with no plaintext, since the sweep needs one", () => {
    // A knock finished in the background still has to appear in the sender's
    // own history, and the sealed copy is encrypted to somebody else.
    stubStorage({
      [`knock:postage:${ME.replace(/\s+/g, "")}`]: JSON.stringify([
        { peer: ALICE, sealed: "x", txHash: "y", nonce: "z", at: new Date().toISOString() },
      ]),
    })
    expect(all(ME)).toEqual([])
  })

  it("treats malformed storage as nothing owed", () => {
    stubStorage({ [`knock:postage:${ME.replace(/\s+/g, "")}`]: "{ not json" })
    expect(() => all(ME)).not.toThrow()
    expect(all(ME)).toEqual([])
  })
})

describe("deciding what to pay", () => {
  it("never pays while a payment is outstanding", () => {
    // The rule the whole module exists for. Paying twice strands the first
    // payment forever: its commitment binds a nonce nothing else ever had.
    keep(ME, proof(ALICE))
    expect(postageStep(ME, ALICE, 1_000_000)).toMatchObject({ step: "reuse" })
  })

  it("reuses a payment even once the door has become free", () => {
    // The relay ignores postage it is not asking for, so sending the proof
    // costs nothing and clears it. Skipping it would strand the money.
    keep(ME, proof(ALICE))
    expect(postageStep(ME, ALICE, 0)).toMatchObject({ step: "reuse" })
  })

  it("pays when the door asks and nothing is owed", () => {
    expect(postageStep(ME, ALICE, 1_000_000)).toEqual({ step: "pay" })
  })

  it("pays nothing for a free door", () => {
    expect(postageStep(ME, ALICE, 0)).toEqual({ step: "free" })
  })

  it("pays again once the earlier payment has been redeemed", () => {
    keep(ME, proof(ALICE))
    drop(ME, ALICE)
    expect(postageStep(ME, ALICE, 1_000_000)).toEqual({ step: "pay" })
  })

  it("keeps one peer's payment from paying another's way in", () => {
    keep(ME, proof(ALICE))
    expect(postageStep(ME, BOB, 1_000_000)).toEqual({ step: "pay" })
  })
})
