import { describe, expect, it } from "vitest"

import {
  conversations,
  deleteThread,
  emptySnapshot,
  markRead,
  mergeIncoming,
  recordOutgoing,
  threadWith,
} from "./messages"
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

describe("markRead", () => {
  const unreadFor = (snapshot: Snapshot, peer: string) =>
    conversations(snapshot).find((c) => c.peer.replace(/\s+/g, "") === peer.replace(/\s+/g, ""))
      ?.unread ?? 0

  it("clears the badge for that thread only", () => {
    let snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "hi", ALICE), envelope(2, "hey", BOB)],
      cursor(2),
    )
    snapshot = markRead(snapshot, ALICE)
    expect(unreadFor(snapshot, ALICE)).toBe(0)
    expect(unreadFor(snapshot, BOB)).toBe(1)
  })

  /**
   * The bug this replaced: reading a thread, then having a message arrive while
   * still looking at it, left the badge showing when you went back.
   */
  it("a message arriving after reading is unread again until re-read", () => {
    let snapshot = mergeIncoming(emptySnapshot(), [envelope(1, "first", ALICE)], cursor(1))
    snapshot = markRead(snapshot, ALICE)
    expect(unreadFor(snapshot, ALICE)).toBe(0)

    snapshot = mergeIncoming(snapshot, [envelope(2, "second", ALICE, "id-2b")], cursor(2))
    expect(unreadFor(snapshot, ALICE)).toBe(1)

    snapshot = markRead(snapshot, ALICE)
    expect(unreadFor(snapshot, ALICE)).toBe(0)
  })

  /** Idempotent, so an open thread can re-run it on every render for free. */
  it("returns the same snapshot when nothing changed", () => {
    const snapshot = markRead(
      mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1)),
      ALICE,
    )
    expect(markRead(snapshot, ALICE)).toBe(snapshot)
  })

  /** Counting incoming messages means the device clock never enters into it. */
  it("ignores your own messages and does not consult a clock", () => {
    const snapshot = markRead(
      mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1)),
      ALICE,
    )
    // An envelope timestamped far in the past still counts as new.
    const backdated = { ...envelope(2, "late arrival", ALICE, "id-old"), created_at: new Date(2000, 0, 1).toISOString() }
    expect(unreadFor(mergeIncoming(snapshot, [backdated], cursor(2)), ALICE)).toBe(1)
  })
})

describe("deleting a chat", () => {
  const listed = (snapshot: Snapshot) => conversations(snapshot).map((c) => c.peer)

  it("removes the thread and its messages", () => {
    let snapshot = mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1))
    snapshot = deleteThread(snapshot, ALICE)

    expect(listed(snapshot)).toHaveLength(0)
    expect(threadWith(snapshot, ALICE)).toHaveLength(0)
  })

  it("leaves other conversations alone", () => {
    const snapshot = deleteThread(
      mergeIncoming(
        emptySnapshot(),
        [envelope(1, "from alice", ALICE), envelope(2, "from bob", BOB)],
        cursor(2),
      ),
      ALICE,
    )
    expect(listed(snapshot)).toEqual([BOB.replace(/\s+/g, "")])
  })

  /**
   * The cursor must survive, or the next poll hands the same messages back and
   * resurrects what was just deleted.
   */
  it("keeps the cursor so the relay does not replay what was deleted", () => {
    const before = mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1))
    expect(deleteThread(before, ALICE).cursor).toBe(before.cursor)
  })

  it("does nothing when there is no such thread", () => {
    const snapshot = mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1))
    expect(deleteThread(snapshot, BOB)).toBe(snapshot)
  })
})

describe("recordOutgoing", () => {
  /** A knock never comes back through the poll, so the sender must record it. */
  it("puts the sender's own knock in their thread", () => {
    const snapshot = recordOutgoing(emptySnapshot(), ALICE, "let me in", "knock:abc")
    const thread = threadWith(snapshot, ALICE)

    expect(thread).toHaveLength(1)
    expect(thread[0].direction).toBe("out")
    expect(thread[0].body).toBe("let me in")
  })

  it("does not count as unread for the sender", () => {
    const snapshot = recordOutgoing(emptySnapshot(), ALICE, "let me in", "knock:abc")
    expect(conversations(snapshot)[0].unread).toBe(0)
  })
})
