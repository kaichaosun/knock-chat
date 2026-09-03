import { useCallback, useEffect, useState } from "react"

import { remember } from "@/lib/names"
import { answerJoinRequest, listJoinRequests, type JoinRequest } from "@/lib/relay"

/** Who is waiting at each of your doors, by room id. Rooms with nobody are absent. */
export type Queues = Record<string, JoinRequest[]>

/**
 * The people waiting to be let into rooms you own.
 *
 * Driven by the counts the room list already carries, so this asks the relay
 * for names and faces only for the doors somebody is actually at — usually
 * none, and never one request per room you are in.
 *
 * Answering drops the person from the queue here rather than re-reading it: the
 * answer is known before the next poll, and a face that lingers after you have
 * let somebody in reads as a tap that did not take.
 */
export function useJoinRequests(waiting: Record<string, number>) {
  const [queues, setQueues] = useState<Queues>({})

  // What the relay says is waiting, as one value to watch. The room list is
  // re-read every thirty seconds and hands back an equal-but-new object each
  // time; only a change in who is at which door is worth asking again for.
  const signature = Object.entries(waiting)
    .map(([id, count]) => `${id}:${count}`)
    .sort()
    .join(",")

  const read = useCallback(async () => {
    const doors = Object.entries(waiting)
      .filter(([, count]) => count > 0)
      .map(([id]) => id)

    if (doors.length === 0) {
      setQueues({})
      return
    }

    const found: Queues = {}
    for (const id of doors) {
      try {
        const answer = await listJoinRequests(id)
        remember(answer.names, answer.faces)
        if (answer.requests.length > 0) found[id] = answer.requests
      } catch {
        // A door that will not answer is left out rather than shown empty; the
        // next read of the room list brings it back.
      }
    }
    setQueues(found)
    // `waiting` is what `signature` stands for — see above.
  }, [signature])

  useEffect(() => {
    void read()
  }, [read])

  const answer = useCallback(async (group: string, request: string, admit: boolean) => {
    await answerJoinRequest(group, request, admit)
    setQueues((held) => {
      const rest = (held[group] ?? []).filter((waiting) => waiting.id !== request)
      const next = { ...held }
      if (rest.length === 0) delete next[group]
      else next[group] = rest
      return next
    })
  }, [])

  return { queues, answer }
}
