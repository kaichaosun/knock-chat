/**
 * Turning your address into something shareable.
 *
 * The twin of [`groupLink`], and the same shape for the same reason: a link
 * that opens the app pointed at somebody, so a code held up to a camera or a
 * link sent in another app both end up in one place. Reading it back is
 * `readCode`, which is forgiving about how it arrived.
 */

import { compact } from "./address"

/** A link that knocks on this door. */
export function peerLink(address: string): string {
  const url = new URL(window.location.href)
  url.search = `?knock=${compact(address)}`
  url.hash = ""
  return url.toString()
}
