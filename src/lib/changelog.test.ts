import { describe, expect, it } from "vitest"

import { en } from "@/i18n/en"
import { zh } from "@/i18n/zh"

import { LATEST, RELEASES, unseen } from "./changelog"

/** Follow a dotted key into a dictionary, or `undefined` if it goes nowhere. */
function at(dictionary: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (held, step) =>
        held && typeof held === "object" ? (held as Record<string, unknown>)[step] : undefined,
      dictionary,
    )
}

describe("unseen", () => {
  it("has something to show a device that has never looked", () => {
    // Which is every device the first time, a new one included.
    expect(unseen("")).toBe(true)
  })

  it("has nothing more to show once the newest has been read", () => {
    expect(unseen(LATEST ?? "")).toBe(false)
  })

  it("shows a device that stopped reading part way", () => {
    expect(unseen("2000-01-01")).toBe(true)
  })

  it("leaves alone a device that has read past this build", () => {
    // An older build installed over a newer one. Comparing by sort order rather
    // than equality is what keeps it from re-announcing something already read.
    expect(unseen("9999-01-01")).toBe(false)
  })
})

describe("RELEASES", () => {
  it("is newest first, which is the order it is read in", () => {
    const ids = RELEASES.map((release) => release.id)
    expect([...ids].sort().reverse()).toEqual(ids)
  })

  it("gives every release a sortable id, since that is what `seen` compares", () => {
    for (const release of RELEASES) {
      expect(release.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it("names every release with an id nothing else uses", () => {
    const ids = RELEASES.map((release) => release.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("dates every release as something a calendar recognises", () => {
    for (const release of RELEASES) {
      expect(Number.isNaN(new Date(release.date).getTime())).toBe(false)
    }
  })

  it("says something in every release", () => {
    for (const release of RELEASES) {
      expect(release.items.length).toBeGreaterThan(0)
    }
  })
})

/**
 * Every entry is a translation key, and i18next answers a missing one with the
 * key itself rather than an error — so a typo here ships as a release note
 * reading "changelog.discover". That has already happened once in this app,
 * with `joinGroup.runBy`, and nothing caught it but reading the screen.
 */
describe("every release note", () => {
  const keys = RELEASES.flatMap((release) => release.items)

  it.each(keys)("says something in English: %s", (key) => {
    expect(typeof at(en, key)).toBe("string")
  })

  it.each(keys)("says something in Chinese: %s", (key) => {
    expect(typeof at(zh, key)).toBe("string")
  })
})
