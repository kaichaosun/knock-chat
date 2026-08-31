/** Whether this browser has notifications at all. False inside Nimiq Pay. */
export function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

/** What the browser currently allows, or null where it has no opinion to give. */
export function notifyPermission(): NotificationPermission | null {
  return canNotify() ? Notification.permission : null
}

/**
 * Ask for permission. Must be called from a click.
 *
 * Chrome requires a user gesture, and Safari refuses outright without one — the
 * same rule the Hub's popup lives under. Answers with what the browser settled
 * on, including when it was already settled and no prompt appeared.
 */
export async function askToNotify(): Promise<NotificationPermission> {
  if (!canNotify()) return "denied"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    // Older signatures took a callback and reject the promise form.
    return Notification.permission
  }
}
