/**
 * What has changed, for the people it changed for.
 *
 * A feature nobody finds is a feature nobody has. Group discovery is the case
 * that made this worth building — it went in behind a `+` menu, where somebody
 * who never opens that menu would never learn it exists — but the problem is
 * general: this app ships to a WebView inside Nimiq Pay, so there is no release
 * note anywhere, no store listing to read, and nothing to tell anybody that
 * yesterday's build could not do this.
 *
 * Ships with the build, like `lib/legal` and for the same reason: there is no
 * browser to send anyone to, and a changelog fetched from somewhere could
 * describe a version this device is not running.
 *
 * The text itself lives in the dictionaries rather than here, so an entry reads
 * in whatever language the rest of the app is speaking. What lives here is the
 * order, the dates, and which of them a device has been shown.
 */

export type Release = {
  /**
   * Stable forever, and sortable: this is what "seen" is compared against, so
   * changing one re-announces a release and an unsortable one breaks the
   * comparison. An ISO date is both, which is why it is the same as `date`
   * rather than a version — there is no version scheme in this app to borrow.
   */
  id: string
  /** When it shipped. Formatted where it is drawn, in the reader's language. */
  date: string
  /**
   * Translation keys, in reading order.
   *
   * Keys rather than sentences because everything else a user reads is
   * translated, and a changelog that falls back to English is the one screen
   * that would tell somebody the app was not really built for them.
   */
  items: string[]
}

/**
 * Newest first, which is the order it is read in and the order it is drawn in.
 *
 * Only what somebody would notice. A fix for something they never saw break is
 * noise here, and noise is what stops the next entry being read.
 */
export const RELEASES: Release[] = [
  {
    id: "2026-09-14",
    date: "2026-09-14",
    items: ["changelog.discover", "changelog.discoverListing", "changelog.discoverDoor"],
  },
]

/** The newest release there is, or `null` before there is a first one. */
export const LATEST: string | null = RELEASES[0]?.id ?? null

/**
 * Whether this device has been shown everything.
 *
 * Compared by sort order rather than equality, so a device that has somehow
 * recorded something newer than this build knows about — an older build
 * installed over a newer one — is left alone instead of being shown a release
 * it has already read. `""` is a device that has never opened this, which is
 * every device the first time, including a new one: somebody arriving today has
 * missed nothing, but a list of what the app can do is a poor thing to hide
 * from them, and it costs them one tap to dismiss.
 */
export function unseen(seen: string): boolean {
  return LATEST !== null && seen < LATEST
}
