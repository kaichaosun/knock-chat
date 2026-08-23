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
 * conversation, the contact list — so an LRU makes all but the first free. Small
 * on purpose: each entry is an ~8 KB data URI, and a phone holds few contacts.
 */
const cache = createIdenticonCache(32)

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
