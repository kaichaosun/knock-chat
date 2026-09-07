/**
 * Markdown, for a message that asked to be read as markdown.
 *
 * Nothing here runs on an ordinary message. A sender says how their words are
 * meant to be read — see `Parse` in `lib/payload` — and a message that says
 * nothing is drawn exactly as it was typed. That is the whole reason this is a
 * declared mode rather than a pattern applied to everything: `2 * 3 * 4` is
 * arithmetic, `_maybe_` is a word with underscores around it, and no amount of
 * care in a regex makes guessing right for the person who meant them.
 *
 * ## What the mode does not turn on
 *
 * The flag is a claim. Anyone can set it — the app has no notion of which
 * addresses are bots, and should not — so this decides what is *ambiguous*,
 * never what is *unsafe*. Two constructs stay off whoever asks for them:
 *
 * - `[label](url)`. `lib/links` promises the label and the destination are the
 *   same string, which is what stops a message reading `nimiq.com` from going
 *   somewhere else. A written label is exactly how that promise breaks, and
 *   bare URLs already become links, so nothing is lost by leaving it literal.
 * - images. Fetching one tells whoever sent the message the reader's address
 *   and the moment they opened it. A message must not be able to ask.
 *
 * Raw HTML is not markup here either; it is characters, and is drawn as them.
 *
 * ## A dialect, not CommonMark
 *
 * These are chat rules, and they are deliberately simpler than the standard's.
 * A mark may not run across a line, emphasis may not begin or end against a
 * space, a nested list is flattened, and nesting stops at [`DEEPEST`]. Where
 * they disagree with CommonMark, this is what happens.
 *
 * That is affordable because of how it fails. When a rule does not match, the
 * characters stay on the screen as they were typed — the same way an address
 * that is not quite an address stays text, and a malformed reply stays a line
 * of writing. Nothing is corrupted by a rule getting it wrong; something is
 * shown unstyled, and the whole message is still there to read.
 *
 * ## What it does turn on
 *
 * Emphasis, strikethrough, code, lists, headings and quotes — the constructs
 * that are harmless but would misfire on somebody writing normally, which is
 * the class a declared mode exists for. Headings are drawn at one weight
 * whatever their depth: a stranger's message should not be able to shout.
 */

import { segments, type Segment } from "./mentions"

/** How a run of a message is written, on top of what it is. */
export type Style = {
  bold?: true
  italic?: true
  strike?: true
  code?: true
}

/** A run of a message, and how it was written. */
export type Piece = Segment & Style

/** One line of a list: what stood at its head, and what it says. */
export type Item = {
  /** A bullet, or the number exactly as it was written. */
  marker: string
  pieces: Piece[]
}

/** A message, in the shapes it can take. */
export type Block =
  | { kind: "lines"; pieces: Piece[] }
  | { kind: "list"; items: Item[] }
  | { kind: "heading"; pieces: Piece[] }
  | { kind: "quote"; pieces: Piece[] }
  /** Verbatim. Nothing inside a code block is markup, a link, or a name. */
  | { kind: "code"; text: string }

/**
 * The inline marks, in the order a tie is broken.
 *
 * Whichever starts earliest wins, so this order only settles two that begin at
 * the same character — and the one that matters is `**` before `*`, so that
 * strong text is not read as emphasis with a stray star on each end.
 *
 * None may run across a line. A single unmatched marker is common in real
 * writing, and one that could span lines would put the rest of a message in
 * italics on the strength of it.
 */
const MARKS: {
  flag: keyof Style
  pattern: RegExp
  /** Nothing inside is markup: code is characters, whatever they look like. */
  verbatim?: boolean
  /** Refuse a match that touches a word, so `snake_case` is a word. */
  standalone?: boolean
}[] = [
  { flag: "code", pattern: /`([^`\n]+)`/, verbatim: true },
  { flag: "bold", pattern: /\*\*([^\s*][^\n]*?[^\s*]|[^\s*])\*\*/ },
  { flag: "strike", pattern: /~~([^\s~][^\n]*?[^\s~]|[^\s~])~~/ },
  { flag: "italic", pattern: /\*([^\s*][^\n]*?[^\s*]|[^\s*])\*/ },
  { flag: "italic", pattern: /_([^\s_][^\n]*?[^\s_]|[^\s_])_/, standalone: true },
]

/**
 * How deeply marks may nest.
 *
 * Bold inside a quote inside a list is ordinary; four levels of it is somebody
 * finding out what happens. The limit is on the parse rather than the drawing,
 * so a message built to nest a thousand deep costs a bounded amount of work.
 */
const DEEPEST = 4

/** What the bullet of an unordered item is drawn as, whatever was typed. */
const BULLET = "•"

/** The line that opens or closes a block of code. */
const FENCE = /^ {0,3}(?:```|~~~)/
/** A heading, at any depth. What the depth was is deliberately not kept. */
const HEADING = /^ {0,3}#{1,6} +(\S.*)$/
/** A quoted line. The space after the `>` is optional, as everywhere else. */
const QUOTED = /^ {0,3}> ?(.*)$/
/**
 * A line that is one item of a list.
 *
 * Up to three spaces of indent are allowed and then dropped — a nested list
 * reads as a flat one, which loses the nesting and keeps every word.
 */
const ITEM = /^ {0,3}(?:([-*•])|(\d{1,9})[.)]) +(\S.*)$/

/** Whether the characters either side of a match are part of a word. */
function insideWord(text: string, at: number, whole: string): boolean {
  return /\w/.test(text[at - 1] ?? "") || /\w/.test(text[at + whole.length] ?? "")
}

