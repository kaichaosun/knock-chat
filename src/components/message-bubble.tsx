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
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { GiftCard } from "@/components/gift-card"
import type { Message } from "@/lib/messages"
import { decode, type ContactNote, type Invite, type Payment } from "@/lib/payload"
import { shortenAddress } from "@/lib/address"
import { formatNim } from "@/lib/postage"
import { clockTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function MessageBubble({
  message,
  onRetry,
  onOpenInvite,
  onOpenContact,
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
  /** Whether messages can get through at all right now. */
  channelOpen: boolean
  /** Your address. Only a gift card needs it, and gifts live in rooms. */
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
              selectable ? "select-text" : "select-none",
              outgoing
                ? "brand-gradient rounded-br-md text-white shadow-sm"
                : "bg-muted text-foreground rounded-bl-md",
              failed && "opacity-60",
            )}
          >
            {payload.kind === "text" ? (
              payload.text
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
