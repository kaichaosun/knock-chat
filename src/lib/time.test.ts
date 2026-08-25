import { describe, expect, it } from "vitest"

import { clockTime, dayLabel, relativeTime, sameMinute } from "./time"

/** A local wall-clock time, as the ISO string a message carries. */
const at = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0) =>
  new Date(year, month, day, hour, minute, second).toISOString()

describe("dayLabel", () => {
  const now = new Date(2026, 0, 18, 9, 0).getTime()

  it("names today and yesterday", () => {
    expect(dayLabel(at(2026, 0, 18, 1, 30), now)).toBe("Today")
    expect(dayLabel(at(2026, 0, 17, 23, 59), now)).toBe("Yesterday")
  })

  it("counts calendar days, not elapsed hours", () => {
    // Ten minutes ago, over midnight, is yesterday — not today.
    expect(dayLabel(at(2026, 0, 17, 23, 55), new Date(2026, 0, 18, 0, 5).getTime())).toBe(
      "Yesterday",
    )
  })

  it("dates anything older instead of naming its weekday", () => {
    const label = dayLabel(at(2026, 0, 15, 9, 0), now)
    expect(label).toContain("15")
    expect(label).not.toBe(new Date(2026, 0, 15).toLocaleDateString(undefined, { weekday: "long" }))
  })

  it("adds the year once it stops being obvious", () => {
    expect(dayLabel(at(2025, 11, 30, 9, 0), now)).toContain("2025")
    expect(dayLabel(at(2026, 0, 2, 9, 0), now)).not.toContain("2026")
  })

  it("says nothing about a time it cannot read", () => {
    expect(dayLabel("not a date", now)).toBe("")
  })
})

describe("sameMinute", () => {
  it("holds within one minute", () => {
    expect(sameMinute(at(2026, 0, 18, 9, 44, 1), at(2026, 0, 18, 9, 44, 59))).toBe(true)
  })

  it("breaks over the boundary, however close the two are", () => {
    expect(sameMinute(at(2026, 0, 18, 9, 44, 59), at(2026, 0, 18, 9, 45, 0))).toBe(false)
  })

  it("is false when either time cannot be read", () => {
    expect(sameMinute("not a date", at(2026, 0, 18, 9, 44))).toBe(false)
  })
})

describe("the narrow times in a list row", () => {
  const now = new Date(2026, 0, 18, 9, 0).getTime()

  it("still name the weekday, where a row has no space for a date", () => {
    expect(relativeTime(at(2026, 0, 15, 9, 0), now)).toBe(
      new Date(2026, 0, 15).toLocaleDateString(undefined, { weekday: "short" }),
    )
  })

  it("read as elapsed time while that is still short", () => {
    expect(relativeTime(at(2026, 0, 18, 8, 58), now)).toBe("2m")
  })

  it("say nothing about a time they cannot read", () => {
    expect(relativeTime("not a date", now)).toBe("")
    expect(clockTime("not a date")).toBe("")
  })
})
