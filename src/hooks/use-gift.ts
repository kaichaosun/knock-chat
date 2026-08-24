import { useCallback, useEffect, useState } from "react"

import { remember } from "@/lib/names"
import { claimGift, getGift, type GiftDetail } from "@/lib/relay"

/**
 * One gift's live state, and taking a share of it.
 *
 * The card in the thread carries only what the pot *was*; how much is left and
 * whether you already took some is asked here. A message cannot know either —
 * both change after it was sent, which is the whole point of a scramble.
 */
export function useGift(id: string) {
  const [detail, setDetail] = useState<GiftDetail | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState("")

  const refresh = useCallback(async () => {
    try {
      const answer = await getGift(id)
      remember(answer.names)
      setDetail(answer)
    } catch {
      // The card falls back to what the message said, which is enough to draw
      // it. Nothing here is worth an error in front of somebody.
    }
  }, [id])

  useEffect(() => {
    void refresh()
  }, [refresh])

  /**
   * Take a share.
   *
   * A share is allocated and paid as two steps on the relay, and the second can
   * fail on its own — so what comes back may be a share with no transfer behind
   * it yet. That is reported rather than smoothed over: the money is owed
   * either way, and saying it has arrived when it has not is the one thing this
   * must never do.
   */
  const claim = useCallback(async () => {
    setClaiming(true)
    setError("")
    try {
      await claimGift(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't take a share")
      // Somebody else may have emptied it while this was in flight, so what the
      // card shows should be re-read rather than left as it was.
      await refresh()
    } finally {
      setClaiming(false)
    }
  }, [id, refresh])

  return { detail, claiming, error, claim, refresh }
}
