import { describe, expect, it, vi } from "vitest"

import {
  carriesTime,
  conversations,
  deleteThread,
  emptySnapshot,
  markRead,
  mergeIncoming,
  opensTurn,
  recordOutgoing,
  resend,
  setStatus,
  threadWith,
  withRooms,
} from "./messages"
import type { Message, Snapshot } from "./messages"
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

const ROOM = "3f1c0b7a-0000-4000-8000-000000000001"

/** An envelope that came from a room rather than from a person. */
function roomEnvelope(seq: number, body: string, from = ALICE): Envelope {
  return { ...envelope(seq, body, from), group_id: ROOM }
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
    expect(list[0].last?.body).toBe("from bob")
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
    conversations(snapshot).find((c) => c.key.replace(/\s+/g, "") === peer.replace(/\s+/g, ""))
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

  it("leaves other threads alone, and notes the one dismissed", () => {
    // "No messages" stopped meaning "no row" when rooms joined the list: a room
    // you are in is a place whether or not anyone has spoken. So deleting is
    // recorded even when there was nothing to delete.
    const snapshot = mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1))
    const after = deleteThread(snapshot, BOB)
    expect(after.messages).toEqual(snapshot.messages)
    expect(after.dismissed[BOB.replace(/\s+/g, "")]).toBe(true)
  })

  it("stays put when the same thread is deleted twice", () => {
    const snapshot = deleteThread(
      mergeIncoming(emptySnapshot(), [envelope(1, "hi", ALICE)], cursor(1)),
      BOB,
    )
    expect(deleteThread(snapshot, BOB)).toBe(snapshot)
  })
})

describe("a room whose chat was deleted", () => {
  const room = { id: ROOM, created_at: new Date(2026, 0, 1, 9, 0).toISOString() }
  const dismissedRoom = () =>
    deleteThread(mergeIncoming(emptySnapshot(), [roomEnvelope(1, "hello")], cursor(1)), ROOM)

  it("goes from the list instead of coming straight back empty", () => {
    // The bug: with the messages gone the room was rebuilt from membership and
    // reappeared, so deleting the chat looked like it had done nothing.
    const snapshot = dismissedRoom()
    expect(threadWith(snapshot, ROOM)).toHaveLength(0)
    expect(withRooms(conversations(snapshot), [room], snapshot.dismissed)).toHaveLength(0)
  })

  it("comes back when somebody says something", () => {
    const snapshot = mergeIncoming(dismissedRoom(), [roomEnvelope(2, "still here")], cursor(2))
    const list = withRooms(conversations(snapshot), [room], snapshot.dismissed)
    expect(list).toHaveLength(1)
    expect(list[0].last?.body).toBe("still here")
  })

  it("comes back when you say something in it yourself", () => {
    const snapshot = recordOutgoing(dismissedRoom(), ALICE, "hello again", "local:1", ROOM)
    expect(withRooms(conversations(snapshot), [room], snapshot.dismissed)).toHaveLength(1)
  })

  it("is hidden even when nothing was ever said in it", () => {
    // A room made and then deleted from Chats without a word in it.
    const snapshot = deleteThread(emptySnapshot(), ROOM)
    expect(withRooms(conversations(snapshot), [room], snapshot.dismissed)).toHaveLength(0)
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

describe("resend", () => {
  /** The bug this fixes: a retried message kept its original time and so sorted
   *  back among messages written long after it. */
  it("moves a retried message to the end of the thread", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"))
    let snapshot = emptySnapshot()
    snapshot = recordOutgoing(snapshot, ALICE, "first", "local:1")
    snapshot = setStatus(snapshot, "local:1", "failed")
    vi.setSystemTime(new Date("2026-01-01T12:01:00.000Z"))
    snapshot = recordOutgoing(snapshot, ALICE, "second", "local:2")
    vi.setSystemTime(new Date("2026-01-01T12:02:00.000Z"))
    snapshot = recordOutgoing(snapshot, ALICE, "third", "local:3")

    expect(threadWith(snapshot, ALICE).map((m) => m.body)).toEqual([
      "first",
      "second",
      "third",
    ])

    vi.setSystemTime(new Date("2026-01-01T12:03:00.000Z"))
    snapshot = resend(snapshot, "local:1")
    vi.useRealTimers()

    expect(threadWith(snapshot, ALICE).map((m) => m.body)).toEqual([
      "second",
      "third",
      "first",
    ])
  })

  it("marks it as on its way and restamps it to now", () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"))
      let snapshot = recordOutgoing(emptySnapshot(), ALICE, "hello", "local:1")
      snapshot = setStatus(snapshot, "local:1", "blocked")
      expect(threadWith(snapshot, ALICE)[0].at).toBe("2026-01-01T12:00:00.000Z")

      vi.setSystemTime(new Date("2026-01-01T12:05:00.000Z"))
      snapshot = resend(snapshot, "local:1")
      const message = threadWith(snapshot, ALICE)[0]

      expect(message.status).toBe("sending")
      expect(message.at).toBe("2026-01-01T12:05:00.000Z")
    } finally {
      vi.useRealTimers()
    }
  })

  it("leaves every other message alone", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T12:00:00.000Z"))
    let snapshot = recordOutgoing(emptySnapshot(), ALICE, "keep", "local:1")
    vi.setSystemTime(new Date("2026-01-01T12:01:00.000Z"))
    snapshot = recordOutgoing(snapshot, ALICE, "retry me", "local:2")
    const untouched = threadWith(snapshot, ALICE)[0]

    vi.setSystemTime(new Date("2026-01-01T12:02:00.000Z"))
    snapshot = resend(snapshot, "local:2")
    vi.useRealTimers()
    const after = threadWith(snapshot, ALICE)[0]

    expect(after.at).toBe(untouched.at)
    expect(after.status).toBe(untouched.status)
  })

  it("is a no-op when the id is not there", () => {
    const snapshot = recordOutgoing(emptySnapshot(), ALICE, "hello", "local:1")
    expect(threadWith(resend(snapshot, "local:missing"), ALICE)).toEqual(
      threadWith(snapshot, ALICE),
    )
  })
})

