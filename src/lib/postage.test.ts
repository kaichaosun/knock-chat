import { describe, expect, it } from "vitest"

import { commitment, formatNim, newNonce } from "./postage"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ05 563U 530Y XDRT L7GQ M6HE YRNU 20FE 4PNR"

describe("commitment", () => {
  it("is stable and marked so the relay can recognise it", () => {
    const nonce = new Uint8Array(32).fill(7)
    expect(commitment(ALICE, nonce)).toBe(commitment(ALICE, nonce))
    expect(commitment(ALICE, nonce)).toMatch(/^knock:[0-9a-f]{32}$/)
  })

  /** Naming the sender is what stops an observer claiming someone's payment. */
  it("differs by sender and by nonce", () => {
    const nonce = new Uint8Array(32).fill(7)
    const other = new Uint8Array(32).fill(8)
    expect(commitment(ALICE, nonce)).not.toBe(commitment(BOB, nonce))
    expect(commitment(ALICE, nonce)).not.toBe(commitment(ALICE, other))
  })

  it("ignores address formatting", () => {
    const nonce = newNonce()
    expect(commitment(ALICE, nonce)).toBe(commitment(ALICE.replace(/\s+/g, ""), nonce))
  })

  /** Fits far inside the 2112-byte data limit, and reads cleanly in an explorer. */
  it("is 38 characters", () => {
    expect(commitment(ALICE, newNonce())).toHaveLength(38)
  })
})

describe("formatNim", () => {
  it("shows whole numbers plainly and fractions without trailing zeros", () => {
    expect(formatNim(1_000_000)).toBe("10")
    expect(formatNim(100_000)).toBe("1")
    expect(formatNim(0)).toBe("0")
    expect(formatNim(50_000)).toBe("0.5")
  })
})
