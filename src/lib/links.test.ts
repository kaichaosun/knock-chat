import { describe, expect, it } from "vitest"

import { linkFrom } from "./links"

describe("linkFrom", () => {
  it("gives back the address as it was typed, and the one it will follow", () => {
    expect(linkFrom("https://nimiq.com/pay?to=me")).toEqual({
      text: "https://nimiq.com/pay?to=me",
      href: "https://nimiq.com/pay?to=me",
    })
  })

  it("draws what was written even where parsing would tidy it", () => {
    // The host is lower-cased and a bare host is given its slash on the way to
    // an `href`. Neither may reach the screen: what is drawn has to be what
    // somebody sent.
    const link = linkFrom("https://Nimiq.com")
    expect(link?.text).toBe("https://Nimiq.com")
    expect(link?.href).toBe("https://nimiq.com/")
  })

  it("reads a scheme a phone keyboard has capitalised", () => {
    expect(linkFrom("Https://nimiq.com")?.href).toBe("https://nimiq.com/")
  })

  it("hands back the mark that ends the sentence rather than the link", () => {
    for (const mark of [".", ",", ";", ":", "!", "?", '"', "'"]) {
      expect(linkFrom(`https://nimiq.com${mark}`)?.text, mark).toBe("https://nimiq.com")
    }
  })

  it("hands back a whole run of them", () => {
    expect(linkFrom("https://nimiq.com?!.")?.text).toBe("https://nimiq.com")
  })

  it("gives a closing bracket back to the sentence that opened it", () => {
    expect(linkFrom("https://nimiq.com)")?.text).toBe("https://nimiq.com")
    expect(linkFrom("https://nimiq.com]")?.text).toBe("https://nimiq.com")
  })

  it("keeps one the link opened itself", () => {
    // The bracket is part of the address, and a link that loses it is a link
    // to somewhere else.
    const text = "https://en.wikipedia.org/wiki/Nimiq_(satellite)"
    expect(linkFrom(text)?.text).toBe(text)
  })

  it("keeps a query string with punctuation of its own in it", () => {
    const text = "https://nimiq.com/x?a=1&b=2#top"
    expect(linkFrom(text)?.text).toBe(text)
  })

  it("will not open a scheme that is not the web", () => {
    for (const text of [
      "javascript:alert(1)",
      "data:text/html,<h1>hi</h1>",
      "file:///etc/passwd",
      "ftp://example.com/file",
      "mailto:someone@example.com",
    ]) {
      expect(linkFrom(text), text).toBeNull()
    }
  })

  it("says no rather than guessing", () => {
    for (const text of ["", "   ", "...", "https://", "not a link at all"]) {
      expect(linkFrom(text), text).toBeNull()
    }
  })
})
