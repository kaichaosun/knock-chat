import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock,
  HelpCircle,
  LockKeyhole,
  Users,
} from "lucide-react"
import { Fragment, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { GiftCard } from "@/components/gift-card"
import { useNames } from "@/hooks/use-names"
import type { Message } from "@/lib/messages"
import { segments } from "@/lib/mentions"
import { labelIn } from "@/lib/names"
import { ownCode, type Code } from "@/lib/knock-code"
import { decode, type ContactNote, type Invite, type Payment } from "@/lib/payload"
import { unquote, type Quote } from "@/lib/quote"
import { shortenAddress } from "@/lib/address"
import { formatNim } from "@/lib/postage"
import { clockTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function MessageBubble({
  message,
  onRetry,
  onOpenInvite,
  onOpenContact,
  onOpenMention,
  onOpenQuote,
  onOpenCode,
  channelOpen,
  owner = null,
  stamped = true,
  selectable = true,
}: {
  message: Message
  onRetry: (message: Message) => void
  /** Open the door an invite points at. */
  onOpenInvite: (group: string) => void
  /** Open the door a shared contact points at. */
  onOpenContact: (address: string) => void
  /**
   * Say who somebody named in the message is.
   *
   * Absent where there is nobody to say it about — a one-to-one thread has no
   * members to name — and a mention there is then drawn but not tappable.
   */
  onOpenMention?: (address: string) => void
  /**
   * Go to whatever this message answers.
   *
   * Absent where there is nothing to go to — a thread with no room to scroll
   * back through — and the quote is then drawn but not tappable.
   */
  onOpenQuote?: () => void
  /**
   * Open something in a link that leads back into Knock.
   *
   * Absent where there is nothing to open it with, and such a link is then an
   * ordinary link that reloads the app to arrive where it already is.
   */
  onOpenCode?: (code: Code) => void
  /** Whether messages can get through at all right now. */
  channelOpen: boolean
  /** Your address: what a gift card is drawn against, and who a mention of you is. */
  owner?: string | null
  /**
   * Whether the text may be selected by hand.
   *
   * False where a long press is a gesture of its own. The two cannot share the
   * press: the browser begins selecting long before a timer could fire, and on
   * iOS puts a Copy / Look Up / Translate callout over whatever opens next.
   */
  selectable?: boolean
  /**
   * Whether this bubble shows the time. False for one the next message follows
   * within the same minute, which then carries the stamp for both. See
   * [`carriesTime`].
   */
  stamped?: boolean
}) {
  const { t } = useTranslation()
  const outgoing = message.direction === "out"
  const failed = message.status === "failed" || message.status === "blocked"
  // A message still on its way, or one that never went, keeps its line whatever
  // the run says: a retry nobody can see is a message nobody sends again.
  const unsettled = outgoing && message.status !== "sent"

  // Kept and shown rather than hidden: a message this device cannot read is
  // still evidence someone wrote, and dropping it would leave a silent gap.
  if (message.undecryptable) {
    return (
      <div className="flex w-full justify-start">
        <div className="bg-muted/60 text-muted-foreground flex max-w-[80%] items-center gap-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] italic">
          <LockKeyhole className="size-3.5 shrink-0" />
          {t("bubble.locked")}
        </div>
      </div>
    )
  }

  const payload = decode(message.body)

  return (
    // Always the left, whichever way it went: the face beside a message says
    // who spoke, so a side would be a second answer to a question already
    // answered. Four fifths used to leave room for the other side of the
    // thread; with nothing on that side it was a margin nothing went in.
    <div className="flex w-full justify-start">
      <div className="max-w-[92%]">
        {payload.kind === "payment" ? (
          <PaymentCard payment={payload.payment} outgoing={outgoing} faded={failed} />
        ) : payload.kind === "gift" ? (
          <GiftCard note={payload.giftNote} outgoing={outgoing} faded={failed} owner={owner} />
        ) : payload.kind === "contact" ? (
          <ContactCard
            contact={payload.contact}
            outgoing={outgoing}
            faded={failed}
            onOpen={() => onOpenContact(payload.contact.address)}
          />
        ) : payload.kind === "invite" ? (
          <InviteCard
            invite={payload.invite}
            faded={failed}
            onOpen={() => onOpenInvite(payload.invite.group)}
          />
        ) : (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap",
              // What someone wrote is worth lifting out of the page, so it opts
              // back in to the selection the body switched off — unless a long
              // press on it means something, in which case the browser's own
              // selection gets there first and this has to stand aside. An
              // ancestor cannot decide that: this class is the more specific
              // one and would win.
              "wrap-anywhere",
              // Where a long press means something, the browser must not
              // answer it as well: on iOS a link raises Open / Copy Link on
              // its own, and that callout is switched off separately from the
              // selection. It inherits, so setting it here reaches the links
              // inside.
              selectable ? "select-text" : "select-none [-webkit-touch-callout:none]",
              outgoing
                ? "brand-gradient rounded-br-md text-white shadow-sm"
                : "bg-muted text-foreground rounded-bl-md",
              failed && "opacity-60",
            )}
          >
            {payload.kind === "text" ? (
              <Answering
                text={payload.text}
                outgoing={outgoing}
                onOpen={onOpenMention}
                onOpenQuote={onOpenQuote}
                onOpenCode={onOpenCode}
              />
            ) : (
              // Something a newer build sent that this one has no way to draw.
              // Shown as a gap on purpose: silently dropping it would leave the
              // two sides disagreeing about what was said.
              <span className="text-muted-foreground flex items-center gap-2 text-[13px] italic">
                <HelpCircle className="size-3.5 shrink-0" />
                {t("misc.unsupported")}
              </span>
            )}
          </div>
        )}

        {(stamped || unsettled) && (
          <div
            className={cn(
              "text-muted-foreground mt-1 flex items-center gap-1 px-1 text-[11px]",
              outgoing ? "flex-row-reverse" : "flex-row",
            )}
          >
            <span className="tabular-nums">{clockTime(message.at)}</span>
            {outgoing && (
              <DeliveryState message={message} onRetry={onRetry} channelOpen={channelOpen} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * What somebody wrote, with whatever it answers above it.
 *
 * The quote is drawn from the message itself rather than looked up — see
 * `lib/quote`. It is a snapshot, so it stays readable whether or not the room
 * has the original loaded, and whether or not the original still exists.
 */
function Answering({
  text,
  outgoing,
  onOpen,
  onOpenQuote,
  onOpenCode,
}: {
  text: string
  outgoing: boolean
  onOpen?: (address: string) => void
  onOpenQuote?: () => void
  onOpenCode?: (code: Code) => void
}) {
  const { quote, body } = unquote(text)
  return (
    <>
      {quote && (
        // Only a quote carrying an id offers to go anywhere. Without one there
        // is nothing to find, and a control that can only ever fail is worse
        // than no control.
        <Quoted quote={quote} outgoing={outgoing} onOpen={quote.id ? onOpenQuote : undefined} />
      )}
      <Words text={body} outgoing={outgoing} onOpen={onOpen} onOpenCode={onOpenCode} />
    </>
  )
}

/**
 * What is being answered.
 *
 * A rule down the side rather than a filled card: a bubble is already a shape,
 * and the reply is what somebody came here to read.
 */
function Quoted({
  quote,
  outgoing,
  onOpen,
}: {
  quote: Quote
  outgoing: boolean
  onOpen?: () => void
}) {
  const tap = useTap(onOpen)
  const className = cn(
    "mb-1.5 flex w-full flex-col border-l-2 pl-2 text-left text-[13px] leading-snug",
    outgoing ? "border-white/40 text-white/80" : "border-border text-muted-foreground",
  )
  const inside = (
    <>
      <span className="truncate font-semibold">{quote.author}</span>
      <span className="line-clamp-2 wrap-anywhere">{quote.said}</span>
    </>
  )

  // Drawn either way, tappable only where there is somewhere to go — a
  // one-to-one thread has no room to scroll back through.
  if (!onOpen) return <span className={className}>{inside}</span>
  return (
    <button type="button" {...tap} className={cn(className, "active:opacity-60")}>
      {inside}
    </button>
  )
}

/**
 * What somebody wrote, with the people in it drawn as people.
 *
 * A mention arrives as an address (see `lib/mentions`) and is put back into a
 * name here, out of this device's own directory — so the same message reads
 * "@Alice" to somebody who knows her by that and "@NQ97 V68G … JLKY" to
 * somebody who does not. Nothing is fetched to do it and nothing can fail.
 */
function Words({
  text,
  outgoing,
  onOpen,
  onOpenCode,
}: {
  text: string
  outgoing: boolean
  onOpen?: (address: string) => void
  onOpenCode?: (code: Code) => void
}) {
  const parts = useMemo(() => segments(text), [text])
  return (
    <>
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : part.kind === "link" ? (
          <Link
            key={index}
            text={part.text}
            href={part.href}
            outgoing={outgoing}
            onOpenCode={onOpenCode}
          />
        ) : (
          <Mention key={index} address={part.address} outgoing={outgoing} onOpen={onOpen} />
        ),
      )}
    </>
  )
}

/**
 * How long a press has to last before it belongs to the message rather than to
 * whoever is named in it. Mirrors the room's own long press — see `GroupRoom`.
 */
const HOLD_MS = 500

/**
 * A tap that stands aside for the message's own long press.
 *
 * Everything tappable inside a bubble sits inside a press that means something
 * else: in a room, holding a message opens its menu. A long press ends in a
 * click like any other, so without this the room would open its menu on the
 * timer and this would open a second thing over the top of it on release.
 *
 * Deliberately does not stop the press reaching the row — the message's gesture
 * belongs to the whole message, wherever on it a finger lands.
 *
 * A link has no `act` of its own, because the browser is what follows it. For
 * one, this is only the refusal.
 */
function useTap(act?: () => void) {
  const pressed = useRef<number | null>(null)
  return {
    onPointerDown: (event: { pointerType: string }) => {
      pressed.current = event.pointerType === "touch" ? Date.now() : null
    },
    onClick: (event: { preventDefault: () => void }) => {
      const began = pressed.current
      pressed.current = null
      if (began !== null && Date.now() - began >= HOLD_MS) {
        // Whatever this would have done, the press has already been spent on
        // the message's own menu. `preventDefault` is what a link needs: for a
        // button, returning was always enough.
        event.preventDefault()
        return
      }
      act?.()
    },
  }
}

/** Somebody, named inside a message. */
function Mention({
  address,
  outgoing,
  onOpen,
}: {
  address: string
  outgoing: boolean
  onOpen?: (address: string) => void
}) {
  const names = useNames()
  const tap = useTap(onOpen && (() => onOpen(address)))
  const label = `@${labelIn(names, address)}`

  // A bubble is already a shape, so a mention does not get one of its own: a
  // filled pill inside a bubble is a container inside a container, and a room
  // of them reads as clutter rather than as people. Weight and colour only,
  // in two strengths picked by what the mention has to stay legible against
  // rather than by whose message it is.
  const className = cn("font-semibold", outgoing ? "text-mention-on-brand" : "text-mention")

  // Drawn either way, tappable only where there is somebody to open. A mention
  // still says who it means in a thread that has no members list.
  if (!onOpen) return <span className={className}>{label}</span>

  return (
    <button type="button" {...tap} className={cn(className, "active:opacity-60")}>
      {label}
    </button>
  )
}

/**
 * Somewhere a message points.
 *
 * What is drawn is the address itself — see `lib/links` — so the label and the
 * destination are one string and cannot disagree. There is nothing to check
 * before tapping, which is the whole reason a preview card is a harder problem
 * than a link.
 *
 * Nothing is fetched to draw this. A card carrying a title and a picture would
 * mean some browser asking that site for them, and which browser that is
 * decides who gets told what is being read.
 *
 * The three attributes are the care. `noreferrer`, with the policy beside it,
 * stops the site learning where the visitor came from — this app's own links
 * carry room ids and addresses in their query strings, so the referrer is not
 * a small thing to hand over. `noopener` keeps the opened page from reaching
 * back through `window.opener`.
 *
 * A link back into Knock is the exception, and stays inside — see [`ownCode`].
 * It is still written as a link rather than a button: it is one, it can be
 * copied and shared as one, and if this never runs the browser still gets
 * somewhere right.
 */
function Link({
  text,
  href,
  outgoing,
  onOpenCode,
}: {
  text: string
  href: string
  outgoing: boolean
  onOpenCode?: (code: Code) => void
}) {
  const code = onOpenCode ? ownCode(href, window.location.origin) : null
  const tap = useTap(code && onOpenCode ? () => onOpenCode(code) : undefined)
  return (
    <a
      {...tap}
      onClick={(event) => {
        // Ours, so there is nowhere to go: following it would restart the app
        // to arrive where it is already standing. Refused before the press is
        // weighed, so a long press does not leave either.
        if (code) event.preventDefault()
        tap.onClick(event)
      }}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      // Underlined as well as coloured: colour alone is not something everybody
      // can see, and a link that is only a shade of the text is not a link to
      // them. The two shades are the mention's, picked by what has to stay
      // legible against the bubble rather than by whose message it is.
      className={cn(
        "underline underline-offset-2",
        outgoing ? "text-mention-on-brand" : "text-mention",
      )}
    >
      {text}
    </a>
  )
}

/**
 * A payment.
 *
 * Deliberately not a chat bubble. It carries no tail, it has a border, and it
 * is laid out in rows rather than as a run of text — a payment is a different
 * kind of thing from something someone said, and it should be possible to tell
 * which is which from across the room without reading either.
 *
 * It reports what the sender said they paid and nothing more. Nothing here is
 * checked against the chain, so this is a note about a payment rather than a
 * receipt for one — what actually arrived is what the wallet says arrived.
 * See `lib/payload`.
 */
function PaymentCard({
  payment,
  outgoing,
  faded,
}: {
  payment: Payment
  outgoing: boolean
  faded: boolean
}) {
  const { t } = useTranslation()
  const Icon = outgoing ? ArrowUpRight : ArrowDownLeft

  return (
    <div
      className={cn(
        "bg-card flex min-w-52 items-center gap-3 rounded-2xl border px-3.5 py-3 shadow-sm",
        faded && "opacity-60",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          outgoing ? "bg-muted text-muted-foreground" : "bg-success/12 text-success",
        )}
      >
        <Icon className="size-4.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-semibold">
          {t(outgoing ? "bubble.sent" : "bubble.received")}
        </p>
        <p
          className={cn(
            "text-xl leading-tight font-bold tabular-nums",
            !outgoing && "text-success",
          )}
        >
          {formatNim(payment.luna)} NIM
        </p>
      </div>
    </div>
  )
}

/**
 * A room somebody pointed you at.
 *
 * A card rather than a link, and tapping it opens the door rather than the
 * room: what it costs to get in has to be seen before anything is paid, and
 * that is the join sheet's job. The name here is the sender's — whatever the
 * room is really called is fetched on the way in.
 */
function InviteCard({
  invite,
  faded,
  onOpen,
}: {
  invite: Invite
  faded: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "bg-card flex w-64 max-w-full items-center gap-3 rounded-2xl border px-3.5 py-3.5 text-left shadow-sm",
        "active:bg-muted transition-colors",
        faded && "opacity-60",
      )}
    >
      <span className="bg-accent text-accent-foreground flex size-11 shrink-0 items-center justify-center rounded-full">
        <Users className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-[12px] font-semibold">
          {t("bubble.groupInvite")}
        </p>
        <p className="mt-0.5 truncate text-[15px] leading-tight font-bold">
          {invite.name || t("bubble.aGroup")}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0" />
    </button>
  )
}

/**
 * Somebody, handed on.
 *
 * The face and the address are drawn from the address itself, so the card is
 * true even if the name that travelled with it is stale — a name is what
 * someone calls themselves today, and the address is who they are.
 */
function ContactCard({
  contact,
  outgoing,
  faded,
  onOpen,
}: {
  contact: ContactNote
  outgoing: boolean
  faded: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        // One width whoever is in it: sized to content, the same card is a
        // different object for every name. Wide enough for the address it
        // falls back to, and capped so a small phone still fits it.
        "flex w-64 max-w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left transition-colors",
        outgoing ? "bg-primary/10" : "bg-muted",
        faded && "opacity-60",
      )}
    >
      <AddressAvatar address={contact.address} size="md" />
      <div className="min-w-0">
        {/* The same word from both ends. A name already sits over the bubble,
            so "You shared" says "you" twice — and a longer label makes the
            sender's card wider than the receiver's for no reason. */}
        <p className="text-muted-foreground text-[12px] font-semibold">
          {t("shareContact.card")}
        </p>
        <p className="mt-0.5 truncate text-[15px] leading-tight font-bold">
          {contact.name || shortenAddress(contact.address)}
        </p>
      </div>
      <ChevronRight className="text-muted-foreground ml-auto size-4 shrink-0" />
    </button>
  )
}

function DeliveryState({
  message,
  onRetry,
  channelOpen,
}: {
  message: Message
  onRetry: (message: Message) => void
  channelOpen: boolean
}) {
  const { t } = useTranslation()
  if (message.status === "sending") {
    return <Clock className="size-3 animate-pulse" aria-label={t("bubble.sending")} />
  }
  if (message.status === "blocked" && !channelOpen) {
    // Deliberately not a button: there is nothing to tap that would help while
    // the door is shut. The way through is the knock prompt above the composer.
    return (
      <span className="text-destructive flex items-center gap-1 font-medium">
        <AlertCircle className="size-3" />
        {t("bubble.notDelivered")}
      </span>
    )
  }
  // Once the door is open again, a message the door had blocked can go through,
  // so it stops being dead and becomes retryable like any other failure.
  if (message.status === "failed" || message.status === "blocked") {
    return (
      <button
        type="button"
        onClick={() => onRetry(message)}
        className="text-destructive flex items-center gap-1 font-medium"
      >
        <AlertCircle className="size-3" />
        {t("bubble.retry")}
      </button>
    )
  }
  return <Check className="size-3" aria-label={t("bubble.delivered")} />
}
