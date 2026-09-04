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

describe("the message id a quote carries", () => {
  it("writes it, and reads it back", () => {
    const written = quoted({ ...ALICE, id: "4f2a91c3" }, "ok")
    expect(written).toBe("> Alice #4f2a91c3: are we still on for six\nok")
    expect(unquote(written).quote).toEqual({ ...ALICE, id: "4f2a91c3" })
  })

  it("still reads a quote from before there were ids", () => {
    const { quote, body } = unquote("> Alice: are we still on for six\nok")
    expect(quote).toEqual(ALICE)
    expect(quote?.id).toBeUndefined()
    expect(body).toBe("ok")
  })

  it("leaves it out rather than writing one nothing could find", () => {
    for (const id of ["", "nothex!!", "4F2A91C3", "4f2a91", "4f2a91c3d4"]) {
      const { quote } = unquote(quoted({ ...ALICE, id }, "ok"))
      expect(quote?.id, id).toBeUndefined()
    }
  })

  it("loses nothing from an author who ends in something id-shaped", () => {
    // A name may contain anything, so one can be read as carrying an id it does
    // not have. Nothing is lost — the two halves still add up — and the worst
    // that follows is a lookup for an id no message has, which falls through to
    // matching on the snippet.
    const { quote } = unquote(quoted({ ...ALICE, author: "Bob #12345678" }, "ok"))
    expect(quote?.author).toBe("Bob")
    expect(quote?.id).toBe("12345678")
    expect(`${quote?.author} #${quote?.id}`).toBe("Bob #12345678")
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

describe("counting characters", () => {
  // Both ends have to agree on what a character is. `oneLine` cuts by code
  // point so a surrogate pair is never sliced in half; the pattern has to read
  // it back the same way, or a quote it wrote is a quote it cannot parse.
  const LINK =
    "https://snowflakes.nimpowered.com/snowflakes/c2e7b2bed7dbc3a750869a8410f3dcea0e3bd81dd3807520ed31707a11536d20"

  it("reads back a quote long enough to be cut, with an emoji in it", () => {
    // The message that found this: an emoji, then a link long enough to push
    // the line past the cap. One without the other parses either way.
    const said = `Yay! That means we will see a beautiful snowflake right there 👇\n${LINK}`
    const wire = quoted({ author: "Alice", said, id: "deadbeef" }, "nice one")

    const back = unquote(wire)
    expect(back.quote).not.toBeNull()
    expect(back.quote?.author).toBe("Alice")
    expect(back.quote?.id).toBe("deadbeef")
    expect(back.body).toBe("nice one")
    // The whole point of the cut: what was written is what comes back.
    expect(back.quote?.said).toBe(wire.slice(wire.indexOf(": ") + 2, wire.indexOf("\n")))
  })

  it("reads back an author cut to the cap with an emoji in it", () => {
    // 47 letters and an emoji: 48 code points, 49 UTF-16 units. The cap is 48,
    // so the two ways of counting disagree about whether this fits.
    const author = `${"a".repeat(47)}👋 and more`
    const wire = quoted({ author, said: "hello" }, "hi")
    expect(unquote(wire).quote?.author).toBe(`${"a".repeat(47)}👋`)
  })

  it("still refuses a line that is genuinely too long", () => {
    // The cap is not being widened, only measured consistently — a hand-written
    // line over it is still not a reply.
    const wire = `> Alice: ${"x".repeat(121)}\nbody`
    expect(unquote(wire).quote).toBeNull()
  })
})
