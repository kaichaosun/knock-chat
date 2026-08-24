import { beforeEach, describe, expect, it, vi } from "vitest"

import { all, drop, keep, outstandingFor } from "./gift-receipts"

const ME = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const ROOM = "9d23068a-287d-407d-ac4c-53f20451c5e2"

function stubStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed))
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  })
  return store
}

const funding = (txHash: string, group = ROOM) => ({
  group,
  total_luna: 100_000,
  shares: 2,
  split: "random" as const,
  note: "hi",
  txHash,
  nonce: "ab".repeat(16),
})

beforeEach(() => stubStorage())

describe("gift receipts", () => {
  it("keeps funding until it is dropped", () => {
    keep(ME, funding("tx-1"))
    expect(all(ME).map((r) => r.txHash)).toEqual(["tx-1"])

    drop(ME, "tx-1")
    expect(all(ME)).toEqual([])
  })

  it("keeps two payments in the same room apart", () => {
    // Each payment is separately redeemable — collapsing them by room would
    // strand whichever one lost.
    keep(ME, funding("tx-1"))
    keep(ME, funding("tx-2"))
    expect(all(ME).map((r) => r.txHash)).toEqual(["tx-1", "tx-2"])
  })

  it("replaces a receipt written twice for the same transaction", () => {
    keep(ME, funding("tx-1"))
    keep(ME, funding("tx-1"))
    expect(all(ME)).toHaveLength(1)
  })

  it("does not confuse one owner's funding with another's", () => {
    keep(ME, funding("tx-1"))
    expect(all("NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT")).toEqual([])
  })

  it("finds what is owed for a room", () => {
    keep(ME, funding("tx-1", "other-room"))
    keep(ME, funding("tx-2", ROOM))
    expect(outstandingFor(ME, ROOM)?.txHash).toBe("tx-2")
    expect(outstandingFor(ME, "nothing-here")).toBeNull()
  })

  it("forgets funding too old to be worth retrying", () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
    stubStorage({
      [`knock:giftpostage:${ME.replace(/\s/g, "")}`]: JSON.stringify([
        { ...funding("tx-old"), at: old },
      ]),
    })
    expect(all(ME)).toEqual([])
  })

  it("survives storage holding something that is not a receipt", () => {
    stubStorage({ [`knock:giftpostage:${ME.replace(/\s/g, "")}`]: "not json" })
    expect(all(ME)).toEqual([])
  })
})
