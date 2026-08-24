import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { fundGift } from "./gift-funding"
import { RelayError } from "./relay"

vi.mock("./relay", async () => {
  const actual = await vi.importActual<typeof import("./relay")>("./relay")
  return { ...actual, createGift: vi.fn() }
})

const { createGift } = await import("./relay")
const called = vi.mocked(createGift)

const input = {
  total_luna: 100_000,
  shares: 2,
  split: "random" as const,
  note: "hi",
  postage: { tx_hash: "14c1db8d12937f18abcdef", nonce: "00" },
}

const gift = { id: "g1" } as Awaited<ReturnType<typeof createGift>>

describe("fundGift", () => {
  beforeEach(() => {
    called.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Runs the call and the backoff waits together.
   *
   * The rejection is observed straight away with a no-op catch — the assertion
   * that reads it comes after the timers have run, and a promise left
   * unobserved in between is reported as an unhandled rejection.
   */
  const run = (fn: () => Promise<unknown>) => {
    const running = fn()
    running.catch(() => {})
    return vi.runAllTimersAsync().then(() => running)
  }

  it("keeps asking while the payment is still settling", async () => {
    called
      .mockRejectedValueOnce(new RelayError("no such payment", 402))
      .mockRejectedValueOnce(new RelayError("no such payment", 402))
      .mockResolvedValueOnce(gift)

    await expect(run(() => fundGift("group", input))).resolves.toBe(gift)
    expect(called).toHaveBeenCalledTimes(3)
  })

  it("does not retry a refusal that asking again cannot fix", async () => {
    // Not a member. The money is gone either way, but hammering the relay
    // will not bring the gift into being.
    called.mockRejectedValue(new RelayError("you are not in this group", 403))

    await expect(run(() => fundGift("group", input))).rejects.toThrow("not in this group")
    expect(called).toHaveBeenCalledTimes(1)
  })

  it("names the transaction when it gives up, since the money is already gone", async () => {
    called.mockRejectedValue(new RelayError("no such payment", 402))

    await expect(run(() => fundGift("group", input))).rejects.toThrow(/14c1db8d1293/)
    expect(called).toHaveBeenCalledTimes(5)
  })
})
