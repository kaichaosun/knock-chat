import { useCallback, useEffect, useState } from "react"

import { askToNotify, canNotify, notifyPermission } from "@/lib/notify"
import { update } from "@/lib/prefs"
import { usePrefs } from "@/hooks/use-prefs"
import { subscribeToPush, unsubscribeFromPush } from "@/lib/push"

/**
 * Whether this device is set up to be told about messages, and how to set it up.
 *
 * Two things have to be true and they are held in different places: the
 * preference, which is ours, and the browser's permission, which is not. The
 * pair of them is `armed`, and nothing should act on either alone — a toggle
 * turned on against a refused permission can show nothing, so it must not cost
 * anything either. That is what keeps the poll from running in a hidden tab for
 * no one's benefit.
 */
export function useNotifications() {
  const { notify } = usePrefs()
  const [permission, setPermission] = useState(notifyPermission)

  // The permission can change from outside the app — a site setting, or the
  // browser's own controls — and nothing tells us. Re-reading when the tab
  // comes back is the cheapest way not to be confidently wrong about it.
  useEffect(() => {
    const reread = () => setPermission(notifyPermission())
    document.addEventListener("visibilitychange", reread)
    return () => document.removeEventListener("visibilitychange", reread)
  }, [])

  /** Turn it on, asking the browser if it has not been asked. From a click. */
  const enable = useCallback(async () => {
    const settled = await askToNotify()
    setPermission(settled)
    // Remembered either way. A refusal is the browser's to reverse, and
    // forgetting the request would make the row snap back with no explanation.
    update({ notify: true })
    if (settled === "granted") await subscribeToPush()
    return settled
  }, [])

  const disable = useCallback(() => {
    update({ notify: false })
    void unsubscribeFromPush()
  }, [])

  return {
    /** False where there is no such thing — inside Nimiq Pay, for one. */
    supported: canNotify(),
    /** What the browser allows, or null where it has nothing to say. */
    permission,
    /** Wanted, and possible. The only thing worth acting on. */
    armed: notify && permission === "granted",
    /** Wanted, but the browser is refusing — worth saying out loud. */
    blocked: notify && permission === "denied",
    enable,
    disable,
  }
}
