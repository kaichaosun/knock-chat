import { useEffect, useRef, useState } from "react"
import { Loader2, Search } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { labelIn, remember } from "@/lib/names"
import { listGroupMembers } from "@/lib/relay"
import { cn } from "@/lib/utils"

/** How long to wait after a keystroke before asking the relay. */
const SETTLE_MS = 250

/**
 * Everybody in a room.
 *
 * Its own screen because a room can hold ten thousand people, which is not a
 * list to put inside another list — the details sheet shows a handful and
 * sends anybody who wants the rest here.
 *
 * Read a page at a time, following the relay's own bookmark rather than
 * counting rows: people join and leave while this is open, and a page numbered
 * by position would show somebody twice or not at all.
 */
export function MembersSheet({
  open,
  onOpenChange,
  group,
  total,
  owner,
  onOpenChat,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The room being listed, and its name for the title. */
  group: { id: string; name: string; owner: string } | null
  /** How many are in it, which the list itself never learns. */
  total: number
  /** You, so the row for you says so. */
  owner: string
  onOpenChat: (address: string) => void
}) {
  const names = useNames()
  const [query, setQuery] = useState("")
  const [members, setMembers] = useState<string[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  /** Which read is current, so a slow answer cannot land on a newer query. */
  const era = useRef(0)

  // The first page, and a fresh one whenever the query settles. Held back for
  // a moment: a request per keystroke would spend four on a three-letter name
  // and answer them out of order.
  useEffect(() => {
    if (!open || !group) return
    const mine = ++era.current
    setLoading(true)
    setError("")

    const timer = window.setTimeout(() => {
      listGroupMembers(group.id, { q: query })
        .then((page) => {
          if (mine !== era.current) return
          remember(page.names)
          setMembers(page.members)
          setNext(page.next)
        })
        .catch(() => mine === era.current && setError("Couldn't load the list"))
        .finally(() => mine === era.current && setLoading(false))
    }, query ? SETTLE_MS : 0)

    return () => window.clearTimeout(timer)
  }, [open, group, query])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setMembers([])
      setNext(null)
    }
  }, [open])

  const more = () => {
    if (!group || next === null || loading) return
    const mine = era.current
    setLoading(true)
    listGroupMembers(group.id, { after: next, q: query })
      .then((page) => {
        if (mine !== era.current) return
        remember(page.names)
        // Appended rather than replaced, and by identity: a member who joined
        // between two pages can arrive in both.
        setMembers((held) => [...held, ...page.members.filter((one) => !held.includes(one))])
        setNext(page.next)
      })
      .catch(() => mine === era.current && setError("Couldn't load more"))
      .finally(() => mine === era.current && setLoading(false))
  }

  return (
    <Sheet open={open && group !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{total > 1 ? `${total} in the room` : "In the room"}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-col gap-3 pb-6">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or address"
              aria-label="Search this room"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className={cn(
                "bg-muted w-full rounded-2xl py-3 pr-4 pl-11 text-[15px] outline-none",
                "placeholder:text-muted-foreground/70",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
              )}
            />
          </div>

          {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

          {members.length === 0 && !loading && !error && (
            <p className="text-muted-foreground px-1 py-8 text-center text-[13px]">
              {query.trim()
                ? "Nobody here by that name. A part of a name works; an address has to be the whole thing."
                : "Nobody here yet."}
            </p>
          )}

          {/* Scrolls inside the sheet rather than growing it, so the search
              field stays put while the list runs underneath it. */}
          <ul
            onScroll={(event) => {
              const list = event.currentTarget
              // Within a screen of the end, which is where the next page has to
              // already be on its way to feel like one list.
              if (list.scrollHeight - list.scrollTop - list.clientHeight < list.clientHeight) {
                more()
              }
            }}
            className="scrollbar-none max-h-[50vh] min-h-0 space-y-1 overflow-y-auto overscroll-contain"
          >
            {members.map((address) => (
              <li key={address}>
                <button
                  type="button"
                  disabled={address === owner}
                  onClick={() => {
                    onOpenChat(address)
                    onOpenChange(false)
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl py-1.5 text-left"
                >
                  <AddressAvatar address={address} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">
                      {address === owner ? "You" : labelIn(names, address)}
                    </p>
                    <p className="text-muted-foreground truncate font-mono text-[11px]">
                      {shortenAddress(address)}
                      {group && address === group.owner && " · owner"}
                    </p>
                  </div>
                </button>
              </li>
            ))}

            {loading && (
              <li className="text-muted-foreground flex justify-center py-4">
                <Loader2 className="size-4 animate-spin" />
              </li>
            )}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  )
}
