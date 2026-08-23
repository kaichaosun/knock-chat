import { describe, expect, it } from "vitest"

import { parseNim, unwrapTransaction } from "./payments"

describe("parseNim", () => {
  it("converts whole and fractional NIM to luna", () => {
    expect(parseNim("1")).toBe(100_000)
    expect(parseNim("10")).toBe(1_000_000)
    expect(parseNim(" 2.5 ")).toBe(250_000)
    // One luna, the smallest amount that exists.
    expect(parseNim("0.00001")).toBe(1)
  })

  it("survives binary floating point", () => {
    // 0.1 * 1e5 is 10000.000000000002, which must not be read as an amount
    // finer than a luna and refused.
    expect(parseNim("0.1")).toBe(10_000)
    expect(parseNim("0.07")).toBe(7_000)
  })

  it("refuses an amount finer than a luna rather than rounding it", () => {
    // Silently paying someone a different number from the one they typed is
    // worse than making them retype it.
    expect(parseNim("0.000001")).toBeNull()
    expect(parseNim("1.234567")).toBeNull()
  })

  it("refuses anything that is not a positive number", () => {
    for (const input of ["", "   ", "0", "-5", "abc", "1.2.3", "NaN", "Infinity"]) {
      expect(parseNim(input), input).toBeNull()
    }
  })

  it("refuses an amount too large to count exactly", () => {
    expect(parseNim("1e20")).toBeNull()
  })
})

describe("unwrapTransaction", () => {
  it("returns the reference the wallet gave back", () => {
    expect(unwrapTransaction("abc123")).toBe("abc123")
  })

  it("throws on a refusal instead of recording it as a payment", () => {
    // The provider resolves rather than rejects when the wallet says no, so
    // without this a cancelled payment would post a card claiming it happened.
    expect(() => unwrapTransaction({ error: { type: "x", message: "User cancelled" } })).toThrow(
      "User cancelled",
    )
  })

  it("still throws when the refusal carries no message", () => {
    expect(() => unwrapTransaction({ error: {} })).toThrow()
  })
})
