/** Keyboard shortcut metadata shared by every sidebar toggle. */
export const SIDEBAR_SHORTCUT_KEYS = "Meta+Backslash Control+Backslash"

/** Show only the shortcut that belongs to the current platform in tooltips. */
const applePlatform =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

export const SIDEBAR_SHORTCUT_LABEL = applePlatform ? "⌘\\" : "Ctrl+\\"