describe("rooms are threads of their own", () => {
  it("files a room message under the room, not under whoever spoke", () => {
    const snapshot = mergeIncoming(
      emptySnapshot(),
      [roomEnvelope(1, "hello room")],
      cursor(1),
    )
    expect(threadWith(snapshot, ROOM)).toHaveLength(1)
    // Speaking in a room is not the same as writing to somebody.
    expect(threadWith(snapshot, ALICE)).toHaveLength(0)
  })

  it("gathers everyone who spoke into one thread", () => {
    const snapshot = mergeIncoming(
      emptySnapshot(),
      [roomEnvelope(1, "from alice", ALICE), roomEnvelope(2, "from bob", BOB)],
      cursor(2),
    )
    expect(threadWith(snapshot, ROOM)).toHaveLength(2)
    expect(conversations(snapshot)).toHaveLength(1)
  })

  it("keeps a room and a direct chat with the same person apart", () => {
    const snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "just you"), roomEnvelope(2, "everyone")],
      cursor(2),
    )
    const threads = conversations(snapshot)
    expect(threads).toHaveLength(2)

    const room = threads.find((c) => c.group === ROOM)
    expect(room?.peer).toBeNull()
    const direct = threads.find((c) => c.group === null)
    expect(direct?.peer).toBe(ALICE.replace(/\s+/g, ""))
  })

  it("counts and clears a room's unread on its own", () => {
    let snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "just you"), roomEnvelope(2, "everyone")],
      cursor(2),
    )
    const unread = (key: string) =>
      conversations(snapshot).find((c) => c.key === key)?.unread ?? 0

    expect(unread(ROOM)).toBe(1)
    snapshot = markRead(snapshot, ROOM)
    expect(unread(ROOM)).toBe(0)
    // Reading the room says nothing about the direct chat.
    expect(unread(ALICE.replace(/\s+/g, ""))).toBe(1)
  })

  it("keeps your own words in the room you said them in", () => {
    const snapshot = recordOutgoing(emptySnapshot(), BOB, "mine", "local:1", ROOM)
    expect(threadWith(snapshot, ROOM)).toHaveLength(1)
    expect(threadWith(snapshot, BOB)).toHaveLength(0)
  })

  it("deletes a room thread without touching a direct one", () => {
    let snapshot = mergeIncoming(
      emptySnapshot(),
      [envelope(1, "just you"), roomEnvelope(2, "everyone")],
      cursor(2),
    )
    snapshot = deleteThread(snapshot, ROOM)
    expect(threadWith(snapshot, ROOM)).toHaveLength(0)
    expect(threadWith(snapshot, ALICE)).toHaveLength(1)
  })
})

