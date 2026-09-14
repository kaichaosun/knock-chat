import { useEffect, useRef, useState } from "react"
import { Compass, Loader2, Search, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"

import { GroupAvatar } from "@/components/group-avatar"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { nameIn, remember } from "@/lib/names"
import { shortenAddress } from "@/lib/address"
import { formatNim } from "@/lib/postage"
import { discover, type Group, type Listing } from "@/lib/relay"
import { cn } from "@/lib/utils"

/** How long to wait after a keystroke before asking the relay. */
const SETTLE_MS = 250

/**
 * Rooms you have not been handed a link to.
 *
 * Until this existed a room travelled by link alone, which made groups good for
 * talking to people already found and useless for finding anybody. Safe to have
 * at all for a reason particular to this app rather than one that would hold in
 * most: a room is a lobby. Being found costs its members company and nothing
 * else — writing to one of them privately still costs that person's postage,
 * exactly as if the room had never existed.
 *
 * Two lists, because they answer different questions. Featured is what the
 * relay chose to put in front of people and is shown only while nobody is
 * searching; a curated list sitting on top of a search would be an
 * advertisement rather than an answer.
 *
 * Nothing is joined from here. A row leads to the same door a link leads to —
 * see `JoinGroupSheet` — which is where the price, the owner's whole address
 * and the fact that rooms are not encrypted are said before anything is spent.
 */
export function DiscoverSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Take this room to its door. Joining is that screen's business, not this one's. */
  onPick: (group: Group) => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const [query, setQuery] = useState("")
  const [featured, setFeatured] = useState<Listing[]>([])
  const [results, setResults] = useState<Listing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  /**
   * Whether the relay has answered at all since this opened.
   *
   * What tells "nothing matches" apart from "nobody has asked yet". Without it
   * the empty state was tied to `loading`, so typing another letter into a
   * search that already matched nothing blanked the message and brought it back
   * a moment later — the one state where every keystroke made it flicker.
   */
  const [answered, setAnswered] = useState(false)
  /** Which read is current, so a slow answer cannot land on a newer query. */
  const era = useRef(0)

  // A fresh read whenever the query settles, held back for a moment: a request
  // per keystroke would spend four on a three-letter name and answer them out
  // of order. Browsing — the first open, with nothing typed — is not held back.
  useEffect(() => {
    if (!open) return
    const mine = ++era.current
    setLoading(true)
    setError("")

    const timer = window.setTimeout(
      () => {
        discover(query)
          .then((found) => {
            if (mine !== era.current) return
            remember(found.names, found.faces)
            setFeatured(found.featured)
            setResults(found.results)
            setAnswered(true)
          })
          .catch(() => mine === era.current && setError(t("discover.loadFailed")))
          .finally(() => mine === era.current && setLoading(false))
      },
      query.trim() ? SETTLE_MS : 0,
    )

    return () => window.clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    if (!open) {
      setQuery("")
      setFeatured([])
      setResults([])
      setError("")
      setAnswered(false)
    }
  }, [open])

  const searching = query.trim() !== ""
  const empty = featured.length === 0 && results.length === 0

  const row = (listing: Listing) => {
    const { group, member_count: members } = listing
    // Both, and in that order, wherever a room's owner is drawn. A name is
    // whatever somebody typed — see `lib/names` — so it can never be the only
    // thing shown about who is charging to let you in. Shortened here because
    // this is a list being skimmed; the door shows the whole thing.
    const who = nameIn(names, group.owner)
    const shortened = shortenAddress(group.owner)
    return (
      <li key={group.id}>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false)
            onPick(group)
          }}
          className="active:bg-muted flex w-full items-center gap-3 rounded-2xl p-2 text-left transition-colors"
        >
          {/* No `members`, so a room with no icon of its own draws the neutral
              mark rather than a mosaic of faces. That is the right picture
              here: the directory does not publish who is in a room, and a
              stranger has not earned the faces of its first four members. */}
          <GroupAvatar icon={group.icon} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{group.name}</p>
            {/* Size, then the door. A count is what tells two rooms of the same
                name apart, and the price is the thing worth seeing before you
                tap — a room that charges to be joined is the one worth
                impersonating, so it says so here as well as at the door. */}
            <p className="text-muted-foreground mt-0.5 truncate text-[12px]">
              {[
                t("discover.members", { count: members }),
                group.join_price_luna > 0
                  ? t("groups.priceToJoin", { amount: formatNim(group.join_price_luna) })
                  : t("groups.freeToJoin"),
              ].join(" · ")}
            </p>
            {/* Who runs it. A room wearing the right logo is easy to make; the
                person behind it is the part that can be checked, and the door
                shows their whole address for exactly that reason. */}
            <p className="text-muted-foreground/80 mt-0.5 truncate text-[11px]">
              {t("discover.runBy", { who: who ? `${who} · ${shortened}` : shortened })}
            </p>
          </div>
        </button>
      </li>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* A definite height rather than one taken from the content.
      
          This is a surface you type into, and `max-h` alone let the sheet climb
          and drop on every keystroke as the result count changed. It is also why
          the height is the sheet's own budget and not `vh`: `--sheet-max` follows
          `--app-height`, which shrinks when the keyboard opens, while `vh` is the
          layout viewport and does not — a list sized in `vh` was taller than the
          sheet could show the moment the keyboard arrived, which put the empty
          state below the fold. */}
      <SheetContent
        side="bottom"
        className="mx-auto h-[var(--sheet-max)] w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{t("discover.title")}</SheetTitle>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("discover.search")}
              aria-label={t("discover.searchLabel")}
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

          {/* Everything the search can change lives in here, and this fills
              whatever the sheet has left over. Nothing below the search field
              can move the field, which is the whole point. */}
          <div className="scrollbar-none flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain">
            {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

            {/* An empty directory is the honest state on day one, and it is a
                different thing from a search that found nothing — one says come
                back, the other says try another word. */}
            {answered && empty && !error && (
              <div className="m-auto flex flex-col items-center px-6 text-center">
                <div className="bg-accent text-accent-foreground flex size-16 items-center justify-center rounded-3xl">
                  <Compass className="size-7" strokeWidth={1.5} />
                </div>
                <p className="mt-4 text-[15px] font-semibold">
                  {searching ? t("discover.noMatch") : t("discover.nothingYet")}
                </p>
                <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                  {searching ? t("discover.noMatchNote") : t("discover.nothingYetNote")}
                </p>
              </div>
            )}

            {featured.length > 0 && (
              <section>
                <h3 className="text-muted-foreground flex items-center gap-1.5 px-1 pb-1 text-[12px] font-semibold">
                  <Sparkles className="size-3.5" />
                  {t("discover.featured")}
                </h3>
                <ul className="space-y-1">{featured.map(row)}</ul>
              </section>
            )}

            {results.length > 0 && (
              <section>
                {/* Only titled while there is a featured list above to tell it
                    apart from. On a search this is the whole answer, and a
                    heading over the only thing on screen names nothing. */}
                {featured.length > 0 && (
                  <h3 className="text-muted-foreground px-1 pb-1 text-[12px] font-semibold">
                    {t("discover.more")}
                  </h3>
                )}
                <ul className="space-y-1">{results.map(row)}</ul>
              </section>
            )}

            {/* Only until the directory has spoken once. Every search after
                that leaves the last answer on screen until the next one lands —
                a spinner between keystrokes is motion that says nothing. */}
            {loading && !answered && (
              <div className="text-muted-foreground m-auto">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
