import { describe, expect, it } from "vitest"

import { encode, reaction } from "./payload"
import { firstEmoji } from "./emoji"
import { CHOICES, fold, mineAmong, mineOn, offered, remember, toggled } from "./reactions"
import type { Message } from "./messages"

const ME = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const THEM = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"
/** A third person, because a room has more than two. */
const OTHER = "NQ20 NTLC VQK9 PVLQ JB3G AN7K M903 3EC2 37EK"

/** A message the relay has named, so it can be reacted to. */
function said(tag: string, body = "hello", direction: "in" | "out" = "in"): Message {
  return {
    id: `relay:${tag}0000-0000-0000-0000-000000000000`.slice(0, 6 + 36),
    peer: THEM,
    direction,
    body,
    at: "2026-09-03T10:00:00Z",
    status: "sent",
  }
}

/**
 * `who` is the speaker, which is what tells two people's reactions apart.
 *
 * `emoji` is everything that person has on the message once this lands, which
 * is what a reaction message actually carries — see `lib/payload`.
 */
function reacted(
  to: string,
  emoji: string | string[],
  direction: "in" | "out",
  who: string = THEM,
): Message {
  return {
    id: `relay:${direction}-${to}-${emoji}-${who.slice(3, 7)}`,
    peer: who,
    direction,
    body: encode(reaction(to, typeof emoji === "string" ? (emoji ? [emoji] : []) : emoji)),
    at: "2026-09-03T10:01:00Z",
    status: "sent",
  }
}

const TAG = "4f2a91c3"

/** What the first build sent: one emoji, not a set. */
function legacy(to: string, emoji: string): string {
  return "\u001fknock1\n" + JSON.stringify({ kind: "reaction", to, emoji })
}

describe("fold", () => {
  it("takes reactions out of the thread and puts them on the message", () => {
    const target = said(TAG)
    const { shown, on } = fold([target, reacted(TAG, "👍", "in")], ME)

    expect(shown).toEqual([target])
    expect(on.get(target.id)).toEqual([{ emoji: "👍", count: 1, mine: false }])
  })

  it("knows which one is yours", () => {
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, "👍", "out")], ME)
    expect(on.get(target.id)).toEqual([{ emoji: "👍", count: 1, mine: true }])
  })

  it("counts the same emoji from two people once, with two behind it", () => {
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, "👍", "in"), reacted(TAG, "👍", "out")], ME)
    expect(on.get(target.id)).toEqual([{ emoji: "👍", count: 2, mine: true }])
  })

  it("lets somebody change their mind, and counts only the last word", () => {
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, "👍", "out"), reacted(TAG, "😂", "out")], ME)
    expect(on.get(target.id)).toEqual([{ emoji: "😂", count: 1, mine: true }])
  })

  it("lets one person hold several at once", () => {
    // Answering with a second emoji adds to the first rather than replacing
    // it — the message carries the whole set, so both survive.
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, ["👍", "😂"], "out")], ME)
    expect(on.get(target.id)).toEqual([
      { emoji: "👍", count: 1, mine: true },
      { emoji: "😂", count: 1, mine: true },
    ])
  })

  it("takes one of several off and leaves the rest", () => {
    const target = said(TAG)
    const { on } = fold(
      [target, reacted(TAG, ["👍", "😂"], "out"), reacted(TAG, ["😂"], "out")],
      ME,
    )
    expect(on.get(target.id)).toEqual([{ emoji: "😂", count: 1, mine: true }])
  })

  it("still reads the lone emoji the first build sent", () => {
    // A message already on somebody's phone cannot be rewritten.
    const target = said(TAG)
    const { on } = fold([target, { ...reacted(TAG, [], "in"), body: legacy(TAG, "👍") }], ME)
    expect(on.get(target.id)).toEqual([{ emoji: "👍", count: 1, mine: false }])
  })

  it("takes one back when the last one is empty", () => {
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, "👍", "out"), reacted(TAG, "", "out")], ME)
    expect(on.has(target.id)).toBe(false)
  })

  it("leaves other people's alone when you take yours back", () => {
    const target = said(TAG)
    const { on } = fold(
      [target, reacted(TAG, "👍", "in"), reacted(TAG, "👍", "out"), reacted(TAG, "", "out")],
      ME,
    )
    expect(on.get(target.id)).toEqual([{ emoji: "👍", count: 1, mine: false }])
  })

  it("keeps the order they first appeared in, not the order of the count", () => {
    // A row that reorders itself as people react is a row nobody can tap twice
    // in the same place.
    const target = said(TAG)
    const { on } = fold(
      [
        target,
        reacted(TAG, "😂", "in"),
        reacted(TAG, "👍", "out"),
        reacted(TAG, "👍", "in", OTHER),
      ],
      ME,
    )
    expect(on.get(target.id)?.map((one) => one.emoji)).toEqual(["😂", "👍"])
  })

  it("hides a reaction to something this thread no longer holds", () => {
    // It still comes out of the conversation: a bubble saying "something it
    // can't display" is worse than a reaction nobody sees.
    const { shown, on } = fold([reacted("deadbeef", "👍", "in")], ME)
    expect(shown).toEqual([])
    expect(on.size).toBe(0)
  })

  it("leaves a message still on its way out of it", () => {
    // Nothing can point at a `local:` id, so nothing can be reacted to yet.
    const pending: Message = { ...said(TAG), id: "local:abc", status: "sending" }
    const { shown, on } = fold([pending], ME)
    expect(shown).toEqual([pending])
    expect(on.size).toBe(0)
  })

  it("says what is already yours", () => {
    const reactions = [{ emoji: "👍", count: 2, mine: true }, { emoji: "😂", count: 1, mine: false }]
    expect(mineOn(reactions, "👍")).toBe(true)
    expect(mineOn(reactions, "😂")).toBe(false)
    expect(mineOn(undefined, "👍")).toBe(false)
  })
})

