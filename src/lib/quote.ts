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
 * ## Why there is no message id in here
 *
 * An id would buy tapping a reply to jump to what it answers. It would also
 * have to be written into the text, where it is 36 characters of noise to
 * anything that cannot read it. And the jump would miss often enough to be a
 * broken promise: a room holds only what has been pulled into it, so what is
 * being answered is frequently not loaded at all. A quote that is always right
 * beats a link that is sometimes there.
 *
 * The cost is that the quote is a snapshot. It does not change when the
 * original is edited, and it survives the original being deleted — which is
 * worth knowing, because it means deleting a message does not unsay it where
 * somebody has already quoted it.
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
}

/** Long enough for a name or a shortened address, and no longer. */
const MAX_AUTHOR = 48
/**
 * Enough to recognise which message is meant. Not enough to matter against the
 * 4096 bytes a message gets — a quote is a pointer, not a copy.
 */
const MAX_SAID = 120

/**
 * `said` must not be empty, which is most of what stops an ordinary message
 * that happens to begin with "> " from being read as a reply. Neither part can
 * span a line, and there has to be something after the quote for it to be a
 * reply to.
 */
const QUOTE = /^> (.{1,48}?): (.{1,120})\n([\s\S]+)$/

/** A reply: the quote line, then the words. */
export function quoted(quote: Quote, body: string): string {
  // The colon is the separator, so an author carrying one of their own would
  // cut their own name in half on the way back.
  const author = oneLine(quote.author.replace(/:/g, " "), MAX_AUTHOR)
  const said = oneLine(quote.said, MAX_SAID)
  if (!author || !said) return body
  return `> ${author}: ${said}\n${body}`
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
  return { quote: { author: found[1], said: found[2] }, body: found[3] }
}

/** Collapse to a single line and cut to `cap` characters. */
function oneLine(text: string, cap: number): string {
  const clean = text.replace(/\s+/g, " ").trim()
  // Sliced by character rather than by `length`, which counts UTF-16 units and
  // would cut a surrogate pair in half.
  return [...clean].slice(0, cap).join("")
}
