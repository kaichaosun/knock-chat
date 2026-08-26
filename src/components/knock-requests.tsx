import { useState } from "react"
import { Check, Loader2, LockKeyhole, X } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { KnockRequestSheet } from "@/components/knock-request-sheet"
import { Button } from "@/components/ui/button"
import { useKnockNotes } from "@/hooks/use-knock-notes"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import type { Knock } from "@/lib/relay"
import { relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

/**
 * Knocks waiting for an answer, above the inbox.
 *
 * Shown with what they say. Somebody paid to be able to say who they are, and
 * a door answered without hearing that is answered blind — the address alone
 * cannot tell an old friend on a new phone from a stranger selling something.
 * Reading a knock lets nobody in; the channel opens on the tick, not here.
 */
export function KnockRequests({
  knocks,
  owner,
  deviceSecretKey,
  onAccept,
  onDecline,
}: {
  knocks: Knock[]
  /** Your address, which the seal is over as well as the sender's. */
  owner: string | null
  /** This device's private half, which opens what was sealed to it. */
  deviceSecretKey: Uint8Array | null
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  // The knock being read in full. Held by id rather than by value so it follows
  // the poll — and disappears by itself if the knock is answered elsewhere.
  const [readingId, setReadingId] = useState<string | null>(null)
  const names = useNames()
  const notes = useKnockNotes(knocks, owner, deviceSecretKey)

  if (knocks.length === 0) return null

  const act = async (id: string, action: (id: string) => Promise<void>) => {
    setBusy(id)
    try {
      await action(id)
      setReadingId(null)
    } finally {
      setBusy(null)
    }
  }

  const reading =
    readingId === null ? null : (knocks.find((knock) => knock.id === readingId) ?? null)

  return (
    // No rule under it. Every knock is already a bordered card under a heading,
    // so the section is legible without one — and the block of pinned chats
    // that usually follows is a rounded tinted box, which a full-bleed hairline
    // meets edge-on and reads as a line drawn across its top by mistake.
    <section className="px-3 pt-3 pb-4">
      <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold">
        {knocks.length === 1 ? "Someone is knocking" : `${knocks.length} people are knocking`}
      </h2>

      <ul className="space-y-2">
        {knocks.map((knock) => (
          <li key={knock.id} className="bg-card rounded-2xl border p-3 shadow-sm">
            <div className="flex items-center gap-3">
              <AddressAvatar address={knock.from} />
              {/* A stranger's name is a stranger's claim. It goes above the
                  address rather than in place of it: this is the one screen where
                  the person shown is by definition someone you do not know, and
                  deciding about them on a name alone is deciding on nothing.

                  Tapping it opens the knock in full, where the address is not
                  shortened either. */}
              <button
                type="button"
                onClick={() => setReadingId(knock.id)}
                aria-label="Read this knock in full"
                className="min-w-0 flex-1 text-left active:opacity-60"
              >
                {nameIn(names, knock.from) && (
                  <p className="truncate text-[15px] leading-tight font-semibold">
                    {nameIn(names, knock.from)}
                  </p>
                )}
                <p className="text-muted-foreground truncate font-mono text-[12px]">
                  {shortenAddress(knock.from)}
                </p>
                <p className="text-muted-foreground text-[11px]">
                  knocked {relativeTime(knock.created_at)}
                </p>
              </button>

              <div className="flex shrink-0 gap-1.5">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Decline"
                  disabled={busy === knock.id}
                  onClick={() => act(knock.id, onDecline)}
                  className="size-9 rounded-full"
                >
                  <X className="size-4" />
                </Button>
                <Button
                  size="icon"
                  aria-label="Let them in"
                  disabled={busy === knock.id}
                  onClick={() => act(knock.id, onAccept)}
                  className="size-9 rounded-full"
                >
                  {busy === knock.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Under the row rather than beside it: this is the one thing on
                the card worth reading rather than scanning, and a line of it
                squeezed between an address and two buttons would be neither. */}
            <KnockNote note={notes[knock.id]} onOpen={() => setReadingId(knock.id)} />
          </li>
        ))}
      </ul>

      <KnockRequestSheet
        knock={reading}
        note={reading ? notes[reading.id] : undefined}
        busy={reading !== null && busy === reading.id}
        onOpenChange={(next) => !next && setReadingId(null)}
        onAccept={() => reading && void act(reading.id, onAccept)}
        onDecline={() => reading && void act(reading.id, onDecline)}
      />
    </section>
  )
}

/**
 * The opening of what somebody wrote on their knock.
 *
 * Nothing at all until it has been opened — a card that says "no message" and
 * then fills in a second later has told you something untrue in between.
 *
 * Three lines, and the rest is a tap away. Nothing stops a stranger writing an
 * essay, and several of these sit on top of the inbox: a card that grew to fit
 * whatever it was sent would let anybody push the day's messages off the
 * screen for the price of one knock.
 */
function KnockNote({ note, onOpen }: { note: string | null | undefined; onOpen: () => void }) {
  if (note === undefined) return null

  if (note === null) {
    return (
      <p className="text-muted-foreground mt-2.5 flex items-center gap-2 text-[13px] italic">
        <LockKeyhole className="size-3.5 shrink-0" />
        Can't be opened on this device
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Read the whole message"
      className={cn(
        "bg-muted mt-2.5 w-full rounded-xl px-3 py-2 text-left text-[13px] leading-snug",
        // No `whitespace-pre-wrap` and no `block` here, both deliberately.
        // `line-clamp` works by making the element a `-webkit-box`, so a
        // `display` of its own cancels it; and with preserved newlines WebKit
        // measures the box against lines that are not there, which is what
        // leaves half a fourth line showing under the clamp. A preview is
        // three lines of what was said, not its shape — the sheet keeps the
        // line breaks.
        "line-clamp-3 wrap-anywhere active:brightness-95",
      )}
    >
      {note}
    </button>
  )
}
