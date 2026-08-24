/**
 * Getting a readable cause out of whatever was thrown.
 *
 * `catch` gives you `unknown`, and the usual `e instanceof Error ? e.message`
 * quietly discards everything that is not an `Error` — replacing it with a
 * fallback that says only that something went wrong. That is exactly the case
 * worth reading: a wallet provider rejecting with a plain object, an SDK
 * throwing a string. The information existed and the handler dropped it.
 */

/** A message worth showing, from anything at all. */
export function reason(error: unknown, fallback: string): string {
  const found = extract(error)
  return found && found.trim() !== "" ? found : fallback
}

function extract(error: unknown): string | null {
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message
  if (!error || typeof error !== "object") return null

  const value = error as Record<string, unknown>

  // What the Nimiq provider hands back when a wallet refuses: `{ error: { message } }`.
  if (value.error && typeof value.error === "object") {
    const inner = (value.error as Record<string, unknown>).message
    if (typeof inner === "string") return inner
  }
  if (typeof value.message === "string") return value.message
  if (typeof value.error === "string") return value.error

  // Nothing recognisable. Better a shape than silence — it is at least
  // something to search for.
  try {
    const json = JSON.stringify(error)
    return json && json !== "{}" ? json.slice(0, 200) : null
  } catch {
    return null
  }
}
