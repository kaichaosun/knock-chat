import { describe, expect, it } from "vitest"

import { addressFromPublicKey } from "./address"
import { hexToBytes, signedMessageDigest, verifySignedMessage } from "./signed-message"

/**
 * Captured from Nimiq Pay on iOS 18.1.1. The same vector pins
 * `knock-relay/src/signature.rs`, so client and relay cannot drift from each
 * other or from the wallet.
 */
const MESSAGE = "knock-probe-v1"
const PUBLIC_KEY = "f6457bf0a79ce0248d78e5e392b3d20c6895e5c89b63f23ac3118c24a421f2a8"
const SIGNATURE =
  "564e20011ce039194fe90acd21710c6e8f07e936de6a12b54d6001adbfda817b" +
  "0155233ffad4115c31bf95eeb518826b476400ae57401f8f38513961ed1d6f0c"
const ADDRESS = "NQ80 M6TC 2D6V 4H55 CBPF 9VQU CGFX HCYD 4RAB"

describe("Nimiq signed messages", () => {
  it("verifies a signature from a real wallet", () => {
    expect(verifySignedMessage(MESSAGE, SIGNATURE, PUBLIC_KEY)).toBe(true)
  })

  it("rejects a signature over a different message", () => {
    expect(verifySignedMessage("knock-probe-v2", SIGNATURE, PUBLIC_KEY)).toBe(false)
  })

  it("rejects a tampered signature", () => {
    const tampered = `00${SIGNATURE.slice(2)}`
    expect(verifySignedMessage(MESSAGE, tampered, PUBLIC_KEY)).toBe(false)
  })

  it("rejects malformed input rather than throwing", () => {
    expect(verifySignedMessage(MESSAGE, "not-hex", PUBLIC_KEY)).toBe(false)
  })

  it("derives the address the wallet itself reports", () => {
    expect(addressFromPublicKey(hexToBytes(PUBLIC_KEY))).toBe(ADDRESS)
  })

  /** The length prefix counts bytes, which only differs on non-ASCII input. */
  it("counts the message length in bytes, not characters", () => {
    expect(signedMessageDigest("é")).not.toEqual(signedMessageDigest("e"))
    expect(signedMessageDigest("é")).toHaveLength(32)
  })
})
