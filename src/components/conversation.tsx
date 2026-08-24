import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Clock, Coins, Copy, DoorClosed } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
import { Composer } from "@/components/composer"
import { SendNimSheet } from "@/components/send-nim-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { formatAddress, shortenAddress } from "@/lib/address"
import type { Message } from "@/lib/messages"
import { nameIn } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import type { Reachability } from "@/lib/relay"
import { dayLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

export function Conversation({
  peer,
  messages,
  reach,
  onBack,
  onSend,
  onKnock,
  onRetry,
  onCopyAddress,
  onPay,
  onOpenInvite,
}: {
  peer: string
  messages: Message[]
  /** Null while it is still being fetched; assume the channel is open until told otherwise. */
  reach: Reachability | null
  onBack: () => void
  onSend: (body: string) => void
  /** Open the knock sheet for this peer. */
  onKnock: () => void
  onRetry: (message: Message) => void
  onCopyAddress: (address: string) => void
  /** Raises the wallet for a transfer, then posts the note into the thread. */
  onPay: (peer: string, luna: number) => Promise<void>
  /** Open the door an invite card points at. */
  onOpenInvite: (group: string) => void
}) {
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const name = nameIn(useNames(), peer)
  const [attaching, setAttaching] = useState(false)
  const [paying, setPaying] = useState(false)

  // Knocking costs money, so it is its own deliberate act behind its own button
  // — never something an ordinary-looking send turns into.
  const shut = reach !== null && !reach.channel_open
  const waiting = shut && reach.knock_pending
  const cost = reach?.policy.amount_luna ?? 0

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  // And whenever the thread area itself changes size — the keyboard opening is
  // the case that matters, which otherwise leaves the thread scrolled to where
  // the bottom used to be, showing its middle. Watched on the element rather
  // than on viewport events, because the resize does not always arrive as one.
  useEffect(() => {
    const element = scroller.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      bottom.current?.scrollIntoView({ block: "end" })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const groups = useMemo(() => groupByDay(messages), [messages])

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        <div className="flex items-center gap-1.5 px-1.5 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to messages"
            className="size-10 shrink-0 rounded-full"
          >
            <ChevronLeft className="size-5" />
          </Button>

          <AddressAvatar address={peer} size="sm" />

          {/* Name over address, never name instead of it. This header is the
              one place you are always looking at while reading what someone
              wrote, so it is where the address has to stay visible. */}
          <div className="min-w-0 flex-1 px-1">
            {name ? (
              <>
                <p className="truncate text-[15px] leading-tight font-semibold">{name}</p>
                <p className="text-muted-foreground truncate font-mono text-[11px] tracking-tight">
                  {shortenAddress(peer)}
                </p>
              </>
            ) : (
              <p className="truncate font-mono text-[13px] font-semibold tracking-tight">
                {shortenAddress(peer)}
              </p>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopyAddress(formatAddress(peer))}
            aria-label="Copy address"
            className="size-10 shrink-0 rounded-full"
          >
            <Copy className="size-4" />
          </Button>

        </div>
      </header>

      <div
        ref={scroller}
        className="scrollbar-none flex-1 overflow-y-auto overscroll-contain px-3.5 py-4"
      >
        {groups.length === 0 ? (
          <ThreadIntro peer={peer} name={name} />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-1">
              <div className="sticky top-1 z-[1] my-3 flex justify-center">
                <span className="bg-muted/90 text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                  {group.label}
                </span>
              </div>
              <div className="space-y-2">
                {group.messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onRetry={onRetry}
                    onOpenInvite={onOpenInvite}
                    channelOpen={!shut}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        <div ref={bottom} />
      </div>

      {shut && <KnockPrompt waiting={waiting} cost={cost} onKnock={onKnock} />}

      <Composer onSend={onSend} onAttach={() => setAttaching(true)} disabled={shut} />

      <AttachMenu
        open={attaching}
        onOpenChange={setAttaching}
        actions={[
          {
            icon: Coins,
            label: "Send NIM",
            description: "Straight from your wallet to theirs.",
            onSelect: () => setPaying(true),
          },
        ]}
      />

      <SendNimSheet
        open={paying}
        onOpenChange={setPaying}
        peer={peer}
        onSend={(luna) => onPay(peer, luna)}
      />
    </div>
  )
}

/** Why the composer is shut, and the one way back through it. */
function KnockPrompt({
  waiting,
  cost,
  onKnock,
}: {
  waiting: boolean
  cost: number
  onKnock: () => void
}) {
  return (
    <div className="bg-muted/60 text-muted-foreground flex items-center gap-3 border-t px-4 py-3 text-[12px] leading-snug">
      {waiting ? (
        <Clock className="size-3.5 shrink-0" />
      ) : (
        <DoorClosed className="size-3.5 shrink-0" />
      )}
      <p className="flex-1 text-balance">
        {waiting
          ? "Knock sent. You can write again once they answer."
          : "This chat is closed. Knock to ask them to reopen it."}
      </p>
      {!waiting && (
        <Button size="sm" onClick={onKnock} className="h-8 shrink-0 rounded-lg">
          {cost === 0 ? "Knock" : `Knock — ${formatNim(cost)} NIM`}
        </Button>
      )}
    </div>
  )
}

function ThreadIntro({ peer, name }: { peer: string; name: string | null }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <AddressAvatar address={peer} size="lg" />
      {name && <p className="mt-4 text-base font-semibold">{name}</p>}
      <p className={cn("font-mono text-[13px] font-semibold", name ? "mt-1 text-muted-foreground" : "mt-4")}>
        {shortenAddress(peer)}
      </p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        This is the start of your conversation. Say hello.
      </p>
    </div>
  )
}

function groupByDay(messages: Message[]): Array<{ label: string; messages: Message[] }> {
  const groups: Array<{ label: string; messages: Message[] }> = []
  for (const message of messages) {
    const label = dayLabel(message.at)
    const current = groups[groups.length - 1]
    if (current?.label === label) current.messages.push(message)
    else groups.push({ label, messages: [message] })
  }
  return groups
}
