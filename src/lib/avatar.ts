/**
 * Avatars.
 *
 * Every address has a Nimiq identicon — the same face the Nimiq Wallet and
 * Nimiq Pay draw for that address — and that is what is shown until somebody
 * says otherwise. It is a function of the address, so it cannot be borrowed,
 * cannot be wrong, and is there from the first moment an address is seen.
 *
 * On top of that an address may wear a picture it chose. The relay renders and
 * serves those; this module only decides which of the two to draw and where the
 * bytes are. See `lib/names` for how a picture reaches this device, and the
 * relay's `avatar.rs` for why nothing anyone uploaded is ever served back.
 *
 * The identicon is never replaced as *identity* — only as decoration. Every
 * surface that draws a chosen picture still shows the address it belongs to, and
 * a face that arrives unasked is drawn as the identicon until its owner has been
 * let in.
 */

import { createIdenticonCache, createIdenticonCached } from "identicons-esm/cache"

import { formatAddress } from "./address"
import { FACE_SIZES, faceUri, type FaceSize } from "./relay"

/**
 * The same address is drawn repeatedly — a row in the inbox, the header of its
 * conversation, the contact list — so an LRU makes all but the first free.
 *
 * Sized for the worst case rather than the common one: a room's mark is a
 * mosaic of up to four members, so a screen of rooms asks for several times as
 * many faces as it has rows. At roughly 8 KB a data URI this is about a
 * megabyte held at full stretch, which is cheaper than redrawing on every
 * scroll.
 */
const cache = createIdenticonCache(128)

/**
 * A `data:` URI of the identicon for `address`.
 *
 * Falls back to Nimiq's placeholder if the string is not an address, which is
 * the honest picture for one: an unknown face rather than a plausible one.
 */
export function avatarUri(address: string): string {
  // The generator normalizes to the grouped uppercase form before hashing, so
  // feeding it that form directly keeps one cache entry per address however the
  // caller happened to be holding it.
  return createIdenticonCached(formatAddress(address), { cache })
}

/** What an `<img>` needs to draw a chosen picture at whatever size it lands at. */
export type FaceSources = {
  /** The smallest rendition, for browsers that ignore `srcSet`. */
  src: string
  /** Every rendition with its width, so the browser picks by device pixels. */
  srcSet: string
}

/**
 * Where the renditions of `fingerprint` are.
 *
 * A `srcSet` rather than one URL chosen here, because the right size depends on
 * the device pixel ratio and that is the browser's to know: a 32px row is 96
 * real pixels on a phone and 32 on a monitor, and picking one of those in
 * advance either wastes bytes or draws something soft.
 *
 * Nothing here is fetched. The fingerprint is in the path, so the bytes at a URL
 * can never change and the browser's own cache is the right one to leave this
 * to — see the year of `immutable` the relay serves them with.
 */
export function faceSources(fingerprint: string): FaceSources {
  return {
    src: faceUri(fingerprint, FACE_SIZES[0]),
    srcSet: FACE_SIZES.map((size: FaceSize) => `${faceUri(fingerprint, size)} ${size}w`).join(", "),
  }
}
