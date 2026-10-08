import { describe, expect, it } from "vitest"

import { encode, reaction } from "./payload"
import { firstUnread } from "./unread"
import type { Message } from "./messages"

const ME = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const THEM = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"

function said(n: number, direction: "in" | "out" = "in"): Message {
  return {
    id: `relay:${n}`,
    peer: THEM,
    direction,
    body: `message ${n}`,
    at: `2026-09-03T10:0${n}:00Z`,
    status: "sent",
  }
}

function reacted(n: number): Message {
  return { ...said(n), body: encode(reaction("4f2a91c3", ["👍"])) }
}

describe("firstUnread", () => {
  it("is nothing when nothing is unread", () => {
    expect(firstUnread([said(1), said(2)], 0, ME)).toBeNull()
  })

  it("counts back over incoming messages only", () => {
    // Two unread: 2 and 4. Your own 3 sits between them and is not counted.
    const thread = [said(1), said(2), said(3, "out"), said(4)]
    expect(firstUnread(thread, 2, ME)).toBe("relay:2")
  })

  it("skips a reaction to the next message that is drawn", () => {
    const thread = [said(1), reacted(2), said(3)]
    expect(firstUnread(thread, 2, ME)).toBe("relay:3")
  })

  it("is nothing when the only thing new is a reaction", () => {
    expect(firstUnread([said(1), reacted(2)], 1, ME)).toBeNull()
  })

  it("starts at the top when more is unread than is held", () => {
    expect(firstUnread([said(1), said(2)], 5, ME)).toBe("relay:1")
  })
})
