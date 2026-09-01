/**
 * Answering one message with another.
 *
 * A reply is a quote line and then the words: the same shape mail and every
 * message board has used for decades, and readable as itself by anything that
 * has never heard of replies.
 *
 *     > Alice: are we still on for six
 *     yes, see you there
 *
 * ## Why not a payload frame
 *
 * Because a reply is mostly text, and a frame this build did not recognise
 * decodes to `unknown` — so on a phone that has not updated, every reply in the
 * room would read "Not supported in this version" instead of what somebody
 * actually said. That is a far worse trade than the one mentions make, where an
 * older build still shows the whole sentence and only an address in place of a
 * name.
 *
 * ## Both a snapshot and a reference
 *
 * Two independent things travel, and they do different jobs.
 *
 * The **snippet** is what the quote *says*. It is a snapshot, so it reads the
 * same whether or not the room has pulled back far enough to hold the original,
 * and whether or not the original still exists — which is worth knowing,
 * because it means deleting a message does not unsay it where somebody has
 * already quoted it. It never changes when the original is edited.
 *
 * The **id** is what the quote *points at*: [`QUOTE_ID_LEN`] characters of the
 * answered message's relay id, and the only thing consulted when a reply is
 * tapped. Nothing is ever matched by its text — the same words said twice, a
 * card whose one-line summary reads differently in another language, a mention
 * two devices know by different names: each of those is one message, and
 * guessing from the words gets it wrong quietly. An id is right or it is
 * absent, and absent is a thing that can be said out loud.
 *
 * A prefix rather than the whole id because the whole id is 36 characters of
 * noise to anything that cannot read it, and the point of living in the text is
 * that the text stays readable. A room would need billions of messages loaded
 * at once for two prefixes to collide.
 *
 * A quote can carry no id at all — a reply written before quotes had them, or
 * one answering a message the relay had not yet named. Such a quote is drawn
 * like any other and simply does not offer to go anywhere.
 *
 * ## What the author is
 *
 * A label, like the name on a shared contact, and specifically the name they
 * *publish*. Never the one you gave them: `lib/names` promises a private name
 * stays on this device, and writing it into a message would send everybody in
 * the room a name you wrote down for yourself.
 */

/** Who was answered and what they said, as it travels. */
export type Quote = {
  /** Their published name, or the shortened address if they have none. */
  author: string
  /** One line of what was being answered, cut short. */
  said: string
  /**
   * The first [`QUOTE_ID_LEN`] characters of the answered message's relay id,
   * and the whole of how a tapped reply finds what it answers.
   *
   * Absent on a reply written before quotes carried one, and on one answering a
   * message the relay had not yet named. Such a quote offers nowhere to go.
   */
  id?: string
}

/**
 * How much of a message's id a quote carries.
 *
 * Whoever builds a `Quote` has to cut the id to the same length the pattern
 * below looks for, so both read it from here.
 */
export const QUOTE_ID_LEN = 8

/** Long enough for a name or a shortened address, and no longer. */
const MAX_AUTHOR = 48
/**
 * Enough to recognise which message is meant. Not enough to matter against the
 * 4096 bytes a message gets — a quote is a pointer, not a copy.
 */
const MAX_SAID = 120

/** What a written id has to look like, so a stray `#word` is not read as one. */
const ID = /^[0-9a-f]{8}$/

/**
 * `said` must not be empty, which is most of what stops an ordinary message
 * that happens to begin with "> " from being read as a reply. Neither part can
 * span a line, and there has to be something after the quote for it to be a
 * reply to.
 */
const QUOTE = /^> (.{1,48}?)(?: #([0-9a-f]{8}))?: (.{1,120})\n([\s\S]+)$/

/** A reply: the quote line, then the words. */
export function quoted(quote: Quote, body: string): string {
  // The colon is the separator, so an author carrying one of their own would
  // cut their own name in half on the way back.
  const author = oneLine(quote.author.replace(/:/g, " "), MAX_AUTHOR)
  const said = oneLine(quote.said, MAX_SAID)
  if (!author || !said) return body
  // Only a well-formed one is written. A malformed id would not be found by
  // anything, and would sit in the text looking like it meant something.
  const tag = quote.id && ID.test(quote.id) ? ` #${quote.id}` : ""
  return `> ${author}${tag}: ${said}\n${body}`
}

/**
 * Split a message into what it answers and what it says.
 *
 * Anything that is not a reply comes back whole, as its own body — so this is
 * safe to run over every message rather than only the ones expected to be one.
 */
export function unquote(text: string): { quote: Quote | null; body: string } {
  const found = QUOTE.exec(text)
  if (!found) return { quote: null, body: text }
  const quote: Quote = { author: found[1], said: found[3] }
  if (found[2]) quote.id = found[2]
  return { quote, body: found[4] }
}

/** Collapse to a single line and cut to `cap` characters. */
function oneLine(text: string, cap: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  // Sliced by character rather than by `length`, which counts UTF-16 units and
  // would cut a surrogate pair in half.
  return [...clean].slice(0, cap).join("")
}
