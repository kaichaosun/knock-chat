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
 */

import { ADDRESS_PATTERN, addressFrom, compact } from "./address"

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

/** How a mention is written into a message body. */
export function mentionOf(address: string): string {
  return `@${compact(address).toUpperCase()}`
}

/**
 * Split a message into runs of text and the people it names.
 *
 * Never throws and never drops anything: a run that looks like a mention but is
 * not one stays in the text exactly as it was written, so what is drawn always
 * adds up to what was said.
 */
export function segments(text: string): Segment[] {
  const out: Segment[] = []
  // Built per call rather than shared: a `g` regex carries `lastIndex` between
  // uses, and this is called from render.
  const scan = new RegExp(MENTION, "g")
  let at = 0
  let found: RegExpExecArray | null

  while ((found = scan.exec(text)) !== null) {
    // The shape is not enough. The checksum is what separates an address from
    // 32 characters that happen to be in the alphabet, and without it any long
    // base32 id somebody pasted behind an `@` would draw as a person.
    const address = addressFrom(found[1])
    if (!address) continue
    if (found.index > at) out.push({ kind: "text", text: text.slice(at, found.index) })
    out.push({ kind: "mention", address })
    at = found.index + found[0].length
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
