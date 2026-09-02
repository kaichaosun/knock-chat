import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ChevronLeft, Clock, Coins, DoorClosed, Info, PanelLeftOpen, UserRound } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
import { Composer } from "@/components/composer"
import { SendNimSheet } from "@/components/send-nim-sheet"
import { ContactSheet } from "@/components/contact-sheet"
import { PickContactSheet } from "@/components/pick-contact-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import type { Code } from "@/lib/knock-code"
import { shortenAddress } from "@/lib/address"
import { canBeReached } from "@/lib/keys"
import { carriesTime, opensTurn, type Message } from "@/lib/messages"
import { labelIn, nameIn } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import type { Reachability } from "@/lib/relay"
import { SIDEBAR_SHORTCUT_KEYS, SIDEBAR_SHORTCUT_LABEL } from "@/lib/shortcuts"
import { dayLabel } from "@/lib/time"
import { cn } from "@/lib/utils"

export function Conversation({
  peer,
  owner,
  messages,
  reach,
  onBack,
  onSend,
  onKnock,
  onRetry,
  onCopyAddress,
  onPay,
  onOpenInvite,
  onOpenContact,
  onRemoveContact,
  onOpenCode,
  onShareContact,
  onShowSidebar,
}: {
  peer: string
  /** Your address, for the face over your own messages. */
  owner: string
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
  /** Open the door a shared contact points at. */
  onOpenContact: (address: string) => void
  /**
   * Shut the door to whoever this thread is with.
   *
   * Absent where there is none open — a thread can exist with somebody who was
   * knocked on and never answered.
   */
  onRemoveContact?: () => void
  /** Take a link that leads back into Knock without leaving the app. */
  onOpenCode: (code: Code) => void
  /** Post somebody's contact into this chat. */
  onShareContact: (address: string) => void
  /** Restore the desktop thread list after it has been hidden. */
  onShowSidebar?: () => void
}) {
  const bottom = useRef<HTMLDivElement>(null)
  /** Everything in the scroller, as one box whose height is the content's. */
  const content = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const names = useNames()
  const name = nameIn(names, peer)
  const [attaching, setAttaching] = useState(false)
  const [paying, setPaying] = useState(false)
  const [sharing, setSharing] = useState(false)
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

  /**
   * Put the end of the thread on screen.
   *
   * `scrollTop` rather than `scrollIntoView` on the last element: this is the
   * one instruction that cannot land short. The sentinel has to have been laid
   * out for the browser to know where to put it, and the moments this has to
   * survive are the ones where the layout is still moving.
   */
  const goToEnd = useCallback(() => {
    const element = scroller.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [])

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    goToEnd()
  }, [messages.length, goToEnd])

  // And whenever the thread area itself changes size — the keyboard opening is
  // the case that matters, which otherwise leaves the thread scrolled to where
  // the bottom used to be, showing its middle. Watched on the element rather
  // than on viewport events, because the resize does not always arrive as one.
  useEffect(() => {
    const element = scroller.current
    if (!element || typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(() => {
      goToEnd()
    })
    observer.observe(element)
    // And the content, which the line above misses: the thread getting taller
    // — a link card finishing its lookup — moves nothing about the scroller
    // itself, so a reader at the end was left short of it having done nothing.
    if (content.current) observer.observe(content.current)
    return () => observer.disconnect()
  }, [goToEnd])

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
            aria-label={t("chat.back")}
            /* Gone where the list is beside this rather than behind it: there
               is nothing to go back to. `lg` is the line `useWide` draws, so
               what this hides and what puts the two panes up always agree. */
            className="size-11 shrink-0 rounded-full lg:hidden"
          >
            <ChevronLeft className="size-6" />
          </Button>

          {onShowSidebar && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onShowSidebar}
              aria-label={t("app.showSidebar")}
              aria-keyshortcuts={SIDEBAR_SHORTCUT_KEYS}
              title={`${t("app.showSidebar")} (${SIDEBAR_SHORTCUT_LABEL})`}
              className="size-11 shrink-0 rounded-full"
            >
              <PanelLeftOpen className="size-5" />
            </Button>
          )}

          <AddressAvatar address={peer} size="sm" className="size-9" />

          {/* Name over address, never name instead of it. This header is the
              one place you are always looking at while reading what someone
              wrote, so it is where the address has to stay visible.

              Tapping it opens who they are, which is where every other
              messenger puts that too. */}
          <button
            type="button"
            onClick={() => setShowing(true)}
            aria-label={t("chat.contactInfo")}
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
            aria-label={t("chat.contactInfo")}
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
        {/* One box to measure. The scroller is sized by flex, so its own
            height says nothing about how tall the thread inside it is. */}
        <div ref={content}>
          {groups.length === 0 ? (
            <ThreadIntro peer={peer} name={name} />
          ) : (
            groups.map((group) => (
              <section key={group.label} className="mb-1">
                {/* In the thread, not above it. A pinned pill keeps the date in
                    reach on a long day, but it does it by crossing whatever is
                    passing underneath — and a date is not worth reading over
                    somebody's words. It scrolls away with the day it opens. */}
                <div className="my-3 flex justify-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium">
                    {group.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {group.messages.map((message, index) => {
                    const outgoing = message.direction === "out"
                    const opens = opensTurn(group.messages[index - 1], message)
                    return (
                      <div key={message.id} className="flex items-start gap-2">
                        {/* A gutter held open for the whole run, so the rest of
                            what somebody says does not step out from under the
                            face that opened it. */}
                        <div className="w-8 shrink-0">
                          {opens &&
                            (outgoing ? (
                              // Nothing to open about yourself here: a thread has
                              // one other person in it, and they are who the
                              // sheet is about.
                              <AddressAvatar address={owner} size="sm" />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setShowing(true)}
                                aria-label={t("chat.about", { name: labelIn(names, peer) })}
                                className="block active:opacity-60"
                              >
                                <AddressAvatar address={peer} size="sm" />
                              </button>
                            ))}
                        </div>
                        <div className="min-w-0 flex-1">
                          {opens && (
                            <p className="text-muted-foreground mb-0.5 ml-1 max-w-full truncate text-[13px] font-semibold">
                              {outgoing ? t("chat.you") : labelIn(names, peer)}
                            </p>
                          )}
                          <MessageBubble
                            message={message}
                            onRetry={onRetry}
                            onOpenInvite={onOpenInvite}
                            onOpenContact={onOpenContact}
                            onOpenCode={onOpenCode}
                            channelOpen={!shut}
                            stamped={carriesTime(message, group.messages[index + 1])}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
          <div ref={bottom} />
        </div>
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
            label: t("chat.sendNim"),
            description: t("chat.sendNimNote"),
            onSelect: () => setPaying(true),
          },
          {
            icon: UserRound,
            label: t("shareContact.action"),
            description: t("shareContact.actionNote"),
            onSelect: () => setSharing(true),
          },
        ]}
      />

      <ContactSheet
        open={showing}
        onOpenChange={setShowing}
        address={peer}
        onCopy={onCopyAddress}
        onRemove={
          onRemoveContact &&
          (() => {
            setShowing(false)
            onRemoveContact()
          })
        }
      />

      <PickContactSheet
        open={sharing}
        onOpenChange={setSharing}
        title={t("shareContact.title")}
        note={t("shareContact.note")}
        repeatable={false}
        onPick={onShareContact}
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
  const { t } = useTranslation()
  return (
    <div className="bg-muted/60 text-muted-foreground flex items-center gap-3 border-t px-4 py-3 text-[12px] leading-snug">
      {waiting ? (
        <Clock className="size-3.5 shrink-0" />
      ) : (
        <DoorClosed className="size-3.5 shrink-0" />
      )}
      <p className="flex-1 text-balance">
        {waiting
          ? t("chat.knockSent")
          : reachable === false
            ? t("chat.nobodyHere")
            : t("chat.closed")}
      </p>
      {/* No price where there is nobody to pay it to. The knock would fail
          before the transaction — `keyForPeer` runs first — so this offers
          nothing it cannot do rather than charging for the discovery. */}
      {!waiting && reachable !== false && (
        <Button size="sm" onClick={onKnock} className="h-8 shrink-0 rounded-lg">
          {cost === 0 ? t("chat.knock") : t("chat.knockFor", { amount: formatNim(cost) })}
        </Button>
      )}
    </div>
  )
}

function ThreadIntro({ peer, name }: { peer: string; name: string | null }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <AddressAvatar address={peer} size="lg" />
      {name && <p className="mt-4 text-base font-semibold">{name}</p>}
      <p className={cn("font-mono text-[13px] font-semibold", name ? "mt-1 text-muted-foreground" : "mt-4")}>
        {shortenAddress(peer)}
      </p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        {t("misc.threadStart")}
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
