/**
 * Copy that also works over plain `http://<lan-ip>`, which is how the app gets
 * opened on a phone during development — `navigator.clipboard` is only
 * available in a secure context.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall through to the legacy path.
    }
  }

  const scratch = document.createElement("textarea")
  scratch.value = text
  scratch.setAttribute("readonly", "")
  scratch.style.position = "fixed"
  scratch.style.opacity = "0"
  document.body.appendChild(scratch)
  scratch.select()
  try {
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    document.body.removeChild(scratch)
  }
}
