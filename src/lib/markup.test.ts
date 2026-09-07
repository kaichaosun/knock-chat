import { describe, expect, it } from "vitest"

import { blocks, pieces, unmarked } from "./markup"
import { mentionOf } from "./mentions"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"

describe("pieces", () => {
  it("leaves ordinary writing alone", () => {
    expect(pieces("nothing to see")).toEqual([{ kind: "text", text: "nothing to see" }])
  })

  it("reads a strong run", () => {
    expect(pieces("say **that** again")).toEqual([
      { kind: "text", text: "say " },
      { kind: "text", text: "that", bold: true },
      { kind: "text", text: " again" },
    ])
  })

  it("reads a strong run of one character", () => {
    expect(pieces("**a**")).toEqual([{ kind: "text", text: "a", bold: true }])
  })

  it("keeps a name inside a strong run, as a name", () => {
    expect(pieces(`ask **${mentionOf(ALICE)} first**`)).toEqual([
      { kind: "text", text: "ask " },
      { kind: "mention", address: ALICE, bold: true },
      { kind: "text", text: " first", bold: true },
    ])
  })

  it("keeps a link inside a strong run followable", () => {
    expect(pieces("**go to https://nimiq.com now**")).toEqual([
      { kind: "text", text: "go to ", bold: true },
      { kind: "link", text: "https://nimiq.com", href: "https://nimiq.com/", bold: true },
      { kind: "text", text: " now", bold: true },
    ])
  })

  it("leaves arithmetic alone, because a space follows the stars", () => {
    expect(pieces("4 ** 2 ** 3")).toEqual([{ kind: "text", text: "4 ** 2 ** 3" }])
  })

  it("will not run a strong pair across a line", () => {
    const text = "**start\nend**"
    expect(pieces(text)).toEqual([{ kind: "text", text }])
  })

  it("leaves empty stars as they were typed", () => {
    expect(pieces("****")).toEqual([{ kind: "text", text: "****" }])
  })

  it("reads two strong runs on one line separately", () => {
    expect(pieces("**one** and **two**")).toEqual([
      { kind: "text", text: "one", bold: true },
      { kind: "text", text: " and " },
      { kind: "text", text: "two", bold: true },
    ])
  })
})

describe("blocks", () => {
  it("hands back a message with no list as one block", () => {
    expect(blocks("first\n\nsecond")).toEqual([
      { kind: "lines", pieces: [{ kind: "text", text: "first\n\nsecond" }] },
    ])
  })

  it("reads a run of dashes as a list", () => {
    expect(blocks("- milk\n- eggs")).toEqual([
      {
        kind: "list",
        items: [
          { marker: "•", pieces: [{ kind: "text", text: "milk" }] },
          { marker: "•", pieces: [{ kind: "text", text: "eggs" }] },
        ],
      },
    ])
  })

  it("keeps a numbered list's own numbers", () => {
    expect(blocks("2. second\n3) third")).toEqual([
      {
        kind: "list",
        items: [
          { marker: "2.", pieces: [{ kind: "text", text: "second" }] },
          { marker: "3.", pieces: [{ kind: "text", text: "third" }] },
        ],
      },
    ])
  })

  it("flattens a nested list rather than dropping its words", () => {
    expect(blocks("- one\n  - under one")).toEqual([
      {
        kind: "list",
        items: [
          { marker: "•", pieces: [{ kind: "text", text: "one" }] },
          { marker: "•", pieces: [{ kind: "text", text: "under one" }] },
        ],
      },
    ])
  })

  it("puts the words around a list in their own blocks", () => {
    expect(blocks("shopping:\n- milk\nthat is all")).toEqual([
      { kind: "lines", pieces: [{ kind: "text", text: "shopping:" }] },
      { kind: "list", items: [{ marker: "•", pieces: [{ kind: "text", text: "milk" }] }] },
      { kind: "lines", pieces: [{ kind: "text", text: "that is all" }] },
    ])
  })

  it("reads what a list item says, not only that it is one", () => {
    expect(blocks("- **now** or never")).toEqual([
      {
        kind: "list",
        items: [
          {
            marker: "•",
            pieces: [
              { kind: "text", text: "now", bold: true },
              { kind: "text", text: " or never" },
            ],
          },
        ],
      },
    ])
  })

  it("is not fooled by an arrow, a bare dash, or a strong run", () => {
    for (const text of ["-> that way", "-", "- ", "**bold**"]) {
      expect(blocks(text).every((block) => block.kind === "lines")).toBe(true)
    }
  })

  it("says nothing about an empty message", () => {
    expect(blocks("")).toEqual([])
    expect(blocks("\n\n  \n")).toEqual([])
  })

  it("keeps the blank lines inside a passage and drops the ones between blocks", () => {
    // The one in the middle is what somebody wrote. The ones against the
    // heading are how markdown separates blocks, and drawing them made a
    // heading sit tight against the words above it and loose against the
    // words below — the same blank line rendering on one side and not the
    // other. Spacing is a margin now; see `message-bubble`.
    expect(blocks("one\n\ntwo\n\n# Heading\n\nthree")).toEqual([
      { kind: "lines", pieces: [{ kind: "text", text: "one\n\ntwo" }] },
      { kind: "heading", pieces: [{ kind: "text", text: "Heading" }] },
      { kind: "lines", pieces: [{ kind: "text", text: "three" }] },
    ])
  })
})

