import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ChevronLeft,
  DoorClosed,
  Gift as GiftIcon,
  Copy,
  Info,
  Loader2,
  MoreVertical,
  PanelLeftOpen,
  Reply,
  Trash2,
  UserRound,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { MemberSheet } from "@/components/member-sheet"
import { PickContactSheet } from "@/components/pick-contact-sheet"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { AttachMenu } from "@/components/attach-menu"
import { Composer, type ComposerHandle } from "@/components/composer"
import { GroupAvatar } from "@/components/group-avatar"
import { GroupSheet } from "@/components/group-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { PullIndicator } from "@/components/pull-indicator"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { useMentionSearch } from "@/hooks/use-mention-search"
import { useNames } from "@/hooks/use-names"
import type { Code } from "@/lib/knock-code"
import { copyText } from "@/lib/clipboard"
import { shortenAddress } from "@/lib/address"
import { encode, preview, reaction } from "@/lib/payload"
import { tagOf, unquote, type Quote } from "@/lib/quote"
import { EmojiSheet } from "@/components/emoji-sheet"
import { useLast } from "@/hooks/use-last"
import { ReactorsSheet } from "@/components/reactors-sheet"
import { usePrefs } from "@/hooks/use-prefs"
import { update as savePrefs } from "@/lib/prefs"
import {
  fold,
  mineAmong,
  mineOn,
  offered,
  remember,
  toggled,
  type Reacted,
} from "@/lib/reactions"
import { cn } from "@/lib/utils"
import { givenNameIn, labelIn } from "@/lib/names"
import { carriesTime, opensTurn, type Message } from "@/lib/messages"
import { deleteSaid, removeGroupMember, type Group, type GroupDetail } from "@/lib/relay"
import { SIDEBAR_SHORTCUT_KEYS, SIDEBAR_SHORTCUT_LABEL } from "@/lib/shortcuts"
import { dayLabel } from "@/lib/time"

/**
 * A room.
 *
 * Close to a conversation and deliberately not identical: what somebody says
 * is introduced by their face and their name, because in a room who is speaking
 * is not implied by the thread.
 */
