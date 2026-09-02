import { describe, expect, it } from "vitest"

import { reopenedThread, threadInUrl, urlForThread } from "./thread-url"

/** The same vectors the rest of the app's tests use. */
const ALICE = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"
const ROOM = "9d23068a-287d-407d-ac4c-53f20451c5e2"

const APP = "https://knock.example/"

describe("threadInUrl", () => {
  it("reads a thread, and gives the address back spelled the way the app spells it", () => {
    expect(threadInUrl(`${APP}?chat=${ALICE.replace(/\s/g, "")}`)).toEqual({
      peer: ALICE,
      group: null,
    })
  })

  it("reads a room", () => {
    expect(threadInUrl(`${APP}?group=${ROOM}`)).toEqual({ peer: null, group: ROOM })
  })

  it("opens nothing rather than something wrong", () => {
    for (const search of [
      "",
      "?probe",
      // The alphabet is right and the checksum is not.
      "?chat=NQ11V68GX92J86C27P1EALS66CGG0V5EJLKY",
      "?chat=",
      "?chat=hello",
      "?group=not-a-room",
      "?group=",
    ]) {
      expect(threadInUrl(APP + search), search).toEqual({ peer: null, group: null })
    }
  })

  it("says nothing about something that is not an address bar at all", () => {
    expect(threadInUrl("not a url")).toEqual({ peer: null, group: null })
  })
})

describe("urlForThread", () => {
  it("writes a thread as one run, which is how an address travels", () => {
    expect(urlForThread(APP, { peer: ALICE, group: null })).toBe(
      `${APP}?chat=${ALICE.replace(/\s/g, "")}`,
    )
  })

  it("writes a room", () => {
    expect(urlForThread(APP, { peer: null, group: ROOM })).toBe(`${APP}?group=${ROOM}`)
  })

  it("reads back whatever it wrote", () => {
    for (const pointed of [
      { peer: ALICE, group: null },
      { peer: null, group: ROOM },
    ]) {
      expect(threadInUrl(urlForThread(APP, pointed))).toEqual(pointed)
    }
  })

  it("names one thing, never two", () => {
    const room = urlForThread(`${APP}?chat=${ALICE.replace(/\s/g, "")}`, {
      peer: null,
      group: ROOM,
    })
    expect(room).toBe(`${APP}?group=${ROOM}`)
    expect(threadInUrl(room).peer).toBeNull()
  })

  it("empties the address bar when nothing is open", () => {
    expect(urlForThread(`${APP}?group=${ROOM}`, { peer: null, group: null })).toBe(APP)
  })

  it("leaves alone what is none of its business", () => {
    // `?probe` is how the diagnostics screen is reached, and opening a thread
    // is not a way of closing it.
    const url = urlForThread(`${APP}?probe=1&group=${ROOM}`, { peer: ALICE, group: null })
    expect(new URL(url).searchParams.get("probe")).toBe("1")
    expect(new URL(url).searchParams.get("group")).toBeNull()
  })
})

describe("reopenedThread", () => {
  const CHAT = `${APP}?chat=${ALICE.replace(/\s/g, "")}`
  const ROOM_URL = `${APP}?group=${ROOM}`

  it("knows an entry the app pushed itself", () => {
    expect(reopenedThread({ thread: ROOM }, ROOM_URL)).toEqual({ peer: null, group: ROOM })
    expect(reopenedThread({ thread: ALICE }, CHAT)).toEqual({ peer: ALICE, group: null })
  })

  it("says nothing about a link somebody sent", () => {
    // The same URL, arrived at by navigation rather than by coming back. Whether
    // you are in the room is a real question, and this must not answer it.
    for (const state of [null, undefined, {}, { thread: null }, { thread: 42 }]) {
      expect(reopenedThread(state, ROOM_URL)).toEqual({ peer: null, group: null })
    }
  })

  it("will not let a mark speak for an address bar that moved on", () => {
    expect(reopenedThread({ thread: ROOM }, CHAT)).toEqual({ peer: null, group: null })
    expect(reopenedThread({ thread: ROOM }, APP)).toEqual({ peer: null, group: null })
  })
})
