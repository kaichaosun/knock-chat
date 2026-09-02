import { useEffect, useState } from "react"

import { usePrefs } from "@/hooks/use-prefs"
import { lookUpLink, type Preview } from "@/lib/relay"

/**
 * What a link leads to, asked once and then remembered.
 *
 * Held for the life of the page rather than per bubble: a room of people
 * talking about one link draws that link many times — in the thread, in the
 * chat list, again after scrolling back — and every one of those would
 * otherwise be a request. The relay caches too, so this is the second of two
 * reasons a popular link costs the site a single visit.
 *
 * A lookup that fails is remembered as a failure and never retried. A card is a
 * nicety; a thread that keeps asking a dead host about a dead link is not.
 */
const held = new Map<string, Preview>()
const missing = new Set<string>()
const asking = new Map<string, Promise<void>>()

/**
 * The card for a link, or null while there is nothing to draw.
 *
 * Null covers every case that is not a card — no link, previews switched off,
 * still being fetched, or a page that said nothing about itself. Nothing is
 * drawn in place of one on purpose: a skeleton under every message with a URL
 * in it would move the whole thread for something that may never arrive.
 */
export function useLinkPreview(url: string | null): Preview | null {
  const { previews } = usePrefs()
  const [preview, setPreview] = useState<Preview | null>(
    () => (url && previews ? (held.get(url) ?? null) : null),
  )

  useEffect(() => {
    if (!url || !previews) {
      setPreview(null)
      return
    }
    const known = held.get(url)
    if (known || missing.has(url)) {
      setPreview(known ?? null)
      return
    }

    let watching = true
    void ask(url).then((answer) => {
      if (watching) setPreview(answer)
    })
    return () => {
      watching = false
    }
  }, [url, previews])

  return preview
}

/** One request per link, however many are waiting on it. */
async function ask(url: string): Promise<Preview | null> {
  const already = asking.get(url)
  if (already) {
    await already
    return held.get(url) ?? null
  }

  const run = lookUpLink(url)
    .then((preview) => {
      held.set(url, preview)
    })
    .catch(() => {
      // Refused, unreachable, or a page with nothing to say. All the same from
      // here: there is no card, and asking again would not change that.
      missing.add(url)
    })
    .finally(() => {
      asking.delete(url)
    })

  asking.set(url, run)
  await run
  return held.get(url) ?? null
}
