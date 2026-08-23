/**
 * How much shorter than its tallest the visible area has to get before it counts
 * as a keyboard.
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

  const root = document.documentElement

  // The tallest the visible area has been, which is what it is with no keyboard.
  // `window.innerHeight` cannot serve as that reference: some WebViews shrink it
  // along with the keyboard and others leave it alone, and getting this wrong
  // means the app is never resized and the composer sits under the keyboard.
  let uncovered = viewport.height
  let appliedHeight = ""
  let appliedKeyboard = ""
  let appliedInset = ""

  const sync = () => {
    const height = viewport.height
    if (height > uncovered) uncovered = height

    const value = `${height}px`
    if (value !== appliedHeight) {
      root.style.setProperty("--app-height", value)
      appliedHeight = value
    }

    // How much of the layout viewport is hidden below what can be seen.
    //
    // A `position: fixed` element anchored to the bottom — every bottom sheet in
    // the app — anchors to the *layout* viewport, which iOS does not shrink for
    // the keyboard. Without lifting it by this much, a sheet opens into the
    // strip behind the keyboard and is simply never seen.
    //
    // Measured rather than assumed, because hosts differ: a WebView that shrinks
    // its layout viewport along with the keyboard leaves this at zero, which is
    // exactly right for it. `documentElement.clientHeight` is the layout
    // viewport height by definition, whatever CSS says about `html`.
    const inset = `${Math.max(0, root.clientHeight - height)}px`
    if (inset !== appliedInset) {
      root.style.setProperty("--keyboard-inset", inset)
      appliedInset = inset
    }

    // A keyboard covers the home indicator, so the bottom safe-area inset is
    // padding against something no longer there — it shows up as a gap between
    // the composer and the keyboard. iOS keeps reporting the inset regardless,
    // so infer the keyboard from how much of the screen went missing.
    const keyboard = uncovered - height > KEYBOARD_THRESHOLD_PX ? "open" : "closed"
    if (keyboard !== appliedKeyboard) {
      root.dataset.keyboard = keyboard
      appliedKeyboard = keyboard
    }

    // The app now fits the visible area, so any scroll iOS applied to reveal the
    // field is pure offset — it only hides the top of the app.
    if (window.scrollY !== 0) window.scrollTo(0, 0)
  }

  // Rotating changes what "no keyboard" means, so the reference starts over.
  const onOrientation = () => {
    uncovered = viewport.height
    sync()
  }

  sync()
  viewport.addEventListener("resize", sync)
  viewport.addEventListener("scroll", sync)
  // Re-measure when the app comes back to the front or the window changes shape.
  document.addEventListener("visibilitychange", sync)
  window.addEventListener("pageshow", sync)
  window.addEventListener("orientationchange", onOrientation)

  return () => {
    viewport.removeEventListener("resize", sync)
    viewport.removeEventListener("scroll", sync)
    document.removeEventListener("visibilitychange", sync)
    window.removeEventListener("pageshow", sync)
    window.removeEventListener("orientationchange", onOrientation)
    root.style.removeProperty("--app-height")
    root.style.removeProperty("--keyboard-inset")
    delete root.dataset.keyboard
  }
}
