/**
 * Pointing at somebody inside a message.
 *
 * A mention is an address. It is *drawn* as a name, because a name is what a
 * reader recognises, but a name is never who anybody is — see `lib/names`. Two
 * members can pick the same one, the relay does not check that anybody is who
 * they say, and the name on your screen may be one you wrote down yourself that
 * nobody else has. A mention carrying a name would arrive at whoever answered
 * to that name at reading time, which is a different person the moment somebody
 * renames themselves to match.
 *
 * So the address travels in the text — `@NQ97…` — and the name is put back on
 * at the moment of drawing, out of the reader's own directory. Two things
 * follow, and both are the point:
 *
 * - Nothing has to be resolved, fetched or trusted to draw a mention. The
 *   message already says who it means, and says it the same way to everyone.
 * - Two people called the same thing are still two mentions.
 *
 * ## Why this rides in the text
 *
 * It could have been a `payload` frame with a list of addresses beside the
 * words. But a frame this build does not recognise decodes to `unknown`, so an
 * ordinary sentence would become "something it can't display" on a phone that
 * hasn't updated, for the sake of an `@`. In the text it degrades to the
 * address itself — which is exactly what every screen here already shows for
 * somebody who has no name.
 *
 * ## Links come through the same door
 *
 * Breaking a message into its parts is one job, so `lib/links` says what a link
 * is and this splits the message using it. Both are found in a single pass —
 * see [`SCAN`].
 */

import { ADDRESS_PATTERN, addressFrom, compact } from "./address"
import { LINK_PATTERN, linkFrom } from "./links"

/**
 * `\b` closes the match so that a longer run of base32 is not read as an
 * address with something stuck to it. Every character of the alphabet is a word
 * character, so the boundary can only fall where the address really ends.
 */
const MENTION = `@(${ADDRESS_PATTERN})\\b`

/** A message broken into the parts that are drawn differently. */
export type Segment =
  | { kind: "text"; text: string }
  | { kind: "mention"; address: string }
  /** Somewhere the message points. See `lib/links`. */
  | { kind: "link"; text: string; href: string }

/** How a mention is written into a message body. */
export function mentionOf(address: string): string {
  return `@${compact(address).toUpperCase()}`
}

/**
 * Both, in one pass.
 *
 * They are found together rather than one after the other because a message is
 * a single line of characters and every part of it belongs to one thing:
 * whatever starts first wins, so an address written inside a URL stays part of
 * the URL instead of being lifted out of the middle of it as a person.
 */
const SCAN = `(?:${MENTION})|(${LINK_PATTERN})`

/**
 * Split a message into runs of text, the people it names, and where it points.
 *
 * Never throws and never drops anything: a run that looks like a mention or a
 * link but is not one stays in the text exactly as it was written, so what is
 * drawn always adds up to what was said.
 */
export function segments(text: string): Segment[] {
  const out: Segment[] = []
  // Built per call rather than shared: a `g` regex carries `lastIndex` between
  // uses, and this is called from render.
  const scan = new RegExp(SCAN, "g")
  let at = 0
  let found: RegExpExecArray | null

  while ((found = scan.exec(text)) !== null) {
    const [whole, mentioned, linked] = found
    // The shape is not enough. The checksum is what separates an address from
    // 32 characters that happen to be in the alphabet, and without it any long
    // base32 id somebody pasted behind an `@` would draw as a person.
    const address = mentioned ? addressFrom(mentioned) : null
    const link = linked ? linkFrom(linked) : null
    if (!address && !link) continue

    if (found.index > at) out.push({ kind: "text", text: text.slice(at, found.index) })
    if (address) {
      out.push({ kind: "mention", address })
      at = found.index + whole.length
    } else if (link) {
      out.push({ kind: "link", ...link })
      // Not how far the regex got. A link is nearly always matched one
      // character too long, because people end sentences, and what it handed
      // back is picked up as text on the way round.
      at = found.index + link.text.length
    }
  }

  if (at < text.length) out.push({ kind: "text", text: text.slice(at) })
  return out
}

/**
 * Whether two addresses are the same person, however each of them is spelled.
 *
 * Addresses reach the app grouped, compact and occasionally lower-case, and all
 * of those are the same address. Comparing the strings would make one person
 * into several.
 */
export function sameAddress(one: string, other: string): boolean {
  return compact(one).toUpperCase() === compact(other).toUpperCase()
}
