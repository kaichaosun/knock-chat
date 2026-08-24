import { describe, expect, it } from "vitest"

import { reason } from "./reason"

describe("reason", () => {
  it("takes the message off an Error", () => {
    expect(reason(new Error("door is shut"), "fallback")).toBe("door is shut")
  })

  it("reads what a wallet provider rejects with", () => {
    // The shape the Nimiq provider uses. Losing this one is what turned a
    // real failure into "Couldn't leave the gift" with no way to act on it.
    expect(reason({ error: { type: "user", message: "Cancelled" } }, "fallback")).toBe("Cancelled")
  })

  it("takes a thrown string as it is", () => {
    expect(reason("plain string", "fallback")).toBe("plain string")
  })

  it("falls back rather than showing an empty message", () => {
    expect(reason(new Error("   "), "fallback")).toBe("fallback")
    expect(reason(null, "fallback")).toBe("fallback")
    expect(reason(undefined, "fallback")).toBe("fallback")
    expect(reason({}, "fallback")).toBe("fallback")
  })

  it("shows the shape of something unrecognisable, rather than nothing", () => {
    // Not pretty, but searchable — better than a fallback that says only
    // that something went wrong.
    expect(reason({ code: 42 }, "fallback")).toBe('{"code":42}')
  })

  it("survives something that cannot be serialised", () => {
    const loop: Record<string, unknown> = {}
    loop.self = loop
    expect(reason(loop, "fallback")).toBe("fallback")
  })
})
