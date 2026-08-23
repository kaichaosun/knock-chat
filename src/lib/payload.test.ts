import { describe, expect, it } from "vitest"

import { decode, encode, payment, preview, text } from "./payload"

/** The frame marker, spelled out here so a test can forge one by hand. */
const FRAME = "\u0000knock1\n"

describe("text", () => {
  it("travels as itself, so old messages and older clients still work", () => {
    expect(encode(text("hello"))).toBe("hello")
    expect(decode("hello")).toEqual({ kind: "text", text: "hello" })
  })

  it("is still text when it happens to look like the frame's contents", () => {
    // Without the NUL marker this is a message someone typed, not a payload.
    const typed = '{"kind":"payment","luna":100000}'
    expect(decode(typed)).toEqual({ kind: "text", text: typed })
  })

  it("survives a round trip with newlines and emoji", () => {
    const body = "line one\nline two 🛰"
    expect(decode(encode(text(body)))).toEqual({ kind: "text", text: body })
  })
})

describe("payment", () => {
  it("survives a round trip", () => {
    const encoded = encode(payment(1_000_000, "abc123"))
    expect(decode(encoded)).toEqual({
      kind: "payment",
      payment: { luna: 1_000_000, reference: "abc123" },
    })
  })

  it("keeps a missing reference as null rather than inventing one", () => {
    expect(decode(encode(payment(500, null)))).toEqual({
      kind: "payment",
      payment: { luna: 500, reference: null },
    })
  })

  it("is not text, so it never renders as a wall of JSON", () => {
    expect(decode(encode(payment(1, null))).kind).toBe("payment")
  })

  it("refuses an amount that is not a whole positive number of luna", () => {
    // Each of these would draw a card for something that cannot have happened.
    for (const luna of [0, -100, 1.5, Number.MAX_SAFE_INTEGER + 2, NaN]) {
      const forged = FRAME + JSON.stringify({ kind: "payment", luna })
      expect(decode(forged), `luna ${luna}`).toEqual({ kind: "unknown" })
    }
  })
})

describe("an unrecognised frame", () => {
  it("is unknown rather than an error, so a newer sender degrades gracefully", () => {
    // What this build will receive once another one starts sending images.
    const future = `${FRAME}{"kind":"image","url":"…"}`
    expect(decode(future)).toEqual({ kind: "unknown" })
  })

  it("is unknown rather than a crash when the frame is damaged", () => {
    expect(decode(`${FRAME}{ not json`)).toEqual({ kind: "unknown" })
    expect(decode(FRAME)).toEqual({ kind: "unknown" })
  })

  it("cannot be re-encoded, since this build never understood it", () => {
    expect(() => encode({ kind: "unknown" })).toThrow()
  })
})

describe("preview", () => {
  it("names the sender correctly from either end", () => {
    const paid = encode(payment(1_000_000, null))
    expect(preview(paid, "out")).toBe("Sent 10 NIM")
    expect(preview(paid, "in")).toBe("Received 10 NIM")
  })

  it("prefixes your own text but not theirs", () => {
    expect(preview("hi", "out")).toBe("You: hi")
    expect(preview("hi", "in")).toBe("hi")
  })

  it("never leaks a frame into a chat list", () => {
    expect(preview(`${FRAME}{"kind":"image"}`, "in")).toBe("Unsupported message")
  })
})
