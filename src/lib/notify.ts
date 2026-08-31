/**
 * Telling you about a message you are not looking at.
 *
 * Only ever the fact and who it is from — "Message from Carol", or the room's
 * name — and never a word of what was said. Everything else in this app treats
 * the message body as something only the two devices see; handing it to the
 * operating system, which will put it on a lock screen and in a notification
 * centre that outlives the app, would be the one place that stopped being true.
 * Opening the thread is one click away, and that is where the words live.
 *
 * Nothing here works with the app closed. A notification needs this tab alive
 * to be sent, because it is this tab that does the asking — see the poll in
 * `use-messages`. Reaching a closed browser needs a service worker and a push
 * service, which is a different piece of work in a different repository.
 */

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

/**
 * Say that a thread has something new in it.
 *
 * Tagged by thread, so somebody typing four times replaces their own
 * notification instead of stacking four — the count is not the point, being
 * told is. `renotify` because a replaced notification is otherwise silent, and
 * a second message an hour later should still get your attention.
 */
export function announce(
  title: string,
  thread: string,
  onOpen: () => void,
): void {
  if (notifyPermission() !== "granted") return
  try {
    const note = new Notification(title, {
      tag: `knock:${thread}`,
      renotify: true,
      icon: "/icon-192.png",
      badge: "/favicon-32.png",
    } as NotificationOptions)
    note.onclick = () => {
      // Bring the tab forward first: opening a thread nobody is looking at is
      // half an answer, and the click was a request to come back.
      window.focus()
      note.close()
      onOpen()
    }
  } catch {
    // Some browsers throw here rather than resolve a denied permission. There
    // is nothing to fall back to, and a failed notification is not an error
    // worth putting on screen.
  }
}
