import { describe, expect, it } from "vitest"

import { conversations, emptySnapshot, mergeIncoming, threadWith } from "./messages"
import type { Snapshot } from "./messages"
import type { Envelope } from "./relay"

const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const BOB = "NQ05 563U 530Y XDRT L7GQ M6HE YRNU 20FE 4PNR"

function envelope(seq: number, body: string, from = ALICE, id = `id-${seq}`): Envelope {
  return {
    id,
    seq,
    from,
    to: BOB,
    body,
    created_at: new Date(2026, 0, 1, 12, seq).toISOString(),
  }
}

function cursor(seq: number, instance = "relay-one"): string {
  return `${instance}.${seq}`
}

describe("mergeIncoming", () => {
  it("adds new envelopes and stores the cursor the relay issued", () => {
    const next = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "hi"), envelope(2, "again")],
      cursor(2),
    )
    expect(next.messages).toHaveLength(2)
    expect(next.cursor).toBe(cursor(2))
    expect(next.messages[0].direction).toBe("in")
  })

  it("ignores envelopes it already holds", () => {
    const once = mergeIncoming(emptySnapshot(), [envelope(1, "hi")], cursor(1))
    const twice = mergeIncoming(once, [envelope(1, "hi")], cursor(1))
    expect(twice.messages).toHaveLength(1)
  })

  /**
   * A rebuilt relay restarts its numbering and replays from the beginning. The
   * replayed messages carry their original ids, so they deduplicate away rather
   * than appearing twice — which is why ids cannot be derived from `seq`.
   */
  it("deduplicates a replay from a rebuilt relay", () => {
    const before = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "one", ALICE, "stable-a"), envelope(2, "two", ALICE, "stable-b")],
      cursor(2),
    )
    // Same messages, renumbered from one, under a new instance.
    const after = mergeIncoming(
      before,
      [envelope(1, "one", ALICE, "stable-a"), envelope(2, "two", ALICE, "stable-b")],
      cursor(2, "relay-two"),
    )
    expect(after.messages).toHaveLength(2)
    expect(after.cursor).toBe(cursor(2, "relay-two"))
  })

  it("distinguishes a genuinely new message that reuses a seq", () => {
    const before = mergeIncoming(emptySnapshot(), [envelope(1, "old", ALICE, "old-id")], cursor(1))
    const after = mergeIncoming(
      before,
      [envelope(1, "new", ALICE, "new-id")],
      cursor(1, "relay-two"),
    )
    expect(after.messages).toHaveLength(2)
  })

  /**
   * The cursor has to advance even when nothing new arrived, or a client that
   * was replayed to would ask for the same page forever.
   */
  it("advances the cursor even when every envelope was a duplicate", () => {
    const before = mergeIncoming(emptySnapshot(), [envelope(1, "hi")], cursor(1))
    const after = mergeIncoming(before, [envelope(1, "hi")], cursor(1, "relay-two"))
    expect(after.cursor).toBe(cursor(1, "relay-two"))
  })

  it("leaves the snapshot untouched when nothing arrived and the cursor stands", () => {
    const snapshot: Snapshot = mergeIncoming(emptySnapshot(), [envelope(1, "hi")], cursor(1))
    expect(mergeIncoming(snapshot, [], cursor(1))).toBe(snapshot)
  })
})

describe("conversations", () => {
  it("groups by peer, newest first, counting unread", () => {
    const snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "from alice", ALICE), envelope(2, "from bob", BOB)],
      cursor(2),
    )
    const list = conversations(snapshot)
    expect(list).toHaveLength(2)
    expect(list[0].last.body).toBe("from bob")
    expect(list[0].unread).toBe(1)
  })

  it("threads filter to a single peer", () => {
    const snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "one", ALICE), envelope(2, "two", BOB)],
      cursor(2),
    )
    expect(threadWith(snapshot, ALICE)).toHaveLength(1)
  })
})
