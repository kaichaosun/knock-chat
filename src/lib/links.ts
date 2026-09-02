/**
 * A web address inside a message.
 *
 * Recognised in the text rather than carried beside it, for the same reason a
 * mention is — see `lib/mentions`. A message is a string; every client that has
 * ever run can read one, and a link that degrades to the address as typed is
 * still the whole link.
 *
 * Nothing here is fetched and nothing about the page on the other end is known.
 * This module answers two questions — whether a run of characters is a link,
 * and where it stops — and goes no further.
 *
 * ## The scheme has to be written out
 *
 * `https://nimiq.com` is a link. `nimiq.com` is not. Telling a host from an
 * ordinary word without a scheme means keeping a list of every suffix in the
 * world, and without that list `index.html`, `e.g.` and a version number all
 * become links. Requiring the scheme makes a link something somebody meant to
 * send rather than something a pattern went looking for.
 *
 * ## What is drawn is what was typed
 *
 * The text of a link is never rewritten. It is the characters that were sent,
 * so nothing can be dressed up as somewhere it does not go — the label and the
 * destination are the same string. `href` is that string parsed, and differs
 * only in the ways parsing differs: a host lower-cased, a bare host given its
 * `/`.
 *
 * One gap this leaves open: a host written in another script reads as the Latin
 * one it resembles. `аpple.com` with a Cyrillic а is a different host from the
 * one it looks like, and nothing here says so.
 */

/**
 * How a link is written, as a pattern rather than a regex so it can be built
 * into a larger one — the scan that finds links finds mentions in the same
 * pass.
 *
 * The scheme is spelled a letter at a time because that scan cannot carry an
 * `i` flag: it shares its regex with an address, whose alphabet is upper case
 * by definition, and a case-blind scan would start reading lower-case runs as
 * people. Phone keyboards capitalise the first letter of a message, so `Https`
 * is something that genuinely arrives.
 *
 * Everything up to whitespace is taken, with `<` and `>` left out so a link
 * written inside angle brackets does not swallow the closing one. Where it
 * really ends is [`linkFrom`]'s question.
 */
export const LINK_PATTERN = "[Hh][Tt][Tt][Pp][Ss]?://[^\\s<>]+"

/** A link, as it was written and as it will be followed. */
export type Link = {
  /** Exactly the characters that were typed. What gets drawn. */
  text: string
  /** Those characters parsed. What a tap follows. */
  href: string
}

/** Brackets a link may legitimately close, so one written inside it survives. */
const PAIRS: Record<string, string | undefined> = { ")": "(", "]": "[", "}": "{" }

/** Marks that end a sentence rather than an address. */
const PUNCTUATION = ".,;:!?'\"“”‘’«»"

/**
 * Where a link ends, and whether it is one at all.
 *
 * A greedy match runs to the next space, which is usually one character too
 * far: people put links in sentences, and a sentence ends in something. That
 * something is given back to the prose here.
 *
 * `null` for anything that does not parse, or that parses as a scheme this
 * will not open. The pattern above cannot produce one — but this is also the
 * gate for whatever else calls it, and `javascript:` is the reason it is a list
 * of two rather than a check for something absent.
 */
export function linkFrom(raw: string): Link | null {
  const text = shortened(raw)
  if (!text) return null

  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null

  return { text, href: parsed.href }
}

/** Hand back whatever belongs to the sentence rather than to the link. */
function shortened(raw: string): string {
  let text = raw
  while (text) {
    const last = text[text.length - 1]
    const opener = PAIRS[last]
    if (opener) {
      // A closing bracket belongs to the link only where the link opened one.
      // `…/Foo_(bar)` keeps its bracket; `(https://example.com)` gives it back.
      if (times(text, last) <= times(text, opener)) break
    } else if (!PUNCTUATION.includes(last)) {
      break
    }
    text = text.slice(0, -1)
  }
  return text
}

function times(text: string, character: string): number {
  let found = 0
  for (const each of text) if (each === character) found += 1
  return found
}
