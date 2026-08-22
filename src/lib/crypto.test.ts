import { describe, expect, it } from "vitest"

import {
  conversationKey,
  decryptBody,
  encryptBody,
  generateKeyPair,
  looksEncrypted,
} from "./crypto"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ05 563U 530Y XDRT L7GQ M6HE YRNU 20FE 4PNR"

describe("conversationKey", () => {
  it("both sides derive the same key from opposite halves", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    expect(conversationKey(alice.secretKey, bob.publicKey)).toEqual(
      conversationKey(bob.secretKey, alice.publicKey),
    )
  })

  it("a different peer gives a different key", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const carol = generateKeyPair()
    expect(conversationKey(alice.secretKey, bob.publicKey)).not.toEqual(
      conversationKey(alice.secretKey, carol.publicKey),
    )
  })
})

describe("sealing", () => {
  it("round trips", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const key = conversationKey(alice.secretKey, bob.publicKey)

    const sealed = encryptBody("meet me at six", key, ALICE, BOB)
    expect(sealed).not.toContain("meet me")
    expect(decryptBody(sealed, conversationKey(bob.secretKey, alice.publicKey), ALICE, BOB)).toBe(
      "meet me at six",
    )
  })

  it("produces a different ciphertext every time", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const key = conversationKey(alice.secretKey, bob.publicKey)
    expect(encryptBody("same", key, ALICE, BOB)).not.toBe(encryptBody("same", key, ALICE, BOB))
  })

  it("refuses a key that was not part of the conversation", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const carol = generateKeyPair()

    const sealed = encryptBody("private", conversationKey(alice.secretKey, bob.publicKey), ALICE, BOB)
    expect(decryptBody(sealed, conversationKey(carol.secretKey, alice.publicKey), ALICE, BOB)).toBeNull()
  })

  /** The associated data binds direction, so a ciphertext cannot be replayed back. */
  it("refuses a message reflected to its sender", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const key = conversationKey(alice.secretKey, bob.publicKey)

    const sealed = encryptBody("hello", key, ALICE, BOB)
    expect(decryptBody(sealed, key, BOB, ALICE)).toBeNull()
  })

  it("refuses tampered ciphertext", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const key = conversationKey(alice.secretKey, bob.publicKey)

    const sealed = encryptBody("hello", key, ALICE, BOB)
    const tampered = sealed.slice(0, -4) + (sealed.endsWith("A") ? "B===" : "A===")
    expect(decryptBody(tampered, key, ALICE, BOB)).toBeNull()
  })

  it("returns null rather than throwing on plain text", () => {
    const key = conversationKey(generateKeyPair().secretKey, generateKeyPair().publicKey)
    expect(decryptBody("just a plain message", key, ALICE, BOB)).toBeNull()
    expect(decryptBody("", key, ALICE, BOB)).toBeNull()
  })

  it("recognises its own output and nothing else", () => {
    const key = conversationKey(generateKeyPair().secretKey, generateKeyPair().publicKey)
    expect(looksEncrypted(encryptBody("hi", key, ALICE, BOB))).toBe(true)
    expect(looksEncrypted("hello there")).toBe(false)
  })

  it("carries unicode intact", () => {
    const alice = generateKeyPair()
    const bob = generateKeyPair()
    const key = conversationKey(alice.secretKey, bob.publicKey)
    const message = "café — 日本語 — 🔒"
    expect(decryptBody(encryptBody(message, key, ALICE, BOB), key, ALICE, BOB)).toBe(message)
  })
})