describe("unmarked", () => {
  it("takes the stars off", () => {
    expect(unmarked("say **that** again")).toBe("say that again")
  })

  it("takes the bullet off, leaving what it said", () => {
    expect(unmarked("- milk\n- eggs")).toBe("milk\neggs")
  })

  it("leaves a message with no markup exactly as it was", () => {
    const text = "4 ** 2, and -> that way"
    expect(unmarked(text)).toBe(text)
  })
})

describe("the marks a declared mode turns on", () => {
  it("reads emphasis, and keeps a word with underscores in it whole", () => {
    expect(pieces("*maybe*")).toEqual([{ kind: "text", text: "maybe", italic: true }])
    expect(pieces("_maybe_")).toEqual([{ kind: "text", text: "maybe", italic: true }])
    expect(pieces("call read_the_file now")).toEqual([
      { kind: "text", text: "call read_the_file now" },
    ])
  })

  it("prefers strong to emphasis where both could start", () => {
    expect(pieces("**loud**")).toEqual([{ kind: "text", text: "loud", bold: true }])
  })

  it("nests one inside another", () => {
    expect(pieces("**loud and *soft* here**")).toEqual([
      { kind: "text", text: "loud and ", bold: true },
      { kind: "text", text: "soft", bold: true, italic: true },
      { kind: "text", text: " here", bold: true },
    ])
  })

  it("gives up on three stars in a row, and shows them", () => {
    // Where an emphasised run ends against the closing `**`, this dialect
    // cannot tell which pair is which, and says so by leaving a star on the
    // screen rather than guessing. CommonMark reads it as bold around italic;
    // the whole message is still here either way, which is the trade named at
    // the top of `markup.ts`.
    expect(pieces("**loud and *soft***")).toEqual([
      { kind: "text", text: "loud and *soft", bold: true },
      { kind: "text", text: "*" },
    ])
  })

  it("reads a struck run", () => {
    expect(pieces("~~gone~~")).toEqual([{ kind: "text", text: "gone", strike: true }])
  })

  it("leaves what is inside backticks alone, links included", () => {
    expect(pieces("try `https://nimiq.com` first")).toEqual([
      { kind: "text", text: "try " },
      { kind: "text", text: "https://nimiq.com", code: true },
      { kind: "text", text: " first" },
    ])
  })

  it("refuses a written link label: what is drawn is where it goes", () => {
    // The label never becomes the link. What is left is the characters as they
    // were typed, and the destination showing as itself — so a reader sees
    // where this actually leads instead of the name it was given.
    expect(pieces("[nimiq.com](https://evil.example)")).toEqual([
      { kind: "text", text: "[nimiq.com](" },
      { kind: "link", text: "https://evil.example", href: "https://evil.example/" },
      { kind: "text", text: ")" },
    ])
  })

  it("reads a heading, without keeping how loud it asked to be", () => {
    expect(blocks("# one")).toEqual(blocks("#### one"))
    expect(blocks("## Results")).toEqual([
      { kind: "heading", pieces: [{ kind: "text", text: "Results" }] },
    ])
  })

  it("reads a run of quoted lines as one quote", () => {
    expect(blocks("> first\n> second")).toEqual([
      { kind: "quote", pieces: [{ kind: "text", text: "first\nsecond" }] },
    ])
  })

  it("keeps a fenced block verbatim, marks and all", () => {
    expect(blocks("```js\nconst a = **1**\n```")).toEqual([
      { kind: "code", text: "const a = **1**" },
    ])
  })

  it("gives an unclosed fence the rest of the message", () => {
    expect(blocks("```\nstill going")).toEqual([{ kind: "code", text: "still going" }])
  })

  it("keeps the blocks around each other in order", () => {
    expect(blocks("# Title\n- one\n> said\nplain").map((block) => block.kind)).toEqual([
      "heading",
      "list",
      "quote",
      "lines",
    ])
  })
})

describe("unmarked, for the one line a row has", () => {
  it("takes off every inline mark", () => {
    expect(unmarked("**a** *b* ~~c~~ `d`")).toBe("a b c d")
  })

  it("takes off the head of a line and keeps what it said", () => {
    expect(unmarked("# Title\n- one\n> said")).toBe("Title\none\nsaid")
  })

  it("drops the fences and keeps the code", () => {
    expect(unmarked("```js\nconst a = 1\n```")).toBe("const a = 1")
  })
})
