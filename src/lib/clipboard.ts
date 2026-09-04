/**
 * Copying text.
 *
 * `navigator.clipboard` needs a secure context, and during development the app
 * is served over plain `http://` on a LAN — where it is unavailable on iOS and
 * entirely undefined on Android. So `execCommand("copy")` is the only path, and
 * it copies from whatever element currently holds focus.
 *
 * That last detail is the whole problem. A modal traps focus, so a scratch
 * element appended to `document.body` loses focus the instant it takes it —
 * measured: focus went straight back to a button inside the sheet — and the
 * copy silently takes nothing with it.
 *
 * Once the app is served over HTTPS, `navigator.clipboard` exists on both
 * platforms and none of this runs.
 */

/**
 * Where a scratch element has to live to be copyable: inside the open modal, if
 * there is one, so its focus trap has nothing to fight.
 *
 * The *innermost* one, not the first found. A sheet can open a sheet — the QR
 * code lives inside the profile — and then two are open at once, with the trap
 * that matters belonging to the newer. Radix portals in mount order, so the
 * last match is the one on top. Appending to the outer one puts the scratch
 * element under a trap that takes focus straight back, which is this file's
 * original bug wearing a second sheet.
 */
function copyContainer(): HTMLElement {
  const open = document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"]')
  return open[open.length - 1] ?? document.body
}

function copyViaTextarea(text: string): boolean {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")

  // Off-screen rather than hidden: `opacity: 0` and `display: none` are known
  // to be uncopyable in some engines. Not the cause of the modal bug, but the
  // conventional way to do this.
  textarea.style.position = "fixed"
  textarea.style.top = "0"
  textarea.style.left = "-9999px"
  // Below 16px, iOS zooms the page when the element takes focus.
  textarea.style.fontSize = "16px"

  const container = copyContainer()
  container.appendChild(textarea)
  try {
    textarea.select()
    // iOS ignores `select()` on a readonly field; this is what actually selects.
    textarea.setSelectionRange(0, text.length)
    // Checked rather than assumed. `execCommand` answers true for a copy that
    // took nothing — that is how this failed silently before, with the toast
    // saying the link was copied and the clipboard still holding whatever it
    // held. If something pulled focus away the selection is gone, and that is
    // visible from here.
    if (textarea.selectionEnd - textarea.selectionStart !== text.length) return false
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    container.removeChild(textarea)
  }
}

/**
 * Put `text` on the clipboard.
 *
 * Returns false when the platform refuses, so the caller can tell the user to
 * select it by hand rather than claiming a success it cannot verify —
 * `execCommand` returns true in WebViews that copy nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or unavailable — fall through.
    }
  }
  return copyViaTextarea(text)
}
