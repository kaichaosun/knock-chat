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
import { Fragment, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { GiftCard } from "@/components/gift-card"
import { useNames } from "@/hooks/use-names"
import type { Message } from "@/lib/messages"
import { blocks, type Block, type Piece } from "@/lib/markup"
import { segments } from "@/lib/mentions"
import { labelIn } from "@/lib/names"
import { useLinkPreview } from "@/hooks/use-link-preview"
import { bannerSources } from "@/lib/avatar"
import type { Reacted } from "@/lib/reactions"
import { ownCode, type Code } from "@/lib/knock-code"
import { decode, type ContactNote, type Invite, type Parse, type Payment } from "@/lib/payload"
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
  reactions,
  onReact,
  onShowReactors,
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
  /** What people have put on this message. Absent where nothing is. */
  reactions?: Reacted[]
  /** Put one on, or take yours off by naming the one you already gave. */
  onReact?: (emoji: string) => void
  /** Ask who is behind one — a long press, or a right-click. */
  onShowReactors?: (reacted: Reacted) => void
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
  // A message with no words in it: an answer opened before there was any of
  // it, or one closed without any. No bubble is drawn for it — an empty one is
  // a shape with nothing to say, and beside the dots the pair read as two
  // things when they are one.
  const wordless = payload.kind === "text" && !payload.text

  return (
    // Always the left, whichever way it went: the face beside a message says
    // who spoke, so a side would be a second answer to a question already
    // answered. Four fifths used to leave room for the other side of the
    // thread; with nothing on that side it was a margin nothing went in.
    <div className="flex w-full justify-start">
      <div
        // A share of the thread, and never more than a comfortable measure.
        // The share is what a phone goes by; the measure is for a wide window,
        // where a long answer would otherwise run the width of a monitor — past
        // a hundred characters a line, which is where reading turns into work.
        //
        // It is also what bounds every panel inside a message. A bubble is
        // sized by its content, so a code block wanted to be as wide as its
        // longest line and took the thread and the page sideways with it.
        // Capping here rather than on each block means one number decides, and
        // a block can simply fill what it is given.
        className="max-w-[min(92%,42rem)]"
        // A long press on a link is answered by the browser with a menu of its
        // own — Open in new tab, Copy link address — and raising it cancels the
        // pointer stream, which takes the room's hold timer down with it. So a
        // link was the one thing in a message that could not be held. Refused
        // here, on the whole column, because the preview card is a link too and
        // sits outside the bubble.
        //
        // Only where the press already means something. A one-to-one thread has
        // no message menu, and there the browser's own is the only one there is.
        onContextMenu={
          selectable
            ? undefined
            : (event) => {
                // Something highlighted means the browser's own menu is the
                // useful one: its Copy takes what was selected, and the menu
                // this makes room for would take the whole message.
                if (document.getSelection()?.isCollapsed === false) return
                event.preventDefault()
              }
        }
      >
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
        ) : wordless ? null : (
          <div
            className={cn(
              "rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap",
              // Its own width, not the column's. A link card below shares this
              // column and is wider than most messages, and without this the
              // bubble would stretch to match it — so "ok" would arrive as a
              // short message and become a long one the moment the card landed.
              "w-fit",
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
              selectable
                ? "select-text"
                : // A finger cannot select and press at the same time — the
                  // browser starts highlighting long before a 500ms timer could
                  // fire, and on iOS puts its own Copy callout over whatever
                  // opens next. A pointer has no such conflict: the press is
                  // touch-only, and a right-click is a separate gesture. So the
                  // refusal is about the finger rather than about the message,
                  // and lifts wherever there is a real pointer.
                  "select-none [-webkit-touch-callout:none] pointer-fine:select-text",
              outgoing
                ? "bg-bubble-mine text-bubble-mine-foreground rounded-br-md shadow-sm"
                : "bg-muted text-foreground rounded-bl-md",
              failed && "opacity-60",
            )}
          >
            {payload.kind === "text" ? (
              <Answering
                text={payload.text}
                parse={payload.parse}
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

        {/* An answer still being written.
            
            Under the bubble rather than inside it, because it is not something
            the sender said — it is this device saying the message is not
            finished. Inside, it sat at the end of the last sentence and read as
            punctuation somebody had typed.
            
            `joined` leaves the marker on until the last piece says it is the
            last, so this is the difference between a message that stopped and
            one that has not finished — which without it looked the same. */}
        {payload.kind === "text" && payload.part && !payload.part.end && (
          <div
            role="status"
            aria-label={t("bubble.stillComing")}
            className={cn(
              "flex w-fit items-center gap-1 rounded-full px-2.5 py-1.5",
              // Nothing to sit under where the bubble was not drawn.
              wordless ? "mt-0" : "mt-1",
              outgoing ? "bg-bubble-mine/60" : "bg-muted",
            )}
          >
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                // Staggered, so the three read as one thing travelling rather
                // than three things blinking together.
                style={{ animationDelay: `${dot * 160}ms` }}
                className="bg-muted-foreground/70 thinking size-1.5 rounded-full"
              />
            ))}
          </div>
        )}

        {payload.kind === "text" && <LinkCard text={payload.text} faded={failed} />}

        {reactions && reactions.length > 0 && (
          <Reactions reactions={reactions} onReact={onReact} onShow={onShowReactors} />
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
  parse,
  outgoing,
  onOpen,
  onOpenQuote,
  onOpenCode,
}: {
  text: string
  /** How the words are to be read. Absent is plain — see `lib/payload`. */
  parse?: Parse
  outgoing: boolean
  onOpen?: (address: string) => void
  onOpenQuote?: () => void
  onOpenCode?: (code: Code) => void
}) {
  // The quote line is taken off before the body is read as anything. It is
  // this app's own shape rather than markdown's, and a message whose answer
  // opens with a blockquote must not have that read as who it was answering.
  const { quote, body } = unquote(text)
  return (
    <>
      {quote && (
        // Only a quote carrying an id offers to go anywhere. Without one there
        // is nothing to find, and a control that can only ever fail is worse
        // than no control.
        <Quoted quote={quote} outgoing={outgoing} onOpen={quote.id ? onOpenQuote : undefined} />
      )}
      <Words
        text={body}
        parse={parse}
        outgoing={outgoing}
        onOpen={onOpen}
        onOpenCode={onOpenCode}
      />
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
    // A width the snippet may not exceed, so that what is being answered cannot
    // decide how wide the answer is. `line-clamp-2` and `wrap-anywhere` below
    // change what is *drawn*; neither changes max-content, which is what the
    // bubble measures itself against — so one unbreakable 56-character URL in a
    // quote stretched a bubble saying "hello" across the whole thread.
    //
    // 24rem is about sixty characters here, and the snippet is two clamped
    // lines of at most `MAX_SAID` — a hundred and twenty. So the cap is the
    // width at which the longest snippet there can be still fits in the two
    // lines it is given.
    "max-w-96",
    outgoing ? "border-white/40 text-quote-on-mine" : "border-border text-muted-foreground",
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
  parse,
  outgoing,
  onOpen,
  onOpenCode,
}: {
  text: string
  parse?: Parse
  outgoing: boolean
  onOpen?: (address: string) => void
  onOpenCode?: (code: Code) => void
}) {
  // A plain message is one block of exactly what it says. `lib/markup` is never
  // asked about it: reading marks out of writing nobody meant as markup is the
  // thing the mode exists to avoid.
  const shape = useMemo(
    () =>
      parse === "markdown"
        ? blocks(text)
        : [{ kind: "lines", pieces: segments(text) } satisfies Block],
    [text, parse],
  )
  const inside = (pieces: Piece[]) => (
    <Pieces pieces={pieces} outgoing={outgoing} onOpen={onOpen} onOpenCode={onOpenCode} />
  )
  return (
    <>
      {shape.map((block, index) => {
        switch (block.kind) {
          case "lines":
            return <Fragment key={index}>{inside(block.pieces)}</Fragment>
          case "heading":
            // One weight for every depth. A heading is a message somebody sent
            // you, and `#` must not be a way to be louder than the app.
            //
            // More space above than below, because a heading belongs to what
            // follows it. `first:mt-0` so an answer opening with one does not
            // start with a gap inside the bubble.
            return (
              <p key={index} className="mt-3 mb-0.5 font-semibold first:mt-0">
                {inside(block.pieces)}
              </p>
            )
          case "quote":
            // The same rule down the side that a reply is drawn with, so the
            // two read as the same idea — words that are not the sender's own.
            return (
              <blockquote
                key={index}
                className={cn(
                  "my-1.5 border-l-2 pl-2.5",
                  outgoing ? "border-current/35" : "border-border",
                )}
              >
                {inside(block.pieces)}
              </blockquote>
            )
          case "code":
            // Wrapped, not slid. This was a scroller first, on the theory
            // that a line of code should not be broken to fit — but a long
            // line then sat off the side of a message with nothing to say it
            // was there, and a message you cannot see all of is the one thing
            // this app does not do. Indentation is kept, so the shape of the
            // code survives; only the wrapping is given up, and only on lines
            // too long for a bubble.
            //
            // Fills the bubble, and the bubble is what is bounded — see the
            // measure above. A width of its own was tried both ways and each
            // was wrong somewhere: a cap left the panel stopping short of the
            // bubble's edge on a wide window, and a floor was wider than a
            // phone's bubble and burst out of it, since a minimum width beats a
            // maximum and no cap here could hold it in.
            return (
              <pre
                key={index}
                className={cn(
                  "my-1 w-full rounded-lg px-2.5 py-2 text-[13px]",
                  // `pre` carries `white-space: pre` from the browser itself,
                  // which beats anything inherited from the bubble — so a block
                  // that wraps has to say so here.
                  "whitespace-pre-wrap wrap-anywhere",
                  outgoing ? "bg-black/15" : "bg-foreground/8",
                )}
              >
                <code className="font-mono">{block.text}</code>
              </pre>
            )
          case "list":
            // The gap is a margin rather than a blank line. What stood here
            // belonged to the source and not to what was said, so it is
            // trimmed off and drawn instead — see the trim in `blocks`.
            return (
              <ul key={index} className="my-1.5 first:mt-0">
                {block.items.map((item, at) => (
                  <li key={at} className="flex gap-1.5">
                    {/* Drawn, never selected: what somebody copies out of a
                        message should be what they could send back. */}
                    <span className="shrink-0 select-none tabular-nums">{item.marker}</span>
                    <span className="min-w-0">{inside(item.pieces)}</span>
                  </li>
                ))}
              </ul>
            )
        }
      })}
    </>
  )
}

/** The runs of one line, drawn. */
function Pieces({
  pieces,
  outgoing,
  onOpen,
  onOpenCode,
}: {
  pieces: Piece[]
  outgoing: boolean
  onOpen?: (address: string) => void
  onOpenCode?: (code: Code) => void
}) {
  return (
    <>
      {pieces.map((part, index) => {
        const drawn =
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
          )
        // Nothing to say about how it is written, which is every run of every
        // message anybody types.
        if (!part.bold && !part.italic && !part.strike && !part.code) return drawn
        // One element carrying all of them, rather than one nested per mark:
        // `**bold *and* italic**` is a single run either way, and the classes
        // do not care which order they were written in.
        //
        // `font-semibold`, not `font-bold`: a bubble's own name and its unread
        // count are already the heaviest things on screen, and a sentence
        // written strongly is meant to stand out from the sentence around it
        // rather than from the app.
        return (
          <span
            key={index}
            className={cn(
              part.bold && "font-semibold",
              part.italic && "italic",
              part.strike && "line-through",
              part.code &&
                cn(
                  "rounded px-1 py-px font-mono text-[0.9em]",
                  outgoing ? "bg-black/15" : "bg-foreground/8",
                ),
            )}
          >
            {drawn}
          </span>
        )
      })}
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
 * What people thought of a message.
 *
 * Under the bubble rather than in it, because a reaction is not part of what
 * was said — and because the bubble belongs to whoever wrote it while this
 * belongs to everybody else.
 *
 * Yours is marked, and tapping it again takes it off — which is why the pill
 * stays where it is rather than moving to the front or dropping out. A row that
 * rearranges itself under a thumb is a row that gets tapped twice by accident.
 */
function Reactions({
  reactions,
  onReact,
  onShow,
}: {
  reactions: Reacted[]
  onReact?: (emoji: string) => void
  onShow?: (reacted: Reacted) => void
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {reactions.map((reacted) => (
        <Pill key={reacted.emoji} reacted={reacted} onReact={onReact} onShow={onShow} />
      ))}
    </div>
  )
}

/**
 * One emoji, and the two questions it answers.
 *
 * A tap is the common one — put mine on, or take it off. A hold asks the other
 * one, which is who else did: a count says how many and never who, and in a
 * room of any size that is the half worth knowing.
 *
 * The press is stopped here rather than allowed to reach the message, which has
 * a hold of its own. Two menus on one gesture is one too many, and the nearer
 * thing to the thumb should be the one that answers.
 */
function Pill({
  reacted,
  onReact,
  onShow,
}: {
  reacted: Reacted
  onReact?: (emoji: string) => void
  onShow?: (reacted: Reacted) => void
}) {
  const { emoji, count, mine } = reacted
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null)
  const asked = useRef(false)

  const stop = () => {
    if (holding.current === null) return
    clearTimeout(holding.current)
    holding.current = null
  }

  return (
    <button
      type="button"
      disabled={!onReact}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (!onShow || event.pointerType !== "touch") return
        asked.current = false
        holding.current = setTimeout(() => {
          asked.current = true
          onShow(reacted)
        }, HOLD_MS)
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onContextMenu={(event) => {
        // The pointer's way to the same question, and the browser's own menu
        // has nothing to offer about a chip like this.
        if (!onShow) return
        event.preventDefault()
        // Stopped here, or the message behind it answers as well and two
        // sheets open on one click.
        event.stopPropagation()
        onShow(reacted)
      }}
      onClick={() => {
        if (asked.current) {
          asked.current = false
          return
        }
        onReact?.(emoji)
      }}
      aria-pressed={mine}
          // Filled, not outlined. A rule around something two pixels tall reads
          // as a rule, and a row of them reads as a row of lines rather than of
          // faces — the emoji is the thing worth seeing, and a border competes
          // with it for the little contrast this small a shape has.
          //
          // Which of them is yours is a fill too, for the same reason: an
          // outline is the one part of a small control that a thumb covers.
          className={cn(
            "flex h-6 items-center gap-1 rounded-full px-2 leading-none transition-colors",
            mine ? "bg-reaction-mine" : "bg-muted",
            onReact && "active:opacity-70",
          )}
        >
      <span className="text-[14px] leading-none">{emoji}</span>
      {/* Only once it means more than the emoji already does. */}
      {count > 1 && (
        <span
          className={cn(
            "text-[12px] leading-none font-semibold tabular-nums",
            mine ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/**
 * What the first link in a message leads to.
 *
 * Only the first: a message with five links in it is a message, not a page of
 * cards, and the one somebody meant is nearly always the one they wrote first.
 *
 * Read from the page by the relay rather than written by the sender — see
 * `hooks/use-link-preview` and the relay's `unfurl`. That is the whole reason
 * this is worth drawing: a card the sender composed would be a card the sender
 * chose, and on an app where money moves that is a lure waiting to happen.
 *
 * Nothing is drawn until there is something to draw, and nothing at all when
 * the preference is off or the lookup came back empty.
 */
function LinkCard({ text, faded }: { text: string; faded: boolean }) {
  const href = useMemo(() => {
    for (const part of segments(unquote(text).body)) {
      if (part.kind !== "link") continue
      // Our own links lead back here, and the app has one title for every
      // screen in it. The card would say nothing the tap does not.
      try {
        if (new URL(part.href).origin === window.location.origin) return null
      } catch {
        return null
      }
      return part.href
    }
    return null
  }, [text])

  const preview = useLinkPreview(href)
  const tap = useTap()
  // A banner whose bytes will not load falls back to the card that was there
  // before pictures existed, rather than to a broken image in a bubble.
  const [brokenImage, setBrokenImage] = useState(false)
  if (!preview || (!preview.title && !preview.description)) return null

  return (
    <a
      {...tap}
      draggable={false}
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      className={cn(
        "bg-card active:bg-muted mt-1 block rounded-2xl border px-3.5 py-2.5 transition-colors",
        // A width of its own, so every card is the same one.
        //
        // Without it the card sizes to its content and the column sizes to the
        // card: a page whose description runs to ninety characters gets a card
        // at the column's 92% cap, and one with sixty gets a narrower card and
        // a narrower banner with it. `line-clamp-2` does not help — it clamps
        // what is drawn, not the max-content width the browser measures the
        // column against. The same fixed-width idiom as the payment rows below.
        //
        // Wider once there is room for it. `lg` is 64rem, which is the same
        // point `use-wide` splits the app into two panes — so the card grows
        // exactly when the thread stops being the whole window and starts being
        // a column of at least 40rem.
        "w-72 max-w-full lg:w-96",
        faded && "opacity-60",
      )}
    >
      {/* The page's own picture, when it has one worth drawing.

          Served by the relay, never by the site: an `<img>` pointed at the site
          would hand it this reader's address and the fact that they opened the
          message, which is exactly what unfurling centrally exists to prevent.

          The box is reserved before the picture lands — `aspect-[1.91]` with a
          ground behind it — because a card that grows when an image arrives
          pushes the thread under whoever is reading it. */}
      {preview.image && !brokenImage && (
        <img
          alt=""
          {...bannerSources(preview.image)}
          sizes="(min-width: 40rem) 28rem, 78vw"
          draggable={false}
          onError={() => setBrokenImage(true)}
          className="bg-muted -mx-3.5 -mt-2.5 mb-2.5 aspect-[1.91] w-[calc(100%+1.75rem)] max-w-none rounded-t-2xl object-cover select-none"
        />
      )}

      {/* The host first and in its own right. Where a link goes is the fact
          that matters, and a title above it would be the thing a page chose to
          say about itself sitting over the thing it cannot choose. */}
      <p className="text-muted-foreground truncate text-[11px] font-semibold">{preview.host}</p>
      {preview.title && (
        <p className="mt-0.5 line-clamp-2 text-[14px] leading-snug font-semibold">
          {preview.title}
        </p>
      )}
      {preview.description && (
        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[12px] leading-snug">
          {preview.description}
        </p>
      )}
    </a>
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
      draggable={false}
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
      // Colour alone, and the mention's two shades — picked by what has to
      // stay legible against the bubble rather than by whose message it is. A
      // rule under every URL made a thread of them look ruled.
      className={cn(outgoing ? "text-mention-on-brand" : "text-mention")}
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
