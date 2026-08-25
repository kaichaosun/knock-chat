import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Clock, Coins, DoorClosed, Info } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
import { Composer } from "@/components/composer"
import { SendNimSheet } from "@/components/send-nim-sheet"
import { ContactSheet } from "@/components/contact-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { canBeReached } from "@/lib/keys"
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
  const [showing, setShowing] = useState(false)

  // Knocking costs money, so it is its own deliberate act behind its own button
  // — never something an ordinary-looking send turns into.
  const shut = reach !== null && !reach.channel_open
  const waiting = shut && reach.knock_pending

  /**
   * Whether there is anybody at this address to answer a knock.
   *
   * The prompt below offers to spend money reaching them, and somebody who has
   * never opened Knock has published no key to seal a message to — so the offer
   * cannot be met however much is paid. Asked only while the door is shut,
   * which is the only time it is offered.
   */
  const [reachable, setReachable] = useState<boolean | null>(null)
  useEffect(() => {
    if (!shut) return
    let cancelled = false
    void canBeReached(peer).then((yes) => !cancelled && setReachable(yes))
    return () => {
      cancelled = true
    }
  }, [shut, peer])
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
        {/* 44px targets and the same vertical padding as the app's own header
            when it is scrolled, so a chat does not read as a smaller room than
            the list it opened from. */}
        <div className="flex items-center gap-2 px-1.5 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to messages"
            className="size-11 shrink-0 rounded-full"
          >
            <ChevronLeft className="size-6" />
          </Button>

          <AddressAvatar address={peer} size="sm" className="size-9" />

          {/* Name over address, never name instead of it. This header is the
              one place you are always looking at while reading what someone
              wrote, so it is where the address has to stay visible.

              Tapping it opens who they are, which is where every other
              messenger puts that too. */}
          <button
            type="button"
            onClick={() => setShowing(true)}
            aria-label="Contact info"
            className="min-w-0 flex-1 px-1 text-left active:opacity-60"
          >
            {name ? (
              <>
                <p className="truncate text-[17px] leading-tight font-semibold">{name}</p>
                <p className="text-muted-foreground truncate font-mono text-[12px] tracking-tight">
                  {shortenAddress(peer)}
                </p>
              </>
            ) : (
              <p className="truncate font-mono text-[15px] font-semibold tracking-tight">
                {shortenAddress(peer)}
              </p>
            )}
          </button>

          {/* One control, and it is the one that answers "who am I talking
              to". Copying an address is something you do once and lives inside
              here; checking who someone is happens over and over. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowing(true)}
            aria-label="Contact info"
            className="size-11 shrink-0 rounded-full"
          >
            <Info className="size-6" />
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

      {shut && (
        <KnockPrompt waiting={waiting} cost={cost} reachable={reachable} onKnock={onKnock} />
      )}

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

      <ContactSheet
        open={showing}
        onOpenChange={setShowing}
        address={peer}
        onCopy={onCopyAddress}
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
  reachable,
  onKnock,
}: {
  waiting: boolean
  cost: number
  /** False when nobody has ever opened Knock here. Null until asked. */
  reachable: boolean | null
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
          : reachable === false
            ? "Nobody has opened Knock at this address, so there is nobody here to let you in."
            : "This chat is closed. Knock to ask them to reopen it."}
      </p>
      {/* No price where there is nobody to pay it to. The knock would fail
          before the transaction — `keyForPeer` runs first — so this offers
          nothing it cannot do rather than charging for the discovery. */}
      {!waiting && reachable !== false && (
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