describe("a room with nothing said in it", () => {
  const room = { id: ROOM, created_at: new Date(2026, 0, 1, 9, 0).toISOString() }

  it("still shows up, because you made it or paid to be in it", () => {
    // The bug this fixes: a thread existed only because a message existed, so
    // creating a group and going back made it vanish.
    const list = withRooms(conversations(emptySnapshot()), [room])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ key: ROOM, group: ROOM, peer: null, last: null, unread: 0 })
  })

  it("is not added twice once somebody speaks", () => {
    const snapshot = mergeIncoming(emptySnapshot(), [roomEnvelope(1, "hello")], cursor(1))
    const list = withRooms(conversations(snapshot), [room])
    expect(list).toHaveLength(1)
    expect(list[0].last?.body).toBe("hello")
  })

  it("sorts by when it was made, among threads sorted by when they last stirred", () => {
    // Older than the message below, so it belongs underneath it.
    const snapshot = mergeIncoming(emptySnapshot(), [envelope(5, "later")], cursor(5))
    const list = withRooms(conversations(snapshot), [room])
    expect(list.map((c) => c.key)).toEqual([ALICE.replace(/\s+/g, ""), ROOM])
  })

  it("leaves the list alone when there is nothing to add", () => {
    const existing = conversations(mergeIncoming(emptySnapshot(), [envelope(1, "hi")], cursor(1)))
    expect(withRooms(existing, [])).toBe(existing)
  })
})

/** A message at a wall-clock time, written as `hh:mm:ss`. */
function said(at: string, from: string | null = ALICE): Message {
  const [h, m, sec] = at.split(":").map(Number)
  return {
    id: `m-${at}-${from ?? "me"}`,
    peer: from ?? BOB,
    direction: from ? "in" : "out",
    body: "hi",
    at: new Date(2026, 0, 1, h, m, sec ?? 0).toISOString(),
    status: "sent",
  }
}

describe("turns", () => {
  it("open on the first thing said", () => {
    expect(opensTurn(undefined, said("12:00"))).toBe(true)
  })

  it("stay open while the same person keeps talking", () => {
    expect(opensTurn(said("12:00"), said("12:01"))).toBe(false)
  })

  it("open again when somebody else speaks", () => {
    expect(opensTurn(said("12:00", ALICE), said("12:01", BOB))).toBe(true)
  })

  it("open again when your own message comes between", () => {
    expect(opensTurn(said("12:00", null), said("12:01", ALICE))).toBe(true)
  })

  it("close after a gap, so a face comes back rather than going missing", () => {
    expect(opensTurn(said("12:00"), said("12:06"))).toBe(true)
  })
})

describe("the time on a bubble", () => {
  it("is shown on the last message of a thread", () => {
    expect(carriesTime(said("12:00"), undefined)).toBe(true)
  })

  it("is left off a message another follows in the same minute", () => {
    expect(carriesTime(said("12:00:05"), said("12:00:40"))).toBe(false)
  })

  it("is shown once the minute turns over", () => {
    expect(carriesTime(said("12:00:59"), said("12:01:01"))).toBe(true)
  })

  it("is shown when the next message is somebody else's", () => {
    // Two people in the same minute are two stamps: the run is theirs, not the
    // minute's.
    expect(carriesTime(said("12:00:05", ALICE), said("12:00:40", BOB))).toBe(true)
  })

  it("is shown when the reply is yours", () => {
    expect(carriesTime(said("12:00:05", ALICE), said("12:00:40", null))).toBe(true)
  })
})
