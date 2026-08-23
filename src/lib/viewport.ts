/**
 * How much of the screen has to disappear before it counts as a keyboard.
 *
 * Comfortably above a collapsing URL bar or an accessory strip, and well below
 * any real software keyboard.
 */
const KEYBOARD_THRESHOLD_PX = 120

/**
 * Keep the app the size of what is actually visible.
 *
 * When the software keyboard opens, iOS does not shrink the layout viewport —
 * `100dvh` stays the full height of the screen. Instead it scrolls the whole
 * document up to bring the focused field into view, which pushes the top of a
 * full-height app off-screen: in a chat, the header and the messages above the
 * composer simply leave.
 *
 * `visualViewport` is the only thing that reports the real visible rectangle, so
 * the app's height is driven from it. Once the app is exactly as tall as what
 * can be seen, the focused field is already in view and there is nothing for the
 * browser to scroll — but iOS may have scrolled already, so undo that too.
 *
 * Returns a teardown function.
 */
export function trackVisibleViewport(): () => void {
  const viewport = window.visualViewport
  if (!viewport) return () => {}

  const sync = () => {
    document.documentElement.style.setProperty("--app-height", `${viewport.height}px`)

    // A keyboard covers the home indicator, so the bottom safe-area inset is
    // padding against something no longer there — it shows up as a gap between
    // the composer and the keyboard. iOS keeps reporting the inset regardless,
    // so infer it from how much of the screen went missing.
    const covered = window.innerHeight - viewport.height
    document.documentElement.dataset.keyboard =
      covered > KEYBOARD_THRESHOLD_PX ? "open" : "closed"

    // The app now fits the visible area, so any scroll iOS applied to reveal the
    // field is pure offset — it only hides the top of the app.
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }

  sync()
  viewport.addEventListener("resize", sync)
  viewport.addEventListener("scroll", sync)

  return () => {
    viewport.removeEventListener("resize", sync)
    viewport.removeEventListener("scroll", sync)
    document.documentElement.style.removeProperty("--app-height")
    delete document.documentElement.dataset.keyboard
  }
}
