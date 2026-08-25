/**
 * Avatars.
 *
 * Every address gets its Nimiq identicon — the same face the Nimiq Wallet and
 * Nimiq Pay draw for that address, so a contact here is recognizable as the same
 * person there. Nobody uploads a picture and nobody can pick one: the icon is a
 * function of the address, which is the only identity Knock has.
 */

import { createIdenticonCache, createIdenticonCached } from "identicons-esm/cache"

import { formatAddress } from "./address"

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