/** The first mark in `text`, or nothing if it holds none. */
function earliest(text: string) {
  let best: { at: number; whole: string; inner: string; mark: (typeof MARKS)[number] } | null = null
  for (const mark of MARKS) {
    // Built per call: a shared regex would carry `lastIndex` between messages.
    const scan = new RegExp(mark.pattern, "g")
    let found: RegExpExecArray | null
    while ((found = scan.exec(text)) !== null) {
      if (mark.standalone && insideWord(text, found.index, found[0])) continue
      if (!best || found.index < best.at) {
        best = { at: found.index, whole: found[0], inner: found[1], mark }
      }
      break
    }
  }
  return best
}

/** What `text` says, with `style` on all of it. */
function styled(text: string, style: Style): Piece[] {
  return segments(text).map((part) => ({ ...part, ...style }))
}

/**
 * One line, split into what it names, where it points, and how it is written.
 *
 * The marks are read before the names and links, which is what lets a strong
 * run hold a name rather than ending at one. A URL with `**` inside it is cut
 * short by that, and stays honest when it is: the address drawn and the address
 * followed are still the same string.
 */
export function pieces(text: string, style: Style = {}, depth = 0): Piece[] {
  if (depth >= DEEPEST) return styled(text, style)

  const out: Piece[] = []
  let rest = text
  // A loop rather than a tail call: a message is 4kB of marks at worst, and
  // recursing once per mark would spend the stack on it. Only nesting recurses,
  // and that is what `DEEPEST` bounds.
  for (;;) {
    const best = earliest(rest)
    if (!best) {
      if (rest.length > 0) out.push(...styled(rest, style))
      return out
    }
    if (best.at > 0) out.push(...styled(rest.slice(0, best.at), style))

    const inner: Style = { ...style, [best.mark.flag]: true }
    if (best.mark.verbatim) {
      // Not through `segments`: a URL written inside backticks is being shown,
      // not offered, and a name inside them is a string that looks like one.
      out.push({ kind: "text", text: best.inner, ...inner })
    } else {
      out.push(...pieces(best.inner, inner, depth + 1))
    }
    rest = rest.slice(best.at + best.whole.length)
  }
}

/** Break a message into the blocks it is drawn as. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
  const lines = text.split("\n")
  let plain: string[] = []
  let items: Item[] = []
  let quoted: string[] = []

  const flush = () => {
    // Only one of the three is ever waiting: starting any of them ends the
    // others. Written as three so that stays true without being remembered.
    //
    // Trimmed, and this is not tidiness. A blank line before a heading is a
    // separator, not something said — but left in the text it becomes a
    // trailing newline, and a browser drops one of those at the end of a block
    // while rendering a *leading* one as an empty line. So the same blank line
    // showed as a gap under a heading and as nothing above it. The space
    // between blocks is a margin now, where it can be the same on both sides.
    const said = plain.join("\n").trim()
    if (said) out.push({ kind: "lines", pieces: pieces(said) })
    if (items.length > 0) out.push({ kind: "list", items })
    if (quoted.length > 0) out.push({ kind: "quote", pieces: pieces(quoted.join("\n")) })
    plain = []
    items = []
    quoted = []
  }

  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]

    if (FENCE.test(line)) {
      flush()
      const body: string[] = []
      // An unclosed fence takes the rest of the message, which is what the
      // sender was in the middle of saying rather than an error to refuse.
      while (++at < lines.length && !FENCE.test(lines[at])) body.push(lines[at])
      out.push({ kind: "code", text: body.join("\n") })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      out.push({ kind: "heading", pieces: pieces(heading[1]) })
      continue
    }

    const item = ITEM.exec(line)
    if (item) {
      if (plain.length > 0 || quoted.length > 0) flush()
      const [, bullet, number, said] = item
      items.push({ marker: bullet ? BULLET : `${number}.`, pieces: pieces(said) })
      continue
    }

    const quote = QUOTED.exec(line)
    if (quote) {
      if (plain.length > 0 || items.length > 0) flush()
      quoted.push(quote[1])
      continue
    }

    if (items.length > 0 || quoted.length > 0) flush()
    plain.push(line)
  }
  flush()
  return out
}

/**
 * The same message with its markup taken off.
 *
 * For the one line a chat row and a quote have, where there is no room to be a
 * list and nowhere to put a strong run — and where leaving the characters in
 * would show `**` about a message the thread draws in bold.
 *
 * A string in and a string out, rather than reading the blocks above, because
 * what comes back is scanned again for the people named in it.
 */
export function unmarked(text: string): string {
  return text
    .split("\n")
    .filter((line) => !FENCE.test(line))
    .map((line) => {
      const item = ITEM.exec(line)
      if (item) return bare(item[3])
      const heading = HEADING.exec(line)
      if (heading) return bare(heading[1])
      const quote = QUOTED.exec(line)
      if (quote) return bare(quote[1])
      return bare(line)
    })
    .join("\n")
}

/** One line with its inline marks taken off, strongest first. */
function bare(line: string): string {
  for (const mark of MARKS) {
    let before: string
    // Repeated: taking off one pair can bring another's ends together.
    do {
      before = line
      line = line.replace(new RegExp(mark.pattern, "g"), (whole, inner: string, ...rest) => {
        const at = rest[rest.length - 2] as number
        return mark.standalone && insideWord(line, at, whole) ? whole : inner
      })
    } while (line !== before)
  }
  return line
}