export function GroupRoom({
  group,
  detail,
  member,
  gone,
  owner,
  messages,
  onBack,
  onDeleteChat,
  onLeft,
  onSay,
  onRetrySay,
  onRefreshDetail,
  onOpenChat,
  onOpenInvite,
  onOpenContact,
  onOpenCode,
  onShareContact,
  onInvite,
  onGift,
  onShowSidebar,
  hasEarlier = false,
  loadingEarlier = false,
  onLoadEarlier,
  onForget,
}: {
  group: Group
  /** Members and settings; null until the first read lands. */
  detail: GroupDetail | null
  /** False once you are no longer in the room — history stays, writing goes. */
  member: boolean
  /** The relay no longer has this room: its owner ended it. */
  gone: boolean
  owner: string
  messages: Message[]
  onBack: () => void
  /** Offered only once the room is gone: the thread is all that is left. */
  onDeleteChat: () => void
  /** You walked out. The room closes behind you — see `LeaveGroupDialog`. */
  onLeft: () => void
  onSay: (body: string) => void
  /** Say again something that never left. Rooms can fail like anything else. */
  onRetrySay: (message: Message) => void
  onRefreshDetail: () => void
  /** Knock on a member — a room opens no channel, so this still costs. */
  onOpenChat: (address: string) => void
  /** Open the door an invite card points at. */
  onOpenInvite: (group: string) => void
  /** Open the door a shared contact points at. */
  onOpenContact: (address: string) => void
  /** Take a link that leads back into Knock without leaving the app. */
  onOpenCode: (code: Code) => void
  /** Post somebody's contact into this room. */
  onShareContact: (address: string) => void
  /** Send this room's invite into your chat with somebody. */
  onInvite: (address: string) => void
  /**
   * Leave a pot in the room, or say why it cannot be left just now. Always
   * passed: asking is how anybody finds out whether this relay holds gifts.
   */
  onGift: () => void
  /** Restore the desktop thread list after it has been hidden. */
  onShowSidebar?: () => void
  /** Whether the room has older messages left to fetch. */
  hasEarlier?: boolean
  /** A page is on its way, so the top can say so instead of looking stuck. */
  loadingEarlier?: boolean
  onLoadEarlier?: () => void
  /** Drop messages the room has taken back, by relay id. */
  onForget: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  /** Who the composer's `@` can reach, by published name or by one of yours. */
  const searchMembers = useMentionSearch(group.id, owner)
  const composer = useRef<ComposerHandle>(null)
  const bottom = useRef<HTMLDivElement>(null)
  /** Everything in the scroller, as one box whose height is the content's. */
  const content = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement | null>(null)
  /**
   * The same node again, as state.
   *
   * `usePullToRefresh` binds to the element rather than a ref to it, so that
   * binding follows the element — and the anchoring below needs it
   * imperatively. One callback ref keeps both honest.
   */
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null)
  const holdScroller = useCallback((node: HTMLDivElement | null) => {
    scroller.current = node
    setScrollerEl(node)
  }, [])
  const [details, setDetails] = useState(false)
  /**
   * Open the details, and ask the relay for them on the way.
   *
   * The asking used to hang off the sheet's `onOpenChange`, which never runs
   * for this: Radix calls it when the sheet itself wants a change — a backdrop,
   * an escape, the close button — and not when the prop below is set from here.
   * So the guard fired only on the way out, and the one fetch at room-open was
   * the only one there had ever been.
   */
  const showDetails = () => {
    setDetails(true)
    onRefreshDetail()
  }
  /** Whose details are open. A name over a message says who somebody is; it
   *  does not start a conversation, which in a room is never free. */
  const [showing, setShowing] = useState<string | null>(null)
  /** Who the owner has asked to show out, before they confirm it. */
  const [removing, setRemoving] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // The owner's half of a name over a message. A room is where you notice
  // somebody misbehaving, so it is also where showing them out belongs.
  const mine = group.owner === owner && !gone

  const remove = async (address: string) => {
    setBusy(true)
    try {
      await removeGroupMember(group.id, address)
      setRemoving(null)
      onRefreshDetail()
      toast.success(t("room.removed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("room.removeFailed"))
    } finally {
      setBusy(false)
    }
  }
  const [attaching, setAttaching] = useState(false)
  const [sharing, setSharing] = useState(false)

  /**
   * What the list looked like last render, so this one can tell which end grew.
   *
   * The first message's id is the tell: a new message at the bottom leaves it
   * alone, and a page of older ones spliced in above replaces it.
   */
  const anchor = useRef<{ first?: string; last?: string; count: number; height: number }>({
    count: 0,
    height: 0,
  })

  /**
   * Whether the reader is at the end of the room.
   *
   * Read on scroll rather than when it is needed, because the thing that needs
   * it — the resize below — is told after the size has already changed, and by
   * then the old position cannot be worked out.
   */
  const atEnd = useRef(true)
  /** When this component last moved the list itself. See [`watchEnd`]. */
  const moved = useRef(0)

  /**
   * Put the end of the room on screen.
   *
   * `scrollTop` rather than `scrollIntoView` on the last element: this is the
   * one instruction that cannot land short. The sentinel has to have been laid
   * out for the browser to know where to put it, and the whole difficulty here
   * is the moments when the layout is still moving.
   */
  const goToEnd = useCallback(() => {
    const element = scroller.current
    if (!element) return
    moved.current = Date.now()
    atEnd.current = true
    element.scrollTop = element.scrollHeight
  }, [])

  const watchEnd = () => {
    const element = scroller.current
    if (!element) return
    // Ours, not a reader's. Every jump above raises a scroll event that looks
    // exactly like a finger, and reading one as "they have moved away" switches
    // off the correction below — which is the only thing that would have put a
    // short landing right. That is what made this flaky rather than broken: it
    // depended on which scroll was believed first.
    if (Date.now() - moved.current < 200) return
    atEnd.current = element.scrollHeight - element.clientHeight - element.scrollTop < 32
  }

  /**
   * Follow the bottom, unless the list grew at the top.
   *
   * Older messages arriving above the viewport must not move what is under the
   * reader's eye. The list gets taller by exactly their height, so scrolling
   * down by that much leaves the same message exactly where it was — the page
   * appears above, out of sight, which is what scrolling up into it should
   * feel like.
   *
   * A layout effect because it has to happen in the same frame the messages
   * were painted in. As a plain effect the browser shows one frame of the list
   * jumped to the wrong place before this corrects it.
   */
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const first = messages[0]?.id
    const last = messages[messages.length - 1]?.id
    const before = anchor.current
    // Past the padding, because a held pull *is* padding: measuring the raw
    // scroll height would count the gap the finger is holding open as content
    // that had arrived, and the list would settle that much out of place.
    const height = element.scrollHeight - parseFloat(getComputedStyle(element).paddingTop || "0")
    anchor.current = { first, last, count: messages.length, height }

    // A page of older messages: the list grew, its *end* did not move, and its
    // start did. Both halves matter — opening a different room also replaces
    // the first message, and that one should land at the bottom like any other
    // room rather than holding a position from the room before it.
    const prepended =
      messages.length > before.count && last === before.last && first !== before.first
    if (prepended) {
      element.scrollTop += height - before.height
      return
    }

    // Nothing actually arrived — a re-render with the same messages, which
    // happens on the render right after a page is merged. Leave the scroll
    // where the reader put it: following the bottom here is what undid the
    // anchoring a frame after it was applied.
    if (messages.length === before.count && last === before.last) return

    goToEnd()
  }, [messages, goToEnd])

  /**
   * Follow the bottom when the list is resized — a keyboard opening, a window
   * changing shape — but only for a reader who was already there.
   *
   * Two corrections, both of which showed up as the room jumping to the newest
   * message. The box: this list's height is settled by flex, so opening a pull
   * gap with padding *shrinks* its content box, and watching that box made the
   * gesture fire the very thing it was supposed to avoid. The guard: somebody
   * scrolled up into the room's past is reading it, and a keyboard appearing is
   * not a reason to take them back to the present.
   */
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(() => {
      if (!atEnd.current) return
      goToEnd()
    })
    observer.observe(element, { box: "border-box" })
    // And the content, which is the half the box misses. The scroller is sized
    // by flex, so it does not move when the list inside it gets taller — a link
    // card finishing its lookup, a typeface swapping in — and a reader sitting
    // at the end is left short of it having done nothing. Its own box, not the
    // scroller's content box, so the gap a pull holds open is still not counted
    // as content that arrived.
    if (content.current) observer.observe(content.current, { box: "border-box" })
    return () => observer.disconnect()
  }, [goToEnd])

  /**
   * Pull the top of the room down to reach further back.
   *
   * The same gesture the inbox refreshes on, asked of the same hook, because it
   * is the same thing: hold the top of a list down and it fetches. Loading on
   * approach instead — anywhere within a few hundred pixels of the top — fires
   * while somebody is still reading, which is a page arriving unasked and the
   * list growing under them.
   */
  const pullEarlier = usePullToRefresh(
    scrollerEl,
    () => {
      if (hasEarlier && !loadingEarlier) onLoadEarlier?.()
    },
    // Wheel too, so a pointer has the same gesture rather than a rule of its
    // own. Reaching the top used to be enough on its own, and that is not a
    // thing anybody does on purpose: a flick that runs out of list, or a
    // trackpad overshooting, both fetched a page nobody asked for.
    { wheel: true },
  )

  /** The message a held finger has opened the menu on. */
  const [held, setHeld] = useState<Message | null>(null)
  /** What the next message answers, until it is sent or dropped. */
  const [answering, setAnswering] = useState<Quote | null>(null)
  /** A message just jumped to, marked for a moment so the eye can find it. */
  const [landed, setLanded] = useState<string | null>(null)
  /**
   * Where each message was drawn, so one can be scrolled back to.
   *
   * Keyed off `data-said` rather than a closure per message, which would detach
   * and reattach every row on every render. Rows that have gone leave an entry
   * behind pointing at a node no longer in the page — cheap, and `isConnected`
   * is what the jump checks anyway.
   */
  const rows = useRef(new Map<string, HTMLElement>())
  const holdRow = useCallback((node: HTMLDivElement | null) => {
    const id = node?.dataset.said
    if (id) rows.current.set(id, node)
  }, [])

  /**
   * Go to the message a reply answers.
   *
   * By id and by nothing else. Matching on the quoted words would look like it
   * worked and be quietly wrong wherever two messages read alike — the same
   * thing said twice, a card whose summary reads differently in another
   * language, a mention two devices know by different names. An id is right or
   * it is missing, and missing is a thing that can be said out loud.
   *
   * It misses when the room has not pulled back far enough to hold the original
   * yet, which is the ordinary case and worth a word rather than a tap that
   * appears to do nothing.
   */
  const jumpTo = (from: Message) => {
    const { quote } = unquote(from.body)
    if (!quote?.id) return
    const found = shown.find((message) => tagOf(message.id) === quote.id)
    const node = found && rows.current.get(found.id)
    if (!found || !node?.isConnected) {
      toast(t("room.quotedNotHere"))
      return
    }
    node.scrollIntoView({ block: "center", behavior: "smooth" })
    setLanded(found.id)
    window.setTimeout(() => setLanded((held) => (held === found.id ? null : held)), 1600)
  }

  // Dropped on the way out of a room. This screen is not remounted between
  // rooms, so without it an answer begun in one would be waiting in the next,
  // quoting somebody who is not in it.
  useEffect(() => setAnswering(null), [group.id])
  const holding = useRef<number | undefined>(undefined)

  /**
   * Whether this message is still yours to take back.
   *
   * Three conditions, and the relay checks all three again — this only decides
   * whether to offer the thing. A message still on its way has no name at the
   * relay yet, which is why the id has to have been settled.
   */
  const isMine = (message: Message) =>
    message.direction === "out" &&
    message.status === "sent" &&
    // Nothing to delete at the relay until it has said what it calls this.
    message.id.startsWith("relay:")

  /** …and the room's window has not closed on it. */
  const inWindow = (message: Message) =>
    group.delete_window_secs > 0 &&
    Date.now() - Date.parse(message.at) < group.delete_window_secs * 1000

  /**
   * Answer a message: hold on to what it said, for the composer to send with
   * whatever is written next.
   *
   * The author is the name they *publish*, never the one you gave them —
   * `lib/names` promises a private name stays on this device, and a quote goes
   * to everybody in the room. `preview` does the rest, so answering a payment
   * or a gift quotes what it was rather than a line of JSON.
   */
  const answer = (message: Message) => {
    setHeld(null)
    const who = message.direction === "out" ? owner : message.peer
    setAnswering({
      author: givenNameIn(names, who) ?? shortenAddress(who),
      said: preview(message.body, "in"),
      id: tagOf(message.id),
    })
  }

  const copy = async (message: Message) => {
    setHeld(null)
    if (await copyText(message.body)) toast.success(t("room.messageCopied"))
  }

  /** Where the press began, so a drag can be told from a hold. */
  const pressed = useRef<{ x: number; y: number } | null>(null)
  /** The hold went off, so the click that ends it is not a tap. */
  const fired = useRef(false)

  /**
   * Long press, which is the only way into a menu on a touch screen — a bubble
   * has no room for a button, and a room full of them would have nothing else.
   * A mouse gets the dots instead, so this arms for touch alone.
   *
   * A drag calls it off, because the same finger scrolls the list. Judged
   * against a threshold rather than any movement at all: a finger is never
   * still, and cancelling on the first stray pixel made the gesture nearly
   * impossible to complete on a real screen.
   */
  const HOLD_SLOP_PX = 10

  /**
   * Open the menu for a message, leaving nothing selected behind it.
   *
   * Belt and braces: `selectable={false}` stops a selection starting, but a
   * press that began on something else — a name, a timestamp — can still leave
   * a range highlighted underneath the sheet.
   */
  const openFor = (message: Message) => {
    document.getSelection()?.removeAllRanges()
    setHeld(message)
  }

  /**
   * Begin a press-and-hold, which on release must not also read as a tap.
   *
   * Touch only, as it has been: on a pointer the browser starts selecting long
   * before a timer could fire, and every gesture here has something of its own
   * on a wide window — the message menu has its `⋮`, and a face has a click.
   */
  const holdStart = (
    fire: () => void,
    at: { clientX: number; clientY: number; button: number; pointerType: string },
  ) => {
    if (at.pointerType !== "touch" || at.button !== 0) return
    pressed.current = { x: at.clientX, y: at.clientY }
    window.clearTimeout(holding.current)
    fired.current = false
    holding.current = window.setTimeout(() => {
      fired.current = true
      fire()
    }, 500)
  }

  /**
   * Wrap a tap so that it does nothing when the hold already went off.
   *
   * A long press ends in a click like any other press, and without this a face
   * held down would put the name in the box *and* open the sheet over it.
   */
  const onTap = (act: () => void) => () => {
    if (fired.current) {
      fired.current = false
      return
    }
    act()
  }

  /** Name somebody in whatever is half-written, rather than opening them. */
  const nameInBox = (address: string) => {
    document.getSelection()?.removeAllRanges()
    composer.current?.mention(address)
  }

  const holdMove = (at: { clientX: number; clientY: number }) => {
    const from = pressed.current
    if (!from) return
    if (Math.abs(at.clientX - from.x) > HOLD_SLOP_PX || Math.abs(at.clientY - from.y) > HOLD_SLOP_PX) {
      holdCancel()
    }
  }

  const holdCancel = () => {
    window.clearTimeout(holding.current)
    pressed.current = null
  }

  const takeBack = async (message: Message) => {
    setHeld(null)
    try {
      await deleteSaid(group.id, message.id.replace(/^relay:/, ""))
      onForget([message.id.replace(/^relay:/, "")])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("room.deleteMessageFailed"))
    }
  }

  /**
   * The room, with reactions taken out of it and put on what they answered.
   *
   * Every reaction is a message — see `lib/reactions` — so this is where a room
   * stops being what arrived and becomes what is read.
   */
  const { shown, on } = useMemo(() => fold(messages, owner), [messages, owner])

  /** What this device reaches for, most recent first. */
  const { reactions: recent } = usePrefs()
  /** The message an emoji is being picked for, past the row's six. */
  const [picking, setPicking] = useState<Message | null>(null)
  /** The emoji whose people are being asked about. */
  const [reactors, setReactors] = useState<Reacted | null>(null)
  /**
   * The message the menu is about, kept while the menu is leaving.
   *
   * Its rows are built from this, and a sheet whose rows vanish the moment it
   * is dismissed spends its exit animation empty — which reads as lag.
   */
  const menuFor = useLast(held)

  /** Put one on, or take yours off by naming the one you already gave. */
  const react = (message: Message, emoji: string) => {
    const tag = tagOf(message.id)
    if (!tag) return
    // Remembered whichever way it went: taking one off is still a sign of
    // which emoji this hand reaches for.
    savePrefs({ reactions: remember(recent, emoji) })
    // The whole of what you have on it once this lands, not the one thing you
    // just touched — so a second emoji joins the first rather than replacing it.
    onSay(encode(reaction(tag, toggled(mineAmong(on.get(message.id)), emoji))))
  }

  const groups = useMemo(() => groupByDay(shown), [shown])
  // The room, not the handful of members the details carry — those are capped
  // at ten and would have a room of thousands calling itself ten.
  const memberCount = detail?.member_count ?? detail?.members.length ?? 0

  /**
   * Whose faces the room's mark is drawn from.
   *
   * `detail` is cleared and refetched every time a room is opened, so waiting
   * on it meant the mark spent a round trip as the fallback glyph and then
   * changed — on the header and, in an empty room, on the mark in the middle of
   * the screen. The list that was on screen a moment ago had already drawn it,
   * from exactly this: `Group.members` and `GroupDetail.members` are both the
   * earliest few, so the fallback is the same picture and not an approximation
   * of it.
   *
   * `??` rather than `||`: once details land, an empty list is an answer — you
   * are not in this room and it has no faces to show — and must not fall back
   * to the membership the list remembered from when you were.
   */
  const faces = detail?.members ?? group.members

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        {/* Sized with the one-to-one header in conversation.tsx — the two sit
            at the same depth in the app and a room reading as the smaller of
            them would be a difference that means nothing. */}
        <div className="flex items-center gap-2 px-1.5 py-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label={t("room.back")}
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

          <GroupAvatar size="sm" icon={group.icon} members={faces} className="size-9" />

          <button
            type="button"
            onClick={showDetails}
            aria-label={t("room.details")}
            className="min-w-0 flex-1 px-1 text-left active:opacity-60"
          >
            <p className="truncate text-[17px] leading-tight font-semibold">{group.name}</p>
            <p className="text-muted-foreground truncate text-[12px]">
              {memberCount === 0
                ? t("room.tapForDetails")
                : memberCount === 1
                  ? t("room.justYou")
                  : t("room.memberCount", { count: memberCount })}
            </p>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={showDetails}
            aria-label={t("room.details")}
            className="size-11 shrink-0 rounded-full"
          >
            <Info className="size-6" />
          </Button>
        </div>
      </header>

      {/* The spinner floats over the list rather than sitting in it, and that
          is load-bearing rather than decorative. Anchoring a page of older
          messages works by how much taller the list got; a spinner inside it
          is counted in that height when it appears and gone when the delta is
          applied, and the view slides by exactly its size. Out of the flow it
          cannot be counted at all. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* Only where the pull's own mark is not already saying it. A trackpad
            reaching the top opens no gap, so it needs something of its own. */}
        {loadingEarlier && !pullEarlier.refreshing && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center">
            <span className="bg-card rounded-full p-1.5 shadow-sm">
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            </span>
          </div>
        )}

        <div
          ref={holdScroller}
          onScroll={watchEnd}
          className="scrollbar-none relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
          style={{
            // The gap the pull opens, as padding on the scroller — the same
            // shape the inbox uses, and for the same reason.
            paddingTop: pullEarlier.distance || undefined,
            // Nothing while a finger is on it: the gap is the finger's to move.
            transition: pullEarlier.dragging
              ? undefined
              : "padding-top 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        >
          <PullIndicator pull={pullEarlier} />
          {/* Everything that makes the list tall, in one box that can be
              measured. The scroller cannot: it is sized by flex, so its own
              height does not move when its content grows — a link card
              arriving, a typeface swapping in — and a reader sitting at the
              end would be left short of it with nothing to notice. */}
          <div ref={content}>
            {messages.length === 0 && (
              <RoomIntro group={group} members={faces} canPull={hasEarlier} />
            )}

            {groups.map((day) => (
              <section key={day.label} className="mb-1">
                {/* Sized and spaced with the one-to-one thread's separator, and
                    scrolling away like it — see the note there. */}
                <div className="my-3 flex justify-center">
                  <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium">
                    {day.label}
                  </span>
                </div>
                <div className="space-y-2">
                  {day.messages.map((message, index) => {
                    const stamped = carriesTime(message, day.messages[index + 1])
                    if (message.direction !== "in") {
                      // The same row the incoming messages get: face in the left
                      // gutter, name above, only the bubble sitting on its own
                      // side. A room is read down its faces, and a turn of yours
                      // was the one break in that column.
                      const opens = opensTurn(day.messages[index - 1], message)
                      return (
                        <div
                          key={message.id}
                          ref={holdRow}
                          data-said={message.id}
                          className={cn(
                            "flex items-start gap-2 rounded-2xl transition-shadow",
                            // Long enough to catch the eye after a scroll, and gone on
                            // its own: a mark that stayed would become a second kind of
                            // message.
                            landed === message.id && "ring-primary/40 ring-2",
                          )}
                        >
                          <div className="w-8 shrink-0">
                            {opens && (
                              <button
                                type="button"
                                onClick={() => setShowing(owner)}
                                aria-label={t("room.aboutYou")}
                                className="block active:opacity-60"
                              >
                                <AddressAvatar address={owner} size="sm" />
                              </button>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {opens && (
                              <button
                                type="button"
                                onClick={() => setShowing(owner)}
                                className="text-muted-foreground mb-0.5 ml-1 block max-w-full truncate text-[13px] font-semibold"
                              >
                                You
                              </button>
                            )}
                            <div
                              className="group/msg relative flex items-start"
                              // The browser's own long press is a text selection
                              // and, on iOS, a Copy/Share callout over the top of
                              // it. Both arrive before a 500ms timer can, so the
                              // gesture has to be claimed rather than shared.
                              onPointerDown={(event) => holdStart(() => openFor(message), event)}
                              onContextMenu={(event) => {
                                // The pointer's way to the hold. Its own menu
                                // is refused because ours is the one with
                                // anything in it — and Copy, the only thing the
                                // browser's would have offered, is already a
                                // row of ours.
                                event.preventDefault()
                                openFor(message)
                              }}
                              onPointerMove={holdMove}
                              onPointerUp={holdCancel}
                              onPointerCancel={holdCancel}
                              onPointerLeave={holdCancel}
                            >
                              {/* `flex-1`, not merely `min-w-0`: the bubble sizes
                                  itself to a share of whatever it sits in, so a
                                  wrapper that shrinks to its own content makes a
                                  short line wrap for no reason. */}
                              <div className="min-w-0 flex-1 [-webkit-touch-callout:none] select-none">
                                <MessageBubble
                                  message={message}
                                  onRetry={onRetrySay}
                                  onOpenInvite={onOpenInvite}
                                  onOpenContact={onOpenContact}
                                  onOpenCode={onOpenCode}
                                  onOpenMention={setShowing}
                                  onOpenQuote={() => jumpTo(message)}
                                  reactions={on.get(message.id)}
                                  onReact={(emoji) => react(message, emoji)}
                                  onShowReactors={setReactors}
                                  channelOpen
                                  owner={owner}
                                  stamped={stamped}
                                  selectable={false}
                                />
                              </div>

                              {/* Beside the bubble on a pointer, where a finger
                                  has a long press instead. Hidden until the row
                                  is hovered, and only on a wide window: a control
                                  that is always there would sit on every message
                                  in the room. */}
                              <button
                                type="button"
                                onClick={() => openFor(message)}
                                aria-label={t("room.messageMenu")}
                                // Laid over the gutter the bubble's own 92% cap
                                // leaves, rather than taking a place in the row:
                                // a control that appears on hover must not move
                                // the thing it appeared next to.
                                className={cn(
                                  "text-muted-foreground hover:bg-muted hover:text-foreground",
                                  "absolute top-1 right-0 hidden rounded-lg p-1 opacity-0 transition-opacity lg:block",
                                  "focus-visible:opacity-100 group-hover/msg:opacity-100",
                                )}
                              >
                                <MoreVertical className="size-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    const opens = opensTurn(day.messages[index - 1], message)
                    const who = labelIn(names, message.peer)
                    return (
                      <div
                        key={message.id}
                        ref={holdRow}
                        data-said={message.id}
                        className={cn(
                          "flex items-start gap-2 rounded-2xl transition-shadow",
                          // Long enough to catch the eye after a scroll, and gone on
                          // its own: a mark that stayed would become a second kind of
                          // message.
                          landed === message.id && "ring-primary/40 ring-2",
                        )}
                      >
                        {/* A gutter, held open for the whole run rather than only
                            where the face is drawn: without it the rest of what
                            somebody says steps left out from under them. */}
                        <div className="w-8 shrink-0">
                          {opens && (
                            <button
                              type="button"
                              onClick={onTap(() => setShowing(message.peer))}
                              onPointerDown={(event) =>
                                holdStart(() => nameInBox(message.peer), event)
                              }
                              onPointerMove={holdMove}
                              onPointerUp={holdCancel}
                              onPointerCancel={holdCancel}
                              onPointerLeave={holdCancel}
                              aria-label={`About ${who}`}
                              className="block active:opacity-60"
                            >
                              <AddressAvatar address={message.peer} size="sm" />
                            </button>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {/* Who spoke, over their first bubble. A face is the thing
                              a room is read by at a glance, so the name no longer
                              has to repeat itself down a run to carry that. */}
                          {opens && (
                            <button
                              type="button"
                              onClick={onTap(() => setShowing(message.peer))}
                              onPointerDown={(event) =>
                                holdStart(() => nameInBox(message.peer), event)
                              }
                              onPointerMove={holdMove}
                              onPointerUp={holdCancel}
                              onPointerCancel={holdCancel}
                              onPointerLeave={holdCancel}
                              // A held name must not also become a selection with a
                              // Copy / Look Up callout over whatever opens next —
                              // the same reason a message bubble gives up its own.
                              className="text-muted-foreground mb-0.5 ml-1 block max-w-full truncate text-[13px] font-semibold select-none [-webkit-touch-callout:none]"
                            >
                              {who}
                            </button>
                          )}
                          {/* The same gesture a message of your own has, and now
                              for the same reason: there is something to do with
                              somebody else's message too. Answering it, and
                              copying it — never deleting it, which stays the
                              author's to do. */}
                          <div
                            className="group/msg relative flex items-start"
                            onPointerDown={(event) => holdStart(() => openFor(message), event)}
                            onContextMenu={(event) => {
                              // The pointer's way to the hold. Its own menu is
                              // refused because ours is the one with anything
                              // in it — and Copy, the only thing the browser's
                              // would have offered, is already a row of ours.
                              event.preventDefault()
                              openFor(message)
                            }}
                            onPointerMove={holdMove}
                            onPointerUp={holdCancel}
                            onPointerCancel={holdCancel}
                            onPointerLeave={holdCancel}
                          >
                            <div className="min-w-0 flex-1 [-webkit-touch-callout:none] select-none">
                              <MessageBubble
                                message={message}
                                onRetry={onRetrySay}
                                onOpenInvite={onOpenInvite}
                                onOpenContact={onOpenContact}
                                onOpenCode={onOpenCode}
                                onOpenMention={setShowing}
                                onOpenQuote={() => jumpTo(message)}
                                reactions={on.get(message.id)}
                                onReact={(emoji) => react(message, emoji)}
                                onShowReactors={setReactors}
                                channelOpen
                                owner={owner}
                                stamped={stamped}
                                // The press is the room's now, so the browser's own
                                // long press — a selection, and on iOS a callout over
                                // whatever opens next — has to stand aside. Copy moved
                                // into the menu in exchange.
                                selectable={false}
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => openFor(message)}
                              aria-label={t("room.messageMenu")}
                              className={cn(
                                "text-muted-foreground hover:bg-muted hover:text-foreground",
                                "absolute top-1 right-0 hidden rounded-lg p-1 opacity-0 transition-opacity lg:block",
                                "focus-visible:opacity-100 group-hover/msg:opacity-100",
                              )}
                            >
                              <MoreVertical className="size-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
            <div ref={bottom} />
          </div>
        </div>
      </div>

      {member ? (
        <Composer
          ref={composer}
          onSend={(body) => {
            onSay(body)
            setAnswering(null)
          }}
          onAttach={() => setAttaching(true)}
          onMentionSearch={searchMembers}
          replyingTo={answering}
          onCancelReply={() => setAnswering(null)}
        />
      ) : (
        /* Read-only rather than gone: what was said is still yours to read, and
           a composer that cannot send is worse than none. Two ways to end up
           here and they are not the same — one room carried on without you, the
           other stopped existing. */
        <div className="bg-background/85 border-t backdrop-blur-xl">
          <p className="text-muted-foreground flex items-center justify-center gap-2 px-5 py-4 text-[13px]">
            <DoorClosed className="size-4 shrink-0" />
            {gone
              ? t("room.disbanded")
              : t("room.notIn")}
          </p>
          <div className="pb-safe" />
        </div>
      )}

      {/* What a held finger opens on your own message. One row today; edit is
          meant to join it, and a menu has somewhere to put a second thing where
          a gesture that does exactly one does not. */}
      <AttachMenu
        open={held !== null}
        onOpenChange={(open) => !open && setHeld(null)}
        title={t("room.messageMenu")}
        actions={
          menuFor
            ? [
                {
                  icon: Reply,
                  label: t("room.replyMessage"),
                  description: t("room.replyMessageNote"),
                  onSelect: () => answer(menuFor),
                },
                {
                  icon: Copy,
                  label: t("room.copyMessage"),
                  description: t("room.copyMessageNote"),
                  onSelect: () => void copy(menuFor),
                },
                // Absent rather than greyed out when the room's window has
                // closed — this menu lists what can be done, and Copy is what
                // keeps it worth opening when Delete cannot be.
                ...(isMine(menuFor) && inWindow(menuFor)
                  ? [
                      {
                        icon: Trash2,
                        label: t("room.deleteMessage"),
                        description: t("room.deleteMessageNote"),
                        tone: "destructive" as const,
                        onSelect: () => void takeBack(menuFor),
                      },
                    ]
                  : []),
              ]
            : []
        }
        reactions={
          menuFor && tagOf(menuFor.id)
            ? offered(recent).map((emoji) => ({ emoji, mine: mineOn(on.get(menuFor.id), emoji) }))
            : undefined
        }
        onReact={(emoji) => menuFor && react(menuFor, emoji)}
        onMoreEmoji={menuFor && tagOf(menuFor.id) ? () => setPicking(menuFor) : undefined}
      />

      <ReactorsSheet
        reacted={reactors}
        you={owner}
        onOpenChange={(open) => !open && setReactors(null)}
      />

      <EmojiSheet
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        onPick={(emoji) => {
          if (picking) react(picking, emoji)
          setPicking(null)
        }}
      />

      <AttachMenu
        open={attaching}
        onOpenChange={setAttaching}
        actions={[
          {
            icon: GiftIcon,
            label: t("room.leaveGift"),
            description: t("room.leaveGiftNote"),
            onSelect: onGift,
          },
          {
            icon: UserRound,
            label: t("shareContact.action"),
            description: t("shareContact.actionNote"),
            onSelect: () => setSharing(true),
          },
        ]}
      />

      <PickContactSheet
        open={sharing}
        onOpenChange={setSharing}
        title={t("shareContact.title")}
        note={t("shareContact.note")}
        repeatable={false}
        onPick={onShareContact}
      />

      <MemberSheet
        address={showing}
        onOpenChange={(next) => !next && setShowing(null)}
        you={owner}
        roomOwner={group.owner}
        mine={mine}
        onCopy={(address) => {
          void copyText(address).then((ok) =>
            ok ? toast.success(t("room.addressCopied")) : toast.error(t("room.copyFailed")),
          )
        }}
        onOpenChat={(address) => {
          setShowing(null)
          onOpenChat(address)
        }}
        onRemove={(address) => {
          setShowing(null)
          setRemoving(address)
        }}
      />

      <RemoveMemberDialog
        address={removing}
        group={group}
        busy={busy}
        onOpenChange={(open) => !open && setRemoving(null)}
        onConfirm={(address) => void remove(address)}
      />

      <GroupSheet
        open={details}
        // Only ever called to close: opening goes through `showDetails`.
        onOpenChange={setDetails}
        group={group}
        detail={detail}
        gone={gone}
        owner={owner}
        onChanged={onRefreshDetail}
        // The same way out the back arrow uses: to whichever list this was
        // opened from, where the room is now missing.
        onDisbanded={onBack}
        onLeft={onLeft}
        onDeleteChat={onDeleteChat}
        onOpenChat={onOpenChat}
        onInvite={onInvite}
      />
    </div>
  )
}

function RoomIntro({
  group,
  members,
  /** Whether the room has a past that could still be asked for. */
  canPull,
}: {
  group: Group
  members?: string[]
  canPull?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <GroupAvatar size="lg" icon={group.icon} members={members} />
      <p className="mt-4 text-base font-semibold">{group.name}</p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        {t("room.emptyRoom")}
      </p>
      {/* Said only where it is true. A room that shares its past is not empty
          just because nothing has been fetched yet, and leaving the line above
          to stand alone would tell a new member that a room full of history had
          never been spoken in. "Look for" rather than "read", because whether
          there is anything back there is the room's answer to give, not ours. */}
      {canPull && (
        <p className="text-muted-foreground/80 mt-2 text-[13px] text-balance">
          {t("room.pullForEarlier")}
        </p>
      )}
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
