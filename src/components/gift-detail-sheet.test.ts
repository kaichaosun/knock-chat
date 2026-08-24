import { describe, expect, it } from "vitest"

import { sinceOpened } from "./gift-detail-sheet"

const opened = "2026-08-25T10:00:00.000Z"
const after = (ms: number) => new Date(Date.parse(opened) + ms).toISOString()

describe("sinceOpened", () => {
  it("keeps a tenth of a second while the race is close", () => {
    // The whole point of a random split is who got there first, and at this
    // range whole seconds would show everybody tying.
    expect(sinceOpened(opened, after(400))).toBe("0.4s")
    expect(sinceOpened(opened, after(1_200))).toBe("1.2s")
  })

  it("drops the decimal once it stops being a race", () => {
    expect(sinceOpened(opened, after(12_000))).toBe("12s")
    expect(sinceOpened(opened, after(90_000))).toBe("2m")
    expect(sinceOpened(opened, after(2 * 3_600_000))).toBe("2h")
  })

  it("says nothing rather than something wrong", () => {
    // Clocks disagree: the relay stamps both times, but a claim that reads as
    // earlier than the gift would print a negative and look like a bug.
    expect(sinceOpened(opened, after(-5_000))).toBe("")
    expect(sinceOpened("not a date", opened)).toBe("")
  })
})
