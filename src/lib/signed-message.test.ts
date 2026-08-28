import { describe, expect, it } from "vitest"
import { ed25519 } from "@noble/curves/ed25519.js"

import { addressFromPublicKey } from "./address"
import { toHex } from "./crypto"
import { hexToBytes, signedMessageDigest, verifySignedMessage } from "./signed-message"

const MESSAGE = "knock-probe-v1"

/** A signer for the cases that need one. Nobody's, and no funds behind it. */
const SECRET = new Uint8Array(32).fill(9)
const PUBLIC_KEY = toHex(ed25519.getPublicKey(SECRET))
const SIGNATURE = toHex(ed25519.sign(signedMessageDigest(MESSAGE), SECRET))

describe("Nimiq signed messages", () => {
  it("verifies a signature over that digest", () => {
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

  it("derives an address from the key that signed", () => {
    expect(addressFromPublicKey(hexToBytes(PUBLIC_KEY))).toMatch(/^NQ\d{2} /)
  })

  /** The length prefix counts bytes, which only differs on non-ASCII input. */
  it("counts the message length in bytes, not characters", () => {
    expect(signedMessageDigest("é")).not.toEqual(signedMessageDigest("e"))
    expect(signedMessageDigest("é")).toHaveLength(32)
  })
})
