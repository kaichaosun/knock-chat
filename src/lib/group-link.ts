/**
 * Turning a room into something shareable, and back.
 *
 * A link is the only way into a group, so reading one has to be forgiving.
 * People paste what they have: the whole URL, a URL that picked up a fragment
 * on the way, or just the id someone read out. All three mean the same room,
 * and refusing two of them would be pedantry standing between somebody and the
 * thing they were sent.
 *
 * Worth being forgiving for a second reason: whether Nimiq Pay preserves a
 * query string through `nimpay.app/miniapps/open/…` is still unanswered, so
 * pasting an id may be the only way in on a real device.
 */

/** A room's id is a uuid, wherever it turns up. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** A link that opens this room in the app. */
export function groupLink(id: string): string {
  const url = new URL(window.location.href)
  url.search = `?group=${id}`
  url.hash = ""
  return url.toString()
}

/**
 * Pull a room's id out of whatever was pasted, or `null` if there isn't one.
 *
 * Matched rather than parsed: a link may arrive wrapped in a chat app's own
 * redirect, trailed by punctuation, or with the app's path rearranged by the
 * host. The id is the part that survives all of that, and it is specific enough
 * that finding one anywhere in the text is not a guess.
 */
export function groupIdFrom(text: string): string | null {
  const found = text.trim().match(UUID)
  return found ? found[0].toLowerCase() : null
}
