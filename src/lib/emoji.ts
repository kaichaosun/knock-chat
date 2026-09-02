/**
 * The emoji this app offers, grouped the way a picker shows them.
 *
 * Held here rather than pulled from a library, because what a picker actually
 * needs is the characters — and characters are a few bytes each. What costs
 * hundreds of kilobytes is *searching* them: the names, the keywords and the
 * translations of both. A reaction is chosen by eye from a grid, so none of
 * that is bought.
 *
 * ## Deliberately not everything
 *
 * Around three hundred, and all of them old. An emoji added to Unicode last
 * year is one somebody's phone may not have a glyph for, and an emoji with no
 * glyph is an empty box — worse than not offering it, because it looks like the
 * app is broken rather than the set being finite. These are the ones that have
 * been drawable everywhere for years.
 *
 * Skin tones and flags are both left out on the same grounds a picker like this
 * usually leaves them out: they multiply the grid several times over to serve a
 * fraction of what anybody reacts with, and the recent row — see
 * `lib/reactions` — is a better answer for somebody who does use one, once they
 * have used it once.
 */

export type EmojiGroup = {
  /** The i18n key naming this group. */
  key: string
  emoji: string[]
}

export const EMOJI: EmojiGroup[] = [
  {
    key: "emoji.faces",
    emoji: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
      "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
      "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
      "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "😌",
      "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵",
      "🥶", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐", "😕", "😟",
      "🙁", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰",
      "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫",
      "😤", "😡", "😠", "🤬", "😈", "💀", "💩", "🤡", "👻", "👽",
      "🤖", "😺", "😹", "😻", "😿", "🙀",
    ],
  },
  {
    key: "emoji.gestures",
    emoji: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤟", "🤘", "🤙", "👈",
      "👉", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "🖖", "👋", "🤝",
      "🙏", "✍️", "💪", "🦵", "👀", "👁️", "👄", "🧠", "👂", "👃",
      "👶", "🧒", "👦", "👧", "🧑", "👨", "👩", "🧓", "🤷",
      "🤦", "🙋", "🙆", "🙅", "💁", "🕺", "💃", "🧘", "🏃", "🚶",
    ],
  },
  {
    key: "emoji.hearts",
    emoji: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💯", "💢",
      "💥", "💫", "💦", "💨", "🕳️", "💬", "💭", "🗯️", "✅", "❌",
      "❓", "❗", "⚠️", "🔥", "⭐", "🌟", "✨", "⚡", "🎉", "🎊",
    ],
  },
  {
    key: "emoji.animals",
    emoji: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
      "🦁", "🐮", "🐷", "🐸", "🐵", "🙈", "🙉", "🙊", "🐔", "🐧",
      "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄",
      "🐝", "🐛", "🦋", "🐌", "🐞", "🐢", "🐍", "🐙", "🦑", "🦀",
      "🐬", "🐳", "🐟", "🦈", "🌵", "🌲", "🌴", "🌱", "🍀", "🌷",
      "🌸", "🌹", "🌻", "🌼", "🌞", "🌙", "🌈", "☁️", "🌧️", "❄️",
    ],
  },
  {
    key: "emoji.food",
    emoji: [
      "🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍒",
      "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🥑", "🍆", "🥕", "🌽",
      "🌶️", "🥔", "🍞", "🥐", "🥖", "🧀", "🥚", "🍳", "🥞", "🥓",
      "🍔", "🍟", "🍕", "🌭", "🌮", "🌯", "🥗", "🍝", "🍜", "🍲",
      "🍣", "🍱", "🍚", "🍙", "🍦", "🍩", "🍪", "🎂", "🍰", "🧁",
      "🍫", "🍬", "🍿", "☕", "🍵", "🧋", "🍺", "🍻", "🥂", "🍷",
    ],
  },
  {
    key: "emoji.things",
    emoji: [
      "⚽", "🏀", "🏈", "⚾", "🎾", "🏐", "🎱", "🏓", "🏸", "🥅",
      "🏆", "🥇", "🥈", "🥉", "🎯", "🎮", "🎲", "🧩", "🎸", "🎹",
      "🎺", "🎻", "🥁", "🎤", "🎧", "🎬", "📷", "📱", "💻", "⌨️",
      "🖥️", "🖨️", "💾", "📀", "☎️", "📞", "📺", "📻", "🔋", "🔌",
      "💡", "🔦", "📔", "📚", "📖", "📝", "✏️", "📌", "📎", "🔒",
      "🔑", "🔨", "🪓", "⚙️", "🧲", "💉", "💊", "🚪", "🛏️", "🚿",
      "💰", "💸", "💳", "🧾", "✉️", "📦", "🎁", "🎈", "🕯️", "🔔",
    ],
  },
  {
    key: "emoji.places",
    emoji: [
      "🚗", "🚕", "🚌", "🚑", "🚒", "🚚", "🚲", "🛴", "🏍️", "✈️",
      "🚀", "🛸", "🚁", "⛵", "🚢", "🚂", "🚊", "🏠", "🏡", "🏢",
      "🏥", "🏦", "🏫", "🏰", "⛺", "🏝️", "🏔️", "🌋", "🗻", "🌊",
      "🌍", "🌎", "🌏", "🧭", "🗺️", "🕐", "⏰", "⏳", "📅", "🎪",
    ],
  },
]

/**
 * One emoji out of whatever somebody typed, or nothing.
 *
 * The picker is the device's own keyboard rather than a list bundled with the
 * app: every phone already has one, it is the one its owner knows, and it holds
 * every emoji their system can draw rather than the subset that was current
 * when this shipped. What comes back is ordinary text, so it has to be read.
 *
 * Read as *graphemes*, not characters. A family is seven code points held
 * together by joiners and a flag is two; splitting on characters would take the
 * first half of one and send a fragment.
 */
export function firstEmoji(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const first = graphemes(trimmed)[0] ?? ""
  return IS_EMOJI.test(first) ? first : null
}

/**
 * What counts as an emoji, tested against a whole grapheme.
 *
 * Three properties rather than one, because emoji are three different things
 * wearing the same hat. Most are pictographic. A flag is two regional
 * indicators and no picture at all. A keycap is an ordinary digit wearing
 * U+20E3, which is why the digit alone must not pass — the test is run on the
 * grapheme, so `1` fails and `1️⃣` does not.
 *
 * Deliberately not `\p{Emoji}`, which is true of bare digits, `#` and `*`.
 */
const IS_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u

function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const split = new Intl.Segmenter(undefined, { granularity: "grapheme" })
    return [...split.segment(text)].map((part) => part.segment)
  }
  // Older engines: characters, which is wrong for a joined emoji but is only
  // ever reached where `Intl.Segmenter` is missing, and never silently — the
  // check above still refuses anything that is not an emoji.
  return [...text]
}
