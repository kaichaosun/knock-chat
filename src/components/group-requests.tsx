import { ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { GroupAvatar } from "@/components/group-avatar"
import { useNames } from "@/hooks/use-names"
import type { Queues } from "@/hooks/use-join-requests"
import { labelIn } from "@/lib/names"
import type { Group } from "@/lib/relay"

/** How many of the people waiting are named on the card itself. */
const PREVIEW = 2

/**
 * Doors of yours with somebody behind them, above the room list.
 *
 * The same shape as the knocks above the inbox, for the same reason: an answer
 * only you can give is waiting, and it should be on the screen rather than
 * behind two taps into a room's details. What it does not do is answer — the
 * card is a summary, and letting somebody into a room is worth opening.
 */
export function GroupRequests({
  groups,
  queues,
  onOpen,
}: {
  groups: Group[]
  queues: Queues
  /** Open the whole queue for one room. */
  onOpen: (group: string) => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const doors = groups.filter((group) => (queues[group.id]?.length ?? 0) > 0)
  if (doors.length === 0) return null

  const total = doors.reduce((count, group) => count + (queues[group.id]?.length ?? 0), 0)

  return (
    <section className="px-3 pt-3 pb-4">
      <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold">
        {total === 1 ? t("queue.oneWaiting") : t("queue.countWaiting", { count: total })}
      </h2>

      <ul className="space-y-2">
        {doors.map((group) => {
          const queue = queues[group.id] ?? []
          const shown = queue.slice(0, PREVIEW)
          const rest = queue.length - shown.length

          return (
            <li key={group.id}>
              <button
                type="button"
                onClick={() => onOpen(group.id)}
                className="bg-card flex w-full items-center gap-3 rounded-2xl border p-3 text-left shadow-sm active:brightness-95"
              >
                <GroupAvatar members={group.members} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{group.name}</p>
                  {/* Who, not just how many. A number says something is owed;
                      a face and a name is what the answer is actually about. */}
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="flex shrink-0 -space-x-1.5">
                      {shown.map((request) => (
                        <AddressAvatar
                          key={request.id}
                          address={request.address}
                          size="sm"
                          className="size-5"
                        />
                      ))}
                    </span>
                    <span className="text-muted-foreground truncate text-[12px]">
                      {shown.map((request) => labelIn(names, request.address)).join(", ")}
                      {rest > 0 && ` and ${rest} more`}
                    </span>
                  </div>
                </div>

                <ChevronRight className="text-muted-foreground size-4 shrink-0" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
