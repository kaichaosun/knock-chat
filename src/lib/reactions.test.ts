import { describe, expect, it } from "vitest"

import { encode, reaction } from "./payload"
import { fold, mineOn } from "./reactions"
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

/** `who` is the speaker, which is what tells two people's reactions apart. */
function reacted(
  to: string,
  emoji: string,
  direction: "in" | "out",
  who: string = THEM,
): Message {
  return {
    id: `relay:${direction}-${to}-${emoji}-${who.slice(3, 7)}`,
    peer: who,
    direction,
    body: encode(reaction(to, emoji)),
    at: "2026-09-03T10:01:00Z",
    status: "sent",
  }
}

const TAG = "4f2a91c3"

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
