import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Clock, Copy, DoorClosed, RefreshCw } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Composer } from "@/components/composer"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { formatAddress, shortenAddress } from "@/lib/address"
import type { Message } from "@/lib/messages"
import { formatNim } from "@/lib/postage"
import type { Reachability } from "@/lib/relay"
import { dayLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

/** How far to drag before a release refreshes, and how far the pull can travel. */
const PULL_TRIGGER_PX = 64
const PULL_MAX_PX = 88

export function Conversation({
  peer,
  messages,
  reach,
  onBack,
  onSend,
  onKnock,
  onRefresh,
  onRetry,
  onCopyAddress,
}: {
  peer: string
  messages: Message[]
  /** Null while it is still being fetched; assume the channel is open until told otherwise. */
  reach: Reachability | null
  onBack: () => void
  onSend: (body: string) => void
  /** Open the knock sheet for this peer. */
  onKnock: () => void
  /** Pull down to ask the relay for anything new, including whether the door opened. */
  onRefresh: () => Promise<void>
  onRetry: (message: Message) => void
  onCopyAddress: (address: string) => void
}) {
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  // Pull-to-refresh. Only meaningful from the top of the thread, so the drag is
  // ignored unless the list is already scrolled there.
  const pullFrom = useRef<number | null>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  const runRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  // Knocking costs money, so it is its own deliberate act behind its own button
  // — never something an ordinary-looking send turns into.
  const shut = reach !== null && !reach.channel_open
  const waiting = shut && reach.knock_pending
  const cost = reach?.policy.amount_luna ?? 0

  // Keep the newest message in view as the thread grows or the keyboard opens.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

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

          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-mono text-[13px] font-semibold tracking-tight">
              {shortenAddress(peer)}
            </p>
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

      <div className="relative flex-1 overflow-hidden">
        <div
          className="text-muted-foreground pointer-events-none absolute inset-x-0 top-0 z-[2] flex justify-center"
          style={{
            transform: `translateY(${(refreshing ? PULL_TRIGGER_PX : pull) - 30}px)`,
            opacity: refreshing || pull > 0 ? 1 : 0,
          }}
        >
          <span className="bg-background flex size-7 items-center justify-center rounded-full border shadow-sm">
            <RefreshCw
              className={cn("size-3.5", refreshing && "animate-spin")}
              style={
                refreshing ? undefined : { transform: `rotate(${(pull / PULL_TRIGGER_PX) * 270}deg)` }
              }
            />
          </span>
        </div>

      <div
        ref={scroller}
        onTouchStart={(event) => {
          pullFrom.current =
            (scroller.current?.scrollTop ?? 0) <= 0 ? event.touches[0].clientY : null
        }}
        onTouchMove={(event) => {
          if (pullFrom.current === null || refreshing) return
          const dy = event.touches[0].clientY - pullFrom.current
          // Resisted, so it feels like pulling against something.
          setPull(dy > 0 ? Math.min(dy * 0.5, PULL_MAX_PX) : 0)
        }}
        onTouchEnd={() => {
          if (pull >= PULL_TRIGGER_PX) void runRefresh()
          setPull(0)
          pullFrom.current = null
        }}
        className="scrollbar-none h-full overflow-y-auto overscroll-contain px-3.5 py-4"
      >
        {groups.length === 0 ? (
          <ThreadIntro peer={peer} />
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
                    channelOpen={!shut}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        <div ref={bottom} />
        </div>
      </div>

      {shut && <KnockPrompt waiting={waiting} cost={cost} onKnock={onKnock} />}

      <Composer onSend={onSend} disabled={shut} />
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

function ThreadIntro({ peer }: { peer: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <AddressAvatar address={peer} size="lg" />
      <p className="mt-4 font-mono text-[13px] font-semibold">{shortenAddress(peer)}</p>
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
