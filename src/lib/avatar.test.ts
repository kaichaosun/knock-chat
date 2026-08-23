import { describe, expect, it } from "vitest"

import { avatarUri } from "./avatar"
import { compact, formatAddress } from "./address"

const ADDRESS = "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY"

describe("avatarUri", () => {
  it("is the same picture however the address is written", () => {
    // The app holds addresses grouped in some places and compact in others; the
    // same contact must not change face on the way between screens.
    const grouped = avatarUri(formatAddress(ADDRESS))
    expect(avatarUri(compact(ADDRESS))).toBe(grouped)
    expect(avatarUri(ADDRESS.toLowerCase())).toBe(grouped)
  })

  it("gives different addresses different pictures", () => {
    const other = "NQ75 248H 7RGK 4V8V 84HS PSA3 QYE8 EA1T 7HYT"
    expect(avatarUri(other)).not.toBe(avatarUri(ADDRESS))
  })

  it("is a renderable svg data uri", () => {
    expect(avatarUri(ADDRESS)).toMatch(/^data:image\/svg\+xml;base64,/)
  })
})
