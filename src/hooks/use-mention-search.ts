import { useCallback } from "react"

import { sameAddress } from "@/lib/mentions"
import { remember, snapshot } from "@/lib/names"
import { listGroupMembers } from "@/lib/relay"

/**
 * How many people a private name may put forward.
 *
 * Each one costs a request to confirm, and a picker only shows a handful
 * anyway. Somebody with four hundred nicknames matching "a" does not need all
 * of them checked to find who they meant.
 */
const LOCAL_LIMIT = 4

/**
 * Who can be mentioned in a room, found by any name you might be looking at.
 *
 * Two directories have to be searched, and only one of them is the relay's. It
 * knows what everybody publishes and can search the whole room for it; it does
 * not know — and must never know — what *you* privately call somebody, because
 * `lib/names` promises that layer never leaves this device. So a nickname can
 * only be matched here.
 *
 * That is the whole of the problem. Nothing needs converting afterwards: a
 * mention carries the address, so a private name is only ever a way of finding
 * a person, never a thing that travels with them. Whoever reads the message
 * sees their own name for whoever was named.
 */
export function useMentionSearch(group: string, you: string) {
  return useCallback(
    async (query: string) => {
      const page = await listGroupMembers(group, { q: query })
      remember(page.names, page.faces)
      // Naming yourself in your own message points at the one person who
      // already knows they wrote it.
      const published = page.members.filter((address) => !sameAddress(address, you))
      const private_ = await namedOnlyHere(group, query, you, published)
      // Yours first. A name the relay has never heard of is one you wrote down
      // yourself, so typing it is about as clear as intent gets.
      return [...private_, ...published]
    },
    [group, you],
  )
}

/**
 * Members of `group` whose *private* name matches, which the relay cannot look
 * for on anybody's behalf.
 *
 * Membership is confirmed rather than assumed. The names on this device were
 * collected from everywhere — contacts, knocks, other rooms — so a match here
 * says somebody has a name, not that they are in this room, and offering a
 * stranger would be offering a ping that goes nowhere. There is no bulk way to
 * ask, so it is one exact-address lookup each, which is why the list is capped
 * before any of them are made.
 */
async function namedOnlyHere(
  group: string,
  query: string,
  you: string,
  already: string[],
): Promise<string[]> {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return []

  const candidates = Object.entries(snapshot().chosen)
    .filter(
      ([address, name]) =>
        name.toLowerCase().includes(wanted) &&
        !sameAddress(address, you) &&
        !already.some((found) => sameAddress(found, address)),
    )
    .slice(0, LOCAL_LIMIT)
    .map(([address]) => address)
  if (candidates.length === 0) return []

  const checked = await Promise.all(
    candidates.map((address) =>
      listGroupMembers(group, { q: address })
        // Back in the relay's own spelling, so that everything downstream is
        // comparing like with like.
        .then((page) => page.members.find((one) => sameAddress(one, address)) ?? null)
        // A lookup that failed is one name not offered, which is a smaller
        // wrong than a picker that will not open.
        .catch(() => null),
    ),
  )
  return checked.filter((address) => address !== null)
}
