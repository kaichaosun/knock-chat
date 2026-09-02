import { useRef } from "react"

/**
 * What is there now, or the last thing that was.
 *
 * For a sheet whose content is drawn from the same state that opens it. Closing
 * one sets that state to null, and the sheet then spends its exit animation —
 * 300ms, see `ui/sheet` — with nothing in it: a blank panel sliding away, which
 * reads as the app being slow rather than as a thing being dismissed.
 *
 * Holding the last value costs one ref and ends when the sheet is opened on
 * something else, which is the only moment anybody could see the difference.
 */
export function useLast<T>(value: T | null): T | null {
  const kept = useRef<T | null>(value)
  if (value !== null) kept.current = value
  return value ?? kept.current
}
