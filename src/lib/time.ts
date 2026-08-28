/** Short, human timestamps for lists and bubbles. */

import { t } from "i18next"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** `now`, `4m`, `3h`, `Tue`, `12 Mar` — tuned to stay narrow in a list row. */
export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""

  const elapsed = now - then
  if (elapsed < MINUTE) return t("time.now")
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  if (elapsed < 7 * DAY) {
    return new Date(then).toLocaleDateString(undefined, { weekday: "short" })
  }
  return new Date(then).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}

/** Clock time for a message bubble. */
export function clockTime(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ""
  return then.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
}

/**
 * Whether two times fall in the same clock minute.
 *
 * The unit is the one [`clockTime`] prints, so this answers the only question
 * a thread asks of it: would these two bubbles show the same stamp?
 */
export function sameMinute(a: string, b: string): boolean {
  const first = new Date(a).getTime()
  const second = new Date(b).getTime()
  if (Number.isNaN(first) || Number.isNaN(second)) return false
  return Math.floor(first / MINUTE) === Math.floor(second / MINUTE)
}

/**
 * Day separator label inside a thread.
 *
 * Only the two days that have names people use get them. A weekday on its own
 * — "Monday", "Sunday" — reads as a name but works like a puzzle: it still has
 * to be counted back to a date, and past a few days it stops being countable at
 * all. Everything older is simply dated.
 */
export function dayLabel(iso: string, now = Date.now()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ""

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(then)) / DAY)

  if (days === 0) return t("time.today")
  if (days === 1) return t("time.yesterday")
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: then.getFullYear() === new Date(now).getFullYear() ? undefined : "numeric",
  })
}
