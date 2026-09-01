import { describe, expect, it } from "vitest"

import { quoted, unquote } from "./quote"

const ALICE = { author: "Alice", said: "are we still on for six" }

describe("quoted", () => {
  it("writes the quote line, then the words", () => {
    expect(quoted(ALICE, "yes, see you there")).toBe(
      "> Alice: are we still on for six\nyes, see you there",
    )
  })

  it("keeps the quote to one line, however many the original had", () => {
    const { quote } = unquote(quoted({ author: "Alice", said: "one\ntwo\nthree" }, "ok"))
    expect(quote?.said).toBe("one two three")
  })

  it("will not let a name cut itself in half on the colon", () => {
    const { quote } = unquote(quoted({ author: "Alice: the second", said: "hi" }, "ok"))
    // The colon becomes a space, and the run of spaces then collapses.
    expect(quote?.author).toBe("Alice the second")
  })

  it("cuts a long quote short rather than spending the message on it", () => {
    const said = "x".repeat(400)
    const { quote } = unquote(quoted({ author: "Alice", said }, "ok"))
    expect(quote?.said).toHaveLength(120)
  })

  it("sends the words alone when there is nothing to quote", () => {
    expect(quoted({ author: "", said: "hi" }, "ok")).toBe("ok")
    expect(quoted({ author: "Alice", said: "" }, "ok")).toBe("ok")
  })
})

describe("unquote", () => {
  it("reads back what was written", () => {
    expect(unquote(quoted(ALICE, "yes, see you there"))).toEqual({
      quote: ALICE,
      body: "yes, see you there",
    })
  })

  it("keeps every line of a reply that runs on", () => {
    expect(unquote(quoted(ALICE, "yes\nand also this")).body).toBe("yes\nand also this")
  })

  it("leaves an ordinary message alone", () => {
    for (const text of [
      "just talking",
      // Shaped like a quote and answering nothing, so it is what it says.
      "> Alice: are we still on for six",
      // No colon, so no author.
      "> not really a quote\nand a line under it",
      // Nothing quoted.
      "> Alice: \nhello",
      // Not at the start.
      "hello\n> Alice: hi\nthere",
      "",
    ]) {
      expect(unquote(text), text).toEqual({ quote: null, body: text })
    }
  })

  it("reads a name that is a shortened address", () => {
    const address = "NQ97 V68G … JLKY"
    const { quote, body } = unquote(quoted({ author: address, said: "hi" }, "hello"))
    expect(quote?.author).toBe(address)
    expect(body).toBe("hello")
  })
})