describe("the row somebody is offered", () => {
  it("puts what they last used in front of the defaults", () => {
    expect(offered(["🎉"])).toEqual(["🎉", "👍", "❤️", "😂", "😮", "😢"])
  })

  it("never shows the same one twice", () => {
    expect(offered(["👍"])).toEqual(["👍", "❤️", "😂", "😮", "😢", "🙏"])
  })

  it("is the defaults for somebody who has never reacted", () => {
    expect(offered([])).toEqual(CHOICES)
  })

  it("moves one to the front rather than adding it again", () => {
    expect(remember(["🎉", "👍"], "👍")).toEqual(["👍", "🎉"])
  })

  it("forgets the oldest once the row is full", () => {
    const full = ["1", "2", "3", "4", "5", "6"]
    expect(remember(full, "7")).toEqual(["7", "1", "2", "3", "4", "5"])
  })
})

describe("firstEmoji", () => {
  it("takes one out of whatever was typed", () => {
    expect(firstEmoji("👍")).toBe("👍")
    expect(firstEmoji("  🎉  ")).toBe("🎉")
  })

  it("keeps a joined emoji whole", () => {
    // Seven code points held together by joiners. Split on characters it would
    // send a lone man and lose his family.
    expect(firstEmoji("👨‍👩‍👧‍👦")).toBe("👨‍👩‍👧‍👦")
    // Two regional indicators, which are not two flags — and not pictographic
    // either, which is why the test is three properties wide.
    expect(firstEmoji("🇯🇵")).toBe("🇯🇵")
    // A digit wearing a keycap. The digit alone is not an emoji.
    expect(firstEmoji("1️⃣")).toBe("1️⃣")
    expect(firstEmoji("1")).toBeNull()
  })

  it("takes the first where there are several", () => {
    expect(firstEmoji("👍🎉")).toBe("👍")
  })

  it("says no to anything that is not one", () => {
    for (const text of ["", "   ", "hello", "1", "👍".normalize("NFD").slice(0, 1)]) {
      expect(firstEmoji(text), JSON.stringify(text)).toBeNull()
    }
  })

  it("refuses a sentence that merely contains one", () => {
    // The field is for an emoji, and text with one buried in it is text.
    expect(firstEmoji("nice 👍")).toBeNull()
  })
})

describe("what arrives from somebody else", () => {
  it("refuses a reaction that is not an emoji", () => {
    // A pill sits beside somebody's words with no room to say where it came
    // from, so a peer must not be able to put a sentence in one.
    const target = said(TAG)
    const shouting: Message = {
      ...reacted(TAG, "x", "in"),
      body: encode(reaction(TAG, ["LOL"])),
    }
    const { on } = fold([target, shouting], ME)
    expect(on.has(target.id)).toBe(false)
  })

  it("keeps one that is", () => {
    const target = said(TAG)
    const { on } = fold([target, reacted(TAG, "🎉", "in")], ME)
    expect(on.get(target.id)).toEqual([{ emoji: "🎉", count: 1, mine: false }])
  })
})

describe("toggled", () => {
  it("adds one that is not there", () => {
    expect(toggled([], "👍")).toEqual(["👍"])
    expect(toggled(["👍"], "😂")).toEqual(["👍", "😂"])
  })

  it("takes off one that is", () => {
    expect(toggled(["👍", "😂"], "👍")).toEqual(["😂"])
  })

  it("drops the oldest rather than growing without end", () => {
    const full = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"]
    expect(toggled(full, "🎉")).toHaveLength(8)
    expect(toggled(full, "🎉")).not.toContain("1️⃣")
  })

  it("says which are yours", () => {
    expect(
      mineAmong([
        { emoji: "👍", count: 2, mine: true },
        { emoji: "😂", count: 1, mine: false },
      ]),
    ).toEqual(["👍"])
    expect(mineAmong(undefined)).toEqual([])
  })
})
