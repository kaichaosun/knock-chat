import { describe, expect, it } from "vitest"

import { UPLOAD_SIDE, cropBox, hasAlpha } from "./picture"

describe("cropBox", () => {
  it("takes the centre square out of a landscape picture", () => {
    // 1000×600 → the middle 600, starting 200 in.
    expect(cropBox(1000, 600)).toEqual({ sx: 200, sy: 0, side: 600, target: UPLOAD_SIDE })
  })

  it("takes the centre square out of a portrait picture", () => {
    expect(cropBox(600, 1000)).toEqual({ sx: 0, sy: 200, side: 600, target: UPLOAD_SIDE })
  })

  it("leaves a square picture alone", () => {
    expect(cropBox(800, 800)).toMatchObject({ sx: 0, sy: 0, side: 800 })
  })

  it("never scales a small picture up", () => {
    // The relay would only scale it back down, so the extra bytes buy nothing.
    expect(cropBox(200, 300).target).toBe(200)
    expect(cropBox(120, 120).target).toBe(120)
  })

  it("stops at the ceiling for anything larger", () => {
    expect(cropBox(4032, 3024).target).toBe(UPLOAD_SIDE)
  })

  it("lands on whole pixels when the odd one out cannot be split", () => {
    // 101 wide, 100 tall: the leftover column has to go somewhere, and half a
    // pixel of source rectangle makes the browser resample for nothing.
    const box = cropBox(101, 100)
    expect(Number.isInteger(box.sx)).toBe(true)
    expect(Number.isInteger(box.sy)).toBe(true)
    expect(box).toMatchObject({ sx: 0, sy: 0, side: 100 })
  })
})

describe("hasAlpha", () => {
  /** `count` RGBA pixels, every one fully opaque. */
  const opaque = (count: number) => new Uint8ClampedArray(count * 4).fill(255)

  it("says no when every pixel is opaque", () => {
    expect(hasAlpha(opaque(64))).toBe(false)
  })

  it("says yes for a single see-through pixel anywhere", () => {
    // A photograph exported as a PNG is opaque and must not pay PNG's price;
    // one transparent pixel is what makes the format worth it.
    for (const at of [0, 17, 63]) {
      const pixels = opaque(64)
      pixels[at * 4 + 3] = 0
      expect(hasAlpha(pixels)).toBe(true)
    }
  })

  it("looks at alpha rather than at colour", () => {
    // Black, fully opaque: dark is not the same question as see-through.
    const pixels = new Uint8ClampedArray(4 * 4)
    for (let at = 3; at < pixels.length; at += 4) pixels[at] = 255
    expect(hasAlpha(pixels)).toBe(false)
  })

  it("treats partial transparency as transparency", () => {
    const pixels = opaque(4)
    pixels[7] = 128
    expect(hasAlpha(pixels)).toBe(true)
  })
})
