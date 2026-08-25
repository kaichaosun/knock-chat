import { useSyncExternalStore } from "react"

import { snapshot, subscribe, type Appearance } from "@/lib/theme"

/**
 * The chosen theme and what it currently comes to.
 *
 * An external store rather than state passed down: the theme is applied to the
 * document rather than rendered, so almost nothing needs to read it — only the
 * screen that sets it, and the toaster, which paints outside the app's own tree
 * and so cannot inherit anything from it.
 */
export function useTheme(): Appearance {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
