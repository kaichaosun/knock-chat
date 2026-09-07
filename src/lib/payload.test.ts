import { describe, expect, it } from "vitest"

import { contactNote, decode, encode, giftNote, invite, payment, preview, text } from "./payload"
import { mentionOf } from "./mentions"
import { remember } from "./names"

/** The frame marker, spelled out here so a test can forge one by hand. */
const FRAME = "\u001fknock1\n"

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

describe("a text message that says how to read it", () => {
  it("takes a frame only because it has something to declare", () => {
    const said = encode(text("**hi**", "markdown"))
    expect(said.startsWith(FRAME)).toBe(true)
    expect(decode(said)).toEqual({ kind: "text", text: "**hi**", parse: "markdown" })
  })

  it("leaves every message that declares nothing unframed", () => {
    // The wire is what it always was for anybody typing. Only a sender with an
    // opinion about its words pays for a frame.
    expect(encode(text("**hi**"))).toBe("**hi**")
  })

  it("reads a mode it does not know as plain, keeping the words", () => {
    const forged = FRAME + JSON.stringify({ kind: "text", parse: "rst", text: "hello" })
    expect(decode(forged)).toEqual({ kind: "text", text: "hello" })
  })

  it("is not a message at all without the words", () => {
    const forged = FRAME + JSON.stringify({ kind: "text", parse: "markdown" })
    expect(decode(forged)).toEqual({ kind: "unknown" })
  })

  it("reads as its words in a chat row, with the markup off", () => {
    expect(preview(encode(text("# Done\n- **one**", "markdown")), "in")).toBe("Done\none")
  })

  it("leaves the same characters alone in a row when nothing was declared", () => {
    expect(preview(encode(text("# Done")), "in")).toBe("# Done")
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

describe("contact notes", () => {
  const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"

  it("survives the round trip", () => {
    const shared = encode(contactNote(ALICE, "Alice"))
    expect(decode(shared)).toEqual({
      kind: "contact",
      contact: { address: ALICE, name: "Alice" },
    })
  })

  it("keeps a nameless one, because the address is the whole of it", () => {
    expect(decode(encode(contactNote(ALICE, "")))).toEqual({
      kind: "contact",
      contact: { address: ALICE, name: "" },
    })
  })

  it("refuses one whose address is not an address", () => {
    const bogus = `${FRAME}${JSON.stringify({ kind: "contact", address: "NQ00 nope", name: "x" })}`
    expect(decode(bogus).kind).toBe("unknown")
  })

  it("reads an address however it was written", () => {
    const spaced = `${FRAME}${JSON.stringify({
      kind: "contact",
      address: ALICE.replace(/\s/g, "").toLowerCase(),
      name: "",
    })}`
    expect(decode(spaced)).toEqual({ kind: "contact", contact: { address: ALICE, name: "" } })
  })

  it("says who was shared, from each end", () => {
    const shared = encode(contactNote(ALICE, "Alice"))
    expect(preview(shared, "out")).toBe("You shared Alice")
    expect(preview(shared, "in")).toBe("Shared Alice with you")
  })

  it("falls back to the address when no name travelled", () => {
    const shared = encode(contactNote(ALICE, ""))
    expect(preview(shared, "in")).toBe("Shared NQ97 V68G … JLKY with you")
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

describe("invite", () => {
  const ID = "9d23068a-287d-407d-ac4c-53f20451c5e2"

  it("survives a round trip", () => {
    expect(decode(encode(invite(ID, "Nimiq builders")))).toEqual({
      kind: "invite",
      invite: { group: ID, name: "Nimiq builders" },
    })
  })

  it("keeps a nameless invite openable", () => {
    // The name is decoration; the id is the part that has to work.
    expect(decode(encode(invite(ID, "")))).toEqual({
      kind: "invite",
      invite: { group: ID, name: "" },
    })
  })

  it("refuses one that points at nothing", () => {
    // A card for an unopenable room would be a button that cannot work.
    for (const group of ["", "not-a-uuid", "9d23068a"]) {
      const forged = FRAME + JSON.stringify({ kind: "invite", group, name: "x" })
      expect(decode(forged), group).toEqual({ kind: "unknown" })
    }
  })

  it("reads an id out of a link, since that is what gets pasted around", () => {
    const forged = FRAME + JSON.stringify({
      kind: "invite",
      group: `http://192.168.1.101:5175/?group=${ID}`,
      name: "Lobby",
    })
    expect(decode(forged)).toMatchObject({ invite: { group: ID } })
  })

  it("reads differently from each end in a chat list", () => {
    const shared = encode(invite(ID, "Lobby"))
    expect(preview(shared, "out")).toBe("You shared Lobby")
    expect(preview(shared, "in")).toBe("Invited you to Lobby")
  })

  it("says something sensible when the name is missing", () => {
    expect(preview(encode(invite(ID, "")), "in")).toBe("Invited you to a group")
  })
})

describe("gift", () => {
  const ID = "9d23068a-287d-407d-ac4c-53f20451c5e2"

  it("survives a round trip", () => {
    expect(decode(encode(giftNote(ID, 1_000_000, 5, "have some")))).toEqual({
      kind: "gift",
      giftNote: { gift: ID, total_luna: 1_000_000, shares: 5, note: "have some" },
    })
  })

  it("carries no count of what is left", () => {
    // The one number guaranteed to change. Freezing it into the message would
    // make every card wrong the moment somebody claimed.
    const encoded = encode(giftNote(ID, 1_000_000, 5, ""))
    expect(encoded).not.toContain("claimed")
  })

  it("refuses a pot that could not exist", () => {
    for (const bad of [
      { gift: "nope", total_luna: 100, shares: 2 },
      { gift: ID, total_luna: 0, shares: 2 },
      { gift: ID, total_luna: -5, shares: 2 },
      { gift: ID, total_luna: 100, shares: 0 },
      { gift: ID, total_luna: 1.5, shares: 2 },
    ]) {
      const forged = FRAME + JSON.stringify({ kind: "gift", ...bad })
      expect(decode(forged), JSON.stringify(bad)).toEqual({ kind: "unknown" })
    }
  })

  it("reads differently from each end in a chat list", () => {
    const left = encode(giftNote(ID, 1_000_000, 5, "have some"))
    expect(preview(left, "out")).toBe("You left 10 NIM")
    expect(preview(left, "in")).toBe("Left 10 NIM for the room")
  })
})

describe("the frame itself", () => {
  it("carries nothing a text column will refuse", () => {
    // It was a NUL byte until Postgres rejected one: `invalid byte sequence for
    // encoding "UTF8": 0x00`. Encrypted messages hid it, since base64 has no
    // NUL — a group message, stored as written, did not.
    const framed = encode(giftNote("9d23068a-287d-407d-ac4c-53f20451c5e2", 100, 2, "hi"))
    expect(framed).not.toContain("\u0000")
  })

  it("still cannot be typed", () => {
    // The whole point of the marker: a person cannot produce one by writing a
    // message, so "this is not text" stays a decision rather than a guess.
    expect(decode("\u001f")).toEqual({ kind: "text", text: "\u001f" })
    expect(decode("hello")).toEqual({ kind: "text", text: "hello" })
  })
})

describe("a message that names somebody", () => {
  /** Checksummed, the same vector the rest of the tests use. */
  const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"

  it("reads as the name when that is all it says", () => {
    // One mention and nothing else splits into a single part, which used to be
    // mistaken for a message with nothing in it worth looking up — so the
    // commonest way to name somebody came out as the raw address.
    remember({ [ALICE.replace(/\s/g, "")]: "Alice" })
    expect(preview(mentionOf(ALICE), "in")).toBe("@Alice")
  })

  it("reads as the name among words", () => {
    remember({ [ALICE.replace(/\s/g, "")]: "Alice" })
    expect(preview(`hey ${mentionOf(ALICE)}`, "in")).toBe("hey @Alice")
  })
})

describe("an answer opened before there was any of it", () => {
  const opener = FRAME + JSON.stringify({ kind: "text", parse: "markdown", part: { at: 0 }, text: "" })

  it("is a text message with nothing said and more coming", () => {
    expect(decode(opener)).toEqual({
      kind: "text",
      text: "",
      parse: "markdown",
      part: { at: 0 },
    })
  })

  it("reads as writing in a chat row rather than as a blank line", () => {
    expect(preview(opener, "in")).toBe("Writing…")
  })

  it("says nothing of the sort once there are words", () => {
    const said = FRAME + JSON.stringify({ kind: "text", part: { at: 0 }, text: "half an answer" })
    expect(preview(said, "in")).toBe("half an answer")
  })
})
