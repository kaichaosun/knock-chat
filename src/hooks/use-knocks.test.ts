import { describe, expect, it, vi } from "vitest"

import { startPostage } from "./use-knocks"
import type { Payment } from "@/lib/wallet"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ05 563U 530Y XDRT L7GQ M6HE YRNU 20FE 4PNR"

/**
 * The invariant that costs money to get wrong.
 *
 * Postage is started before the key lookup it depends on has finished — the
 * Hub's window has to open while the tap is still in hand — so what keeps a
 * message that cannot be encrypted from being paid for is that the payment's
 * details are a promise, and that promise waits on the lookup.
 */
describe("startPostage", () => {
  it("hands the wallet nothing to spend until what it waits on succeeds", async () => {
    let arrive!: () => void
    const ready = new Promise<void>((resolve) => {
      arrive = resolve
    })

    let asked: Payment | null = null
    const pay = async (payment: Payment | Promise<Payment>) => {
      asked = await payment
      return "the-hash"
    }

    const postage = startPostage(pay, ready, ALICE, BOB, 1000)

    // Several turns of the microtask queue, and still nothing to pay.
    await Promise.resolve()
    await Promise.resolve()
    expect(asked).toBeNull()

    arrive()
    const settled = await postage

    expect(asked).toEqual({
      recipient: BOB,
      luna: 1000,
      data: expect.stringMatching(/^knock:[0-9a-f]{32}$/) as unknown as string,
    })
    expect(settled.txHash).toBe("the-hash")
    // The nonce that redeems it, and the only copy of it anywhere.
    expect(settled.nonce).toMatch(/^[0-9a-f]{64}$/)
  })

  it("spends nothing when what it waits on fails", async () => {
    const spent: Payment[] = []
    const pay = vi.fn(async (payment: Payment | Promise<Payment>) => {
      const settled = await payment
      spent.push(settled)
      return "the-hash"
    })

    const postage = startPostage(pay, Promise.reject(new Error("no key")), ALICE, BOB, 1000)

    await expect(postage).rejects.toThrow("no key")
    // The wallet was asked, because it had to be asked early. It was never
    // given anything to send.
    expect(spent).toEqual([])
  })

  it("mints a fresh nonce each time, so two payments can never share one", async () => {
    const pay = async () => "the-hash"
    const first = await startPostage(pay, Promise.resolve(), ALICE, BOB, 1000)
    const second = await startPostage(pay, Promise.resolve(), ALICE, BOB, 1000)
    expect(first.nonce).not.toBe(second.nonce)
  })
})
