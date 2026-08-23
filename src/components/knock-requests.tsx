import { useState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import type { Knock } from "@/lib/relay"
import { relativeTime } from "@/lib/time"

/**
 * Knocks waiting for an answer, above the inbox.
 *
 * The message inside is encrypted to a key we can only use once the channel is
 * open, so what is shown is the sender and when — enough to decide, without
 * pretending to preview something unreadable.
 */
export function KnockRequests({
  knocks,
  onAccept,
  onDecline,
}: {
  knocks: Knock[]
  onAccept: (id: string) => Promise<void>
  onDecline: (id: string) => Promise<void>
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const names = useNames()

  if (knocks.length === 0) return null

  const act = async (id: string, action: (id: string) => Promise<void>) => {
    setBusy(id)
    try {
      await action(id)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="border-b px-3 py-3">
      <h2 className="text-muted-foreground mb-2 px-1 text-xs font-semibold">
        {knocks.length === 1 ? "Someone is knocking" : `${knocks.length} people are knocking`}
      </h2>

      <ul className="space-y-2">
        {knocks.map((knock) => (
          <li
            key={knock.id}
            className="bg-card flex items-center gap-3 rounded-2xl border p-3 shadow-sm"
          >
            <AddressAvatar address={knock.from} />
            {/* A stranger's name is a stranger's claim. It goes above the
                address rather than in place of it: this is the one screen where
                the person shown is by definition someone you do not know, and
                deciding about them on a name alone is deciding on nothing. */}
            <div className="min-w-0 flex-1">
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
            </div>

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
          </li>
        ))}
      </ul>
    </section>
  )
}
