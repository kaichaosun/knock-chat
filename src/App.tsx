import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Link as LinkIcon, PanelLeftClose, PenLine, Plus, ScanLine, Users } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"

import { Conversation } from "@/components/conversation"
import { Inbox } from "@/components/inbox"
import { Contacts } from "@/components/contacts"
import { Groups } from "@/components/groups"
import { KnockRequests } from "@/components/knock-requests"
import { GroupRequests } from "@/components/group-requests"
import { JoinQueueSheet } from "@/components/join-queue-sheet"
import { KnockSheet } from "@/components/knock-sheet"
import { MemberSheet } from "@/components/member-sheet"
import { PullIndicator } from "@/components/pull-indicator"
import { ScanSheet } from "@/components/scan-sheet"
import { ProfileSheet } from "@/components/profile-sheet"
import { AttachMenu } from "@/components/attach-menu"
import { TabBar, type Tab } from "@/components/tab-bar"
import { Button } from "@/components/ui/button"
import { CreateGroupSheet } from "@/components/create-group-sheet"
import { GroupRoom } from "@/components/group-room"
import { NoThread } from "@/components/no-thread"
import { JoinByLinkSheet } from "@/components/join-by-link-sheet"
import { JoinGroupSheet } from "@/components/join-group-sheet"
import { SendGiftSheet } from "@/components/send-gift-sheet"
import { useContacts } from "@/hooks/use-contacts"
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh"
import { useGroups } from "@/hooks/use-groups"
import { useWide } from "@/hooks/use-wide"
import { useJoinRequests } from "@/hooks/use-join-requests"
import { useKnocks } from "@/hooks/use-knocks"
import { usePrefs } from "@/hooks/use-prefs"
import { useRooms } from "@/hooks/use-rooms"
import { useMessages } from "@/hooks/use-messages"
import { useNames } from "@/hooks/use-names"
import { useWallet } from "@/hooks/use-wallet"
import { compact } from "@/lib/address"
import { readCode, type Code } from "@/lib/knock-code"
import { copyText } from "@/lib/clipboard"
import { haveStoredSession } from "@/lib/auth"
import { toHex } from "@/lib/crypto"
import { reason } from "@/lib/reason"
import { SIDEBAR_SHORTCUT_KEYS, SIDEBAR_SHORTCUT_LABEL } from "@/lib/shortcuts"
import { cn } from "@/lib/utils"
import { AlreadyPaidError, fundGift } from "@/lib/gift-funding"
import { all as outstandingGifts, drop as dropGiftReceipt, keep as keepGiftReceipt } from "@/lib/gift-receipts"
import { messageId, withRooms, type Message } from "@/lib/messages"
import { adopt as adoptNames, givenNameIn, rememberOne } from "@/lib/names"
import { adopt as adoptPins, unpin } from "@/lib/pins"
import {
  adopt as adoptRooms,
  forget as forgetRoom,
  markGone as markRoomGone,
  remember as rememberRooms,
  roomIn,
} from "@/lib/rooms"
import type { Receipt } from "@/lib/receipts"
import { contactNote, encode as encodePayload, giftNote, invite, payment } from "@/lib/payload"
import { commitment, formatNim, newNonce } from "@/lib/postage"
import { forgetPeerKey, NoKeyError } from "@/lib/keys"
import { deviceKeyPair } from "@/lib/keys"
import {
  RelayError,
  getGiftTerms,
  type GiftTerms,
  type Group,
  type GroupDetail,
  type Reachability,
} from "@/lib/relay"
import { devIdentities } from "@/lib/wallet"
import { WelcomeScreen, type WelcomeStatus } from "@/components/welcome-screen"
import { useRoomHistory } from "@/hooks/use-room-history"
import { useSession } from "@/hooks/use-session"
import { ProbeScreen } from "@/probe/probe-screen"
import { probeRequested, useSecretTap } from "@/probe/entry"


export default function App() {
  // Diagnostics are never linked from the app. Reachable by `?probe`, `#probe`
  // or `/probe`, and — because whether the host preserves any of those is one of
  // the open questions — by tapping the inbox title five times.
  const [showProbes, setShowProbes] = useState(probeRequested)

  if (showProbes) return <ProbeScreen />
  return <Messenger onRevealProbes={() => setShowProbes(true)} />
}

/** How long to wait before re-asking whether a shut thread has opened, per attempt. */
const REACH_BACKOFF_MS = [10_000, 20_000, 40_000, 80_000]

function Messenger({ onRevealProbes }: { onRevealProbes: () => void }) {
  const { t } = useTranslation()
  const names = useNames()
  const revealProbes = useSecretTap(onRevealProbes)
  const { state, retry } = useWallet()
  const wallet = state.status === "connected" ? state.wallet : null
  /** Whether the window can hold the list and a thread at the same time. */
  const wide = useWide()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // The desktop list is useful context, but it should not have to keep a third
  // of the window when the conversation needs the room. This is deliberately
  // global, including while writing: Command/Ctrl+Backslash is a layout
  // command rather than text intended for the composer.
  useEffect(() => {
    if (!wide) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.metaKey && !event.ctrlKey) || event.key !== "\\" || event.repeat) return
      event.preventDefault()
      setSidebarOpen((open) => !open)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [wide])

  const session = useSession(wallet)
  // Only poll once there is a session; the relay would answer 401 otherwise.
  const owner = session.state.status === "active" ? session.state.session.address : null

  // This device's private half, needed to open incoming mail and seal outgoing.
  const deviceSecretKey = useMemo(
    () => (wallet ? deviceKeyPair(wallet.scope).secretKey : null),
    [wallet],
  )

  const {
    conversations,
    threadWith,
    send,
    retry: retrySend,
    markRead,
    deleteThread,
    recordOutgoing,
    absorbHistory,
    settle,
    setStatus,
    resend,
    dismissed,
    relayStatus,
    refresh: refreshMessages,
  } = useMessages(owner, deviceSecretKey, session.invalidate)

  /**
   * A knock that was paid for earlier and has only now got through.
   *
   * Recorded here rather than in the hook because the sender's history lives
   * here — and without this the knock would go out leaving no trace of itself
   * on the device that sent it.
   */
  const onKnockRedeemed = useCallback(
    (receipt: Receipt, sent: { id: string }) => {
      recordOutgoing(receipt.peer, receipt.body, `knock:${sent.id}`)
      toast.success(t("app.paymentConfirmed"))
    },
    [recordOutgoing],
  )

  const { knocks, sent, reach, knock, accept, decline, held, refresh: refreshKnocks } = useKnocks(
    wallet,
    owner,
    onKnockRedeemed,
  )
  const {
    groups,
    waiting,
    loading: groupsLoading,
    refresh: refreshGroups,
    inspect,
    create,
    join,
    say,
  } = useGroups(wallet, owner)

  // Who is at the doors of the rooms you own, and answering them. Driven by the
  // counts the room list carries, so it asks about a door only when somebody is
  // at it.
  const { queues, answer: answerJoin } = useJoinRequests(waiting)
  /** The room whose queue is open, if any. */
  const [queueFor, setQueueFor] = useState<string | null>(null)

  // Declared up here rather than with the rest of the screen's state, because
  // the contacts below take it: which tab is showing decides when that list is
  // worth asking about.
  const [tab, setTab] = useState<Tab>("chats")

  // Above the tab switch, so leaving Contacts does not throw the list away and
  // make every return a cold start. The rooms above already worked this way.
  const {
    contacts,
    setContacts,
    error: contactsError,
    refresh: refreshContacts,
  } = useContacts(Boolean(owner), owner, tab === "contacts")

  /**
   * What this device knows about rooms, including ones the relay has stopped
   * describing. A disbanded room leaves its conversation behind; without this
   * the thread would have no name and nothing to open.
   */
  const rooms = useRooms()
  useEffect(() => rememberRooms(groups), [groups])

  const [openPeer, setOpenPeer] = useState<string | null>(null)
  const [knocking, setKnocking] = useState(false)
  // Set when knocking on a door we already know, so the sheet fixes the address
  // instead of asking for it. Null for the ordinary compose flow.
  const [knockPeer, setKnockPeer] = useState<string | null>(null)
  /** Whether the sheet was opened to reopen a chat, rather than to start one. */
  const [reopening, setReopening] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  /** Whether the list under the header has been scrolled off its top. */
  const [scrolled, setScrolled] = useState(false)
  // The scrolling list, held as state rather than in a ref: it is mounted and
  // unmounted as chats are opened and closed, and the pull gesture has to be
  // bound to whichever element is on the page now.
  const [list, setList] = useState<HTMLDivElement | null>(null)

  // Pulling the list down reads whatever it is showing. Every tab has its own
  // idea of what "again" means, and the one on screen is the only one being
  // asked about.
  const refreshTab = useCallback(async () => {
    if (tab === "contacts") await refreshContacts()
    else if (tab === "groups") await refreshGroups()
    else await Promise.all([refreshMessages(), refreshKnocks()])
  }, [tab, refreshContacts, refreshGroups, refreshMessages, refreshKnocks])

  const pull = usePullToRefresh(list, refreshTab)

  useEffect(() => {
    list?.scrollTo({ top: 0 })
    setScrolled(false)
  }, [tab, list])

  // A room is a thread like any other, but nothing a direct chat does applies
  // to it — no reachability, no knocking — so it is opened separately rather
  // than threaded through logic that would have to keep asking which it is.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [composing, setComposing] = useState(false)
  const { compose } = usePrefs()
  /** The two ways into a room, offered from the Groups tab's own plus. */
  const [addingGroup, setAddingGroup] = useState(false)
  /** A room a link pointed at, waiting to be joined. */
  const [invited, setInvited] = useState<Group | null>(null)
  /** Whether that room has room. Kept beside it, since only the door view says. */
  const [invitedFull, setInvitedFull] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [pasting, setPasting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [gifting, setGifting] = useState(false)
  /**
   * The relay's terms for holding a gift, or null on a relay that holds none.
   *
   * Asked once: the funding address cannot be guessed, and a relay without a
   * wallet should show no gift controls at all rather than ones that fail.
   */
  const [giftTerms, setGiftTerms] = useState<GiftTerms | null>(null)

  useEffect(() => {
    if (!owner) return
    getGiftTerms()
      .then(setGiftTerms)
      .catch(() => setGiftTerms(null))
  }, [owner])

  /**
   * Whichever thread is open, if either is.
   *
   * A room and a chat are held separately because almost nothing a chat does
   * applies to a room — but a few things apply to *any* open thread, and those
   * belong here rather than being written twice and drifting. Both the back
   * gesture and marking-as-read were written for chats alone and had to be
   * found again once rooms existed.
   */
  const openThreadKey = openPeer ?? openGroup

  // Let the hardware/gesture back control leave a thread instead of the app.
  useEffect(() => {
    if (!openThreadKey) return
    window.history.pushState({ thread: openThreadKey }, "")
    const onPop = () => {
      setOpenPeer(null)
      setOpenGroup(null)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [openThreadKey])

  // Names are learnt per identity: switching to a development identity should
  // not inherit what the previous one had been told.
  useEffect(() => adoptNames(owner), [owner])
  useEffect(() => adoptPins(owner), [owner])
  useEffect(() => adoptRooms(owner), [owner])

  /**
   * Open a direct thread, leaving whatever room was open.
   *
   * A room is drawn in preference to a thread, so setting the peer without
   * closing the room changes nothing anyone can see — the thread waits behind
   * it until the room is backed out of.
   */
  const openThread = useCallback((peer: string) => {
    setOpenGroup(null)
    setOpenPeer(peer)
  }, [])

  /**
   * Open a room, leaving whatever thread was open.
   *
   * The mirror of [`openThread`], and needed for the same reason from the other
   * side: only one of the two is ever drawn, so leaving the other set leaves a
   * thread that is open as far as the state is concerned and invisible as far
   * as anyone can tell. Every way into a room goes through here, so that
   * "one thread at a time" is a fact about the state rather than a habit of
   * whoever wrote the call.
   */
  /**
   * Counts opens rather than naming rooms, so that opening the room already on
   * screen still registers as having happened. See `useRoomHistory`.
   */
  const [roomOpens, setRoomOpens] = useState(0)

  const openRoom = useCallback((group: string) => {
    setOpenPeer(null)
    setOpenGroup(group)
    setRoomOpens((count) => count + 1)
  }, [])

  // Opening a chat is the moment worth re-checking who you are writing to.
  // A cached key stays right until the peer signs in on another device, and
  // nothing announces when they do — so the next message would be sealed to a
  // key they no longer hold, and they would see it as unreadable with no way
  // to tell you. Keyed on `openPeer` rather than done at the call sites, so
  // every way into a thread is covered. Costs one fetch, and only if you then
  // write something.
  useEffect(() => {
    if (openPeer) forgetPeerKey(openPeer)
  }, [openPeer])

  /**
   * What the open room said before you got here, a page at a time.
   *
   * Only rooms whose owner shares their past have any, so an ordinary room
   * costs no request at all — the check is on the group already in hand.
   */
  const { hasEarlier, loadingEarlier, loadEarlier, forget: forgetHistory } = useRoomHistory(
    openGroup,
    Boolean(groups.find((group) => group.id === openGroup)?.share_history),
    absorbHistory,
    roomOpens,
  )

  /**
   * Delete a chat, and everything this session remembers about it.
   *
   * The two have to go together. `deleteThread` throws away the messages;
   * `forgetHistory` throws away the memory of having fetched them, which is
   * what would otherwise stop the room refetching and leave it opening empty
   * for the rest of the session. Wrapped rather than paired at each call site,
   * because there are four of those and a fifth would forget.
   */
  const deleteChat = useCallback(
    (thread: string) => {
      deleteThread(thread)
      forgetHistory(thread)
    },
    [deleteThread, forgetHistory],
  )

  /**
   * The chat list: threads that have messages, plus rooms that do not yet.
   *
   * A direct chat has nothing to show before somebody writes, but a room is a
   * place whether or not anyone has spoken — leaving it out until the first
   * message means creating one and watching it disappear.
   */
  const threads = useMemo(
    () => withRooms(conversations, groups, dismissed),
    [conversations, groups, dismissed],
  )

  /**
   * Open whichever kind of thread this key names.
   *
   * Membership cannot be the test. Being removed from a room takes it out of
   * `groups` while its thread stays right where it was, and treating that key
   * as an address means asking the relay about a uuid — which answers, truly
   * and uselessly, that it is the wrong length. What the thread is made of is
   * the thing that does not change.
   */
  const openAnyThread = useCallback(
    (thread: string) => {
      const isRoom =
        groups.some((group) => group.id === thread) ||
        threadWith(thread).some((message) => message.group === thread)
      if (isRoom) openRoom(thread)
      else openThread(thread)
    },
    [groups, threadWith, openRoom, openThread],
  )

  /**
   * Whether the relay says this room no longer exists.
   *
   * Only a 404 counts. Any other failure is a relay we could not reach, and
   * telling somebody their room was disbanded because their train went into a
   * tunnel would be worse than saying nothing.
   */
  const [roomGone, setRoomGone] = useState(false)

  const refreshGroupDetail = useCallback(async () => {
    if (!openGroup) return
    try {
      setGroupDetail(await inspect(openGroup))
      setRoomGone(false)
    } catch (error) {
      // The room still opens; only its member list is missing.
      if (error instanceof RelayError && error.status === 404) {
        setRoomGone(true)
        // Written down, so the chat list draws it as ended too rather than
        // inferring it from a membership list that cannot tell "ended" from
        // "you were removed".
        markRoomGone(openGroup)
      }
    }
  }, [openGroup, inspect])

  useEffect(() => {
    setGroupDetail(null)
    setRoomGone(false)
    void refreshGroupDetail()
  }, [openGroup, refreshGroupDetail])

  /**
   * Show the door a room id leads to.
   *
   * Looked up rather than joined on sight: what it costs has to be visible
   * before anyone pays it. One path whether the id came from the URL the app
   * was opened with or from something pasted in.
   */
  const openInvite = useCallback(
    (id: string) => {
      setPasting(false)
      setInviteOpen(true)
      setInviteLoading(true)
      setInvitedFull(false)
      inspect(id)
        .then((detail) => {
          setInvited(detail.group)
          setInvitedFull(detail.full ?? false)
        })
        .catch(() => {
          setInviteOpen(false)
          toast.error(t("app.badGroupLink"))
        })
        .finally(() => setInviteLoading(false))
    },
    [inspect],
  )

  /**
   * The one place a code turns into something happening.
   *
   * A room and a person are different doors, but a link, a paste and a scan
   * are not different ways of opening them — so they all arrive here, and
   * nothing that carries a code has to know what to do with one.
   */
  const openCode = useCallback(
    (code: Code) => {
      if (code.kind === "group") {
        openInvite(code.id)
        return
      }
      setPasting(false)
      setScanning(false)
      // Somebody you already have a thread with opens as a thread. The knock
      // sheet is for doors you have not been through — offering it for a chat
      // that is sitting right there asks you to pay for what you already have.
      if (threadWith(code.address).length > 0) {
        openThread(code.address)
        return
      }
      setKnockPeer(code.address)
      setReopening(false)
      setKnocking(true)
    },
    [openInvite, openThread, threadWith],
  )

  useEffect(() => {
    if (!owner) return
    const params = new URLSearchParams(window.location.search)
    const asked = params.get("group") ?? params.get("knock")
    if (!asked) return
    // Cleared straight away so a reload does not reopen the same door.
    const url = new URL(window.location.href)
    url.searchParams.delete("group")
    url.searchParams.delete("knock")
    window.history.replaceState({}, "", url)

    const code = readCode(asked)
    if (code) openCode(code)
    else toast.error(t("app.badLink"))
  }, [owner, openCode])

  // How the open thread stands with its peer. A channel can be closed from the
  // other side at any time, so this is asked on open rather than assumed from
  // the fact that a thread exists.
  const [openReach, setOpenReach] = useState<Reachability | null>(null)
  const refreshReach = useCallback(async () => {
    if (!openPeer) return
    try {
      const answer = await reach(openPeer)
      setOpenReach(answer)
      // This answer is about one address, so it can be believed about the
      // absence of a name too — unlike a list, which only speaks for the names
      // it happens to carry.
      rememberOne(openPeer, answer.name)
    } catch {
      // Leave it null: the composer stays in its ordinary mode, and a send that
      // turns out to be impossible is caught below.
    }
  }, [openPeer, reach])

  useEffect(() => {
    setOpenReach(null)
    void refreshReach()
  }, [openPeer, refreshReach])

  const openMessages = openPeer ? threadWith(openPeer) : []
  const roomMessages = openGroup ? threadWith(openGroup) : []

  // Accepting a knock delivers the message to the *recipient*, so the person who
  // knocked is told nothing at all when their door is opened, and their composer
  // would stay shut until they left the thread and came back. So ask — but on a
  // backoff, because this is a thing that changes once, if ever. A thread left
  // open settles at one call every eighty seconds rather than hammering the relay.
  const doorShut = openReach !== null && !openReach.channel_open
  const [reachAttempt, setReachAttempt] = useState(0)

  // Nothing is asked of a backgrounded app; coming back starts the backoff over.
  const [visible, setVisible] = useState(() => !document.hidden)
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden)
    document.addEventListener("visibilitychange", onChange)
    return () => document.removeEventListener("visibilitychange", onChange)
  }, [])

  useEffect(() => setReachAttempt(0), [openPeer, visible])

  useEffect(() => {
    if (!doorShut || !visible) return
    const delay = REACH_BACKOFF_MS[Math.min(reachAttempt, REACH_BACKOFF_MS.length - 1)]
    const timer = window.setTimeout(() => {
      void refreshReach()
      setReachAttempt((attempt) => attempt + 1)
    }, delay)
    return () => window.clearTimeout(timer)
  }, [doorShut, visible, reachAttempt, refreshReach])


  // Keep the open thread marked read as messages arrive, not only when it is
  // opened — otherwise anything that lands while you are reading stays unread
  // and the badge is waiting for you when you go back.
  useEffect(() => {
    if (openPeer) markRead(openPeer)
  }, [openPeer, openMessages.length, markRead])

  // And the same for a room. A separate effect because a room is opened
  // separately — the thing that made this easy to miss in the first place.
  useEffect(() => {
    if (openGroup) markRead(openGroup)
  }, [openGroup, roomMessages.length, markRead])

  /** Leave whichever thread is open. Used by both back buttons. */
  const closeThreadView = useCallback(() => {
    // Unwind the entry pushed above so back doesn't need two presses. Going
    // straight to the state instead would leave that entry behind, and the
    // next back press would spend itself on nothing.
    if (window.history.state?.thread) window.history.back()
    else {
      setOpenPeer(null)
      setOpenGroup(null)
    }
  }, [])

  const copy = useCallback(async (text: string) => {
    // Some WebViews simply will not give a page the clipboard. Say what to do
    // instead of reporting a failure the user can do nothing about.
    const ok = await copyText(text)
    toast[ok ? "success" : "info"](
      ok ? t("app.addressCopied") : t("app.copyFailed"),
    )
  }, [])

  const onSend = useCallback(
    async (body: string) => {
      if (!openPeer) return
      try {
        await send(openPeer, body)
      } catch (error) {
        // The channel can be closed while this thread is open, which is exactly
        // how a send arrives at a shut door. Re-ask, so the composer switches to
        // knocking instead of offering a retry that cannot work.
        if (error instanceof RelayError && error.status === 402) {
          await refreshReach()
          toast.error(t("app.chatClosed"))
          return
        }
        // Someone who has never opened Knock has published no key, so there is
        // nothing to encrypt to. Say that plainly instead of "failed to send".
        toast.error(
          error instanceof NoKeyError
            ? t("app.notJoined")
            : error instanceof Error
              ? error.message
              : t("app.sendFailed"),
        )
      }
    },
    [openPeer, send, refreshReach],
  )

  /**
   * Move NIM, then say so in the thread.
   *
   * Strictly in that order. The wallet either moved the money or it did not,
   * and the note is a record of that — writing it first would leave a card in
   * the thread for a payment the user went on to cancel. If the note fails to
   * send the money has still moved, which is why the toast says so rather than
   * reporting a failed payment.
   */
  const onPay = useCallback(
    async (peer: string, luna: number) => {
      if (!wallet?.pay) {
        throw new Error(t("app.needsPayForNim"))
      }
      // No commitment and no data: an ordinary transfer that happens to have
      // been started from a chat. A knock is the other thing.
      const reference = await wallet.pay({ recipient: peer, luna })
      try {
        await send(peer, encodePayload(payment(luna, reference)))
      } catch {
        toast.info(t("app.sentButNoNote", { amount: formatNim(luna) }))
        return
      }
      toast.success(t("app.sentNim", { amount: formatNim(luna) }))
    },
    [wallet, send],
  )

  /**
   * Bring somebody into the open room, through the chat you have with them.
   *
   * The invite rides inside the encrypted body like any other message, so the
   * relay never learns which room was shared — and because it *is* a message it
   * can only go where a channel already exists. A group cannot become a way to
   * reach somebody who has not let you in.
   */
  const onInviteToRoom = useCallback(
    async (peer: string) => {
      const room = groups.find((group) => group.id === openGroup)
      if (!room) return
      try {
        await send(peer, encodePayload(invite(room.id, room.name)))
        toast.success(t("app.inviteSent"))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("app.inviteFailed"))
      }
    },
    [groups, openGroup, send],
  )

  /**
   * Turn funding that has been paid for into a gift, and announce it.
   *
   * Everything after the payment lives here so the sweep can walk exactly the
   * same path as the sheet — there is one way to redeem funding, not two that
   * drift apart. The receipt is dropped at the precise point the money stops
   * being at risk: once the relay holds the gift, nothing below can lose it.
   */
  const placeGift = useCallback(
    async (
      mine: string,
      group: string,
      funding: {
        total_luna: number
        shares: number
        split: "even" | "random"
        note: string
        txHash: string
        nonce: string
      },
    ) => {
      const gift = await fundGift(group, {
        total_luna: funding.total_luna,
        shares: funding.shares,
        split: funding.split,
        note: funding.note,
        postage: { tx_hash: funding.txHash, nonce: funding.nonce },
      })
      dropGiftReceipt(mine, funding.txHash)

      // The card is a pointer at the pot, carrying only what cannot change.
      const card = encodePayload(giftNote(gift.id, gift.total_luna, gift.shares, gift.note))
      recordOutgoing(mine, card, `local:${messageId()}`, group)

      // The gift exists whether or not this lands. Saying it failed would be a
      // lie about where the money is, and would invite a second payment for a
      // pot that is already sitting there.
      try {
        await say(group, card)
      } catch {
        toast.error(t("app.giftNoCard"))
      }
    },
    [say, recordOutgoing],
  )

  // Funding that outlived the attempt meant to redeem it. Tried whenever the
  // app comes to the front, on the same principle as a knock's: the promise is
  // "once you have paid, the gift is placed" — not "…if you remember to come
  // back and tap again". Quiet on failure; the receipt is kept and the next
  // launch tries once more.
  const sweeping = useRef(false)
  useEffect(() => {
    if (!owner) return

    const sweep = async () => {
      if (!owner || sweeping.current) return
      sweeping.current = true
      try {
        for (const receipt of outstandingGifts(owner)) {
          try {
            await placeGift(owner, receipt.group, receipt)
            toast.success(t("app.giftPlaced"))
          } catch {
            // Still not redeemable. Kept for next time.
          }
        }
      } finally {
        sweeping.current = false
      }
    }

    void sweep()
    const onVisible = () => {
      if (!document.hidden) void sweep()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [owner, placeGift])

  /**
   * Leave a pot in the open room.
   *
   * Funded first and announced second. The relay verifies the transfer on chain
   * before it will hold anything, so the payment has to exist before the gift
   * does — and the card that appears in the room is only a pointer to it, which
   * is why it goes out afterwards rather than optimistically.
   */
  const onGift = useCallback(
    async (input: {
      total_luna: number
      shares: number
      split: "even" | "random"
      note: string
    }) => {
      if (!owner || !openGroup || !giftTerms) throw new Error("gifts aren't available here")
      if (!wallet?.pay) {
        throw new Error(t("app.needsPayForGift"))
      }

      const nonce = newNonce()
      const paid = await wallet.pay({
        recipient: giftTerms.fund_to,
        luna: input.total_luna,
        data: commitment(owner, nonce),
      })

      // Written down before the relay hears anything. From here the money has
      // left, and everything below can fail — so the nonce that redeems it has
      // to outlive this function. Paying again would mint a new one and strand
      // this payment for good.
      keepGiftReceipt(owner, {
        group: openGroup,
        ...input,
        txHash: paid,
        nonce: toHex(nonce),
      })

      try {
        await placeGift(owner, openGroup, {
          ...input,
          txHash: paid,
          nonce: toHex(nonce),
        })
      } catch (error) {
        // Past the payment. Whatever went wrong, offering to send it again
        // would take the money twice for one gift — the receipt above is what
        // finishes this one instead.
        throw new AlreadyPaidError(
          reason(error, t("app.giftNotTaken")),
        )
      }

    },
    [owner, openGroup, giftTerms, wallet, placeGift],
  )

  /**
   * Hand somebody's address on, into whichever chat is open.
   *
   * The name that travels is the one they publish, never the one you gave
   * them: `contact-sheet` promises that stays on this phone, and a card is a
   * message like any other — it would end up in front of the person it named.
   */
  const shareContact = useCallback(
    (into: (body: string) => Promise<void> | void, address: string) => {
      const published = givenNameIn(names, address) ?? ""
      void Promise.resolve(into(encodePayload(contactNote(address, published)))).catch(
        (error: unknown) =>
          toast.error(error instanceof Error ? error.message : t("app.sendThatFailed")),
      )
    },
    [names, t],
  )

  /**
   * Who a shared contact card is about.
   *
   * The card opens this rather than a chat or a knock: it is somebody you have
   * been handed, and the first thing to do with a stranger is look at them.
   * What happens next is a decision, and this is where it is offered.
   */
  const [showingContact, setShowingContact] = useState<string | null>(null)

  /** Knock on a door we already know, reusing the sheet the compose flow uses. */
  const knockOnOpenPeer = useCallback(() => {
    setKnockPeer(openPeer)
    setReopening(true)
    setKnocking(true)
  }, [openPeer])

  const onRetrySend = useCallback(
    async (message: Message) => {
      try {
        await retrySend(message)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("app.stillFailed"))
      }
    },
    [retrySend],
  )

  /**
   * Say something in a room.
   *
   * The relay fans a room message out to the other members and holds none for
   * the speaker, so — exactly as with a knock — this device has to keep its own
   * copy or the sender sees nothing of what they wrote.
   */
  const onSay = useCallback(
    async (body: string) => {
      if (!openGroup || !owner) return
      const id = `local:${messageId()}`
      // On its way, not arrived. The tick this used to be written with is the
      // only thing on screen that says the room has the message, and both a
      // relay that is down and a phone that is offline end up here — where the
      // toast is missed or dismissed and the tick is what is left behind.
      recordOutgoing(owner, body, id, openGroup, "sending")
      try {
        const sent = await say(openGroup, body)
        // Under the relay's name from here, so the room's history recognises it
        // as one already held rather than delivering it back a second time.
        settle(id, `relay:${sent.id}`)
      } catch (error) {
        setStatus(id, "failed")
        toast.error(error instanceof Error ? error.message : t("app.sendThatFailed"))
      }
    },
    [openGroup, owner, say, recordOutgoing, settle, setStatus],
  )

  /**
   * Say it again, for something that never got out.
   *
   * The room's counterpart of [`onRetrySend`]. Rooms had no such thing while
   * nothing said in one could fail; now that a failure is recorded as one, the
   * bubble offers a retry and it has to lead somewhere.
   */
  const onRetrySay = useCallback(
    async (message: Message) => {
      if (!message.group) return
      resend(message.id)
      try {
        const sent = await say(message.group, message.body)
        settle(message.id, `relay:${sent.id}`)
      } catch (error) {
        setStatus(message.id, "failed")
        toast.error(error instanceof Error ? error.message : t("app.sendThatFailed"))
      }
    },
    [say, resend, settle, setStatus],
  )

  if (session.state.status !== "active") {
    return (
      <WelcomeScreen
        status={welcomeStatus(state.status, session.state.status)}
        message={
          state.status === "unavailable"
            ? state.message
            : session.state.status === "error"
              ? session.state.message
              : undefined
        }
        onSignIn={session.authenticate}
        onRetry={retry}
      />
    )
  }

  const address = session.state.session.address

  const contactSheet = (
    <MemberSheet
      address={showingContact}
      onOpenChange={(next) => !next && setShowingContact(null)}
      you={address}
      // Three answers, because there are three people it can be. "Contact"
      // means one thing here — somebody whose channel is open — so a stranger
      // handed to you is not one, whatever the card that carried them said.
      // And a card can carry you: your own is the one nobody knocks on.
      title={t(
        showingContact && compact(showingContact) === compact(address)
          ? "members.you"
          : showingContact &&
              (contacts ?? []).some((one) => compact(one.address) === compact(showingContact))
            ? "shareContact.card"
            : "shareContact.stranger",
      )}
      onCopy={copy}
      onOpenChat={(peer) => {
        setShowingContact(null)
        openCode({ kind: "peer", address: peer })
      }}
    />
  )

  const knockSheet = (
    <KnockSheet
      open={knocking}
      onOpenChange={setKnocking}
      myAddress={address}
      peer={knockPeer ?? undefined}
      reopening={reopening}
      onReach={reach}
      held={held}
      onKnock={async (peer, body, policyLuna) => {
        if (!deviceSecretKey) throw new Error("no device key")
        const sent = await knock(peer, body, policyLuna, deviceSecretKey)
        // The relay holds the knock until it is accepted, so nothing comes
        // back through the message poll — without this the sender has no
        // record of what they wrote.
        recordOutgoing(peer, body, `knock:${sent.id}`)
        // The open thread's banner is driven by this, so it has to be re-asked
        // or the composer stays shut with no sign the knock went out.
        await refreshReach()
        toast.success(t("app.knocked"))
      }}
      onOpenThread={openThread}
      suggestions={
        wallet?.mode === "dev"
          ? devIdentities.filter((identity) => compact(identity.address) !== compact(address))
          : []
      }
    />
  )

  /** What the compose button offers: a message, or a room — yours or theirs. */
  const composeMenu = (
    <AttachMenu
      open={composing}
      onOpenChange={setComposing}
      title={t("app.newChat")}
      actions={[
        {
          icon: ScanLine,
          label: t("app.scanCode"),
          description: t("app.scanCodeNote"),
          onSelect: () => setScanning(true),
        },
        {
          icon: PenLine,
          label: t("app.directMessage"),
          description: t("app.directMessageNote"),
          onSelect: () => {
            setKnockPeer(null)
            setReopening(false)
            setKnocking(true)
          },
        },
        {
          icon: Users,
          label: t("app.newGroup"),
          description: t("app.newGroupNote"),
          onSelect: () => setCreatingGroup(true),
        },
        {
          // The Groups tab offers this too, but only while the tab is empty —
          // once you are in one room, the way into a second one disappeared.
          icon: LinkIcon,
          label: t("app.joinGroup"),
          description: t("app.joinGroupNote"),
          onSelect: () => setPasting(true),
        },
      ]}
    />
  )

  /** The Groups tab's plus: make one, or get into someone else's. */
  const groupMenu = (
    <AttachMenu
      open={addingGroup}
      onOpenChange={setAddingGroup}
      title={t("app.addGroup")}
      actions={[
        {
          icon: Users,
          label: t("app.newGroup"),
          description: t("app.newGroupNote"),
          onSelect: () => setCreatingGroup(true),
        },
        {
          icon: LinkIcon,
          label: t("app.joinGroup"),
          description: t("app.joinGroupNote"),
          onSelect: () => setPasting(true),
        },
      ]}
    />
  )

  const groupSheets = (
    <>
      <CreateGroupSheet
        open={creatingGroup}
        onOpenChange={setCreatingGroup}
        onCreate={async (input) => {
          const group = await create(input)
          openRoom(group.id)
          toast.success(t("app.groupCreated"))
          return group
        }}
      />
      <JoinByLinkSheet open={pasting} onOpenChange={setPasting} onFound={openInvite} />
      <ScanSheet open={scanning} onOpenChange={setScanning} onFound={openCode} />
      <JoinGroupSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        group={invited}
        full={invitedFull}
        loading={inviteLoading}
        onJoin={async (group) => {
          const result = await join(group)
          if (result.status === "joined") {
            openRoom(group.id)
            toast.success(t("app.youreIn", { name: group.name }))
          } else {
            toast.success(t("app.askedToJoin"))
          }
        }}
      />
    </>
  )

  // A room you have been removed from still has its history, and the relay will
  // still describe the room itself to anyone — just without its members. So the
  // thread stays readable; only the composer goes.
  const joined = groups.find((group) => group.id === openGroup)
  // Last resort, and only a resort: the live list wins, then whatever the relay
  // will still say about the room, then what this device remembers of it. The
  // last one is all that is left of a room somebody disbanded.
  const room =
    joined ??
    (groupDetail?.group.id === openGroup ? groupDetail.group : undefined) ??
    (openGroup ? roomIn(rooms, openGroup) : undefined)
  // The screens below are built rather than returned, because on a wide window
  // a thread does not replace the list — it sits beside it, and both are on the
  // page at once. Which sheets go with them differs between those two shapes,
  // so the sheets are composed at the end rather than attached here.
  const roomScreen =
    openGroup && room ? (
      <GroupRoom
        group={room}
        detail={groupDetail}
        member={joined !== undefined}
        gone={roomGone}
        owner={address}
        messages={roomMessages}
        hasEarlier={hasEarlier}
        loadingEarlier={loadingEarlier}
        onLoadEarlier={loadEarlier}
        onBack={closeThreadView}
        onDeleteChat={() => {
          if (!openGroup) return
          const thread = openGroup
          // Out of the room first: what is being deleted is what is on
          // screen, and there is nothing left to come back to.
          closeThreadView()
          deleteChat(thread)
          forgetRoom(thread)
          unpin(thread)
          toast.success(t("app.chatDeleted"))
        }}
        onSay={onSay}
        onRetrySay={onRetrySay}
        onOpenContact={setShowingContact}
        onShareContact={(address) => shareContact((body) => onSay(body), address)}
        onRefreshDetail={() => {
          void refreshGroupDetail()
          void refreshGroups()
        }}
        onOpenChat={openThread}
        onOpenInvite={openInvite}
        onInvite={onInviteToRoom}
        onGift={giftTerms ? () => setGifting(true) : undefined}
        onShowSidebar={wide && !sidebarOpen ? () => setSidebarOpen(true) : undefined}
      />
    ) : null

  const peerScreen = openPeer ? (
    <Conversation
      peer={openPeer}
      owner={address}
      messages={openMessages}
      reach={openReach}
      onBack={closeThreadView}
      onSend={onSend}
      onKnock={knockOnOpenPeer}
      onRetry={onRetrySend}
      onCopyAddress={copy}
      onPay={onPay}
      onOpenInvite={openInvite}
      onOpenContact={setShowingContact}
      onShareContact={(address) => shareContact((body) => onSend(body), address)}
      onShowSidebar={wide && !sidebarOpen ? () => setSidebarOpen(true) : undefined}
    />
  ) : null

  const thread = roomScreen ?? peerScreen

  /** Offered in a room and nowhere else, so it goes wherever the room does. */
  const giftSheet =
    giftTerms && roomScreen ? (
      <SendGiftSheet
        open={gifting}
        onOpenChange={setGifting}
        expiresInHours={giftTerms.expires_in_hours}
        maxShares={giftTerms.max_shares}
        onSend={onGift}
      />
    ) : null

  /**
   * What the plus beside the title does here.
   *
   * Chats has one only when its own button is not floating over the list —
   * two ways to do the same thing in one view is something to wonder about
   * rather than a shortcut. Which of the two it is, is [`prefs.compose`]:
   * floating is under your thumb and over the last rows, up here is out of
   * the way and matches the other tabs, and neither is right for everyone.
   */
  const add =
    tab === "chats"
      ? compose === "header"
        ? { label: t("app.newChatOrGroup"), onSelect: () => setComposing(true) }
        : null
      : tab === "contacts"
      ? {
          label: t("app.newMessage"),
          onSelect: () => {
            setKnockPeer(null)
            setReopening(false)
            setKnocking(true)
          },
        }
      : tab === "groups"
        ? { label: t("app.addGroup"), onSelect: () => setAddingGroup(true) }
        : null

  const listPane = (
    <div className="flex h-full flex-col">
      {/* The rule is kept transparent rather than removed, so turning it on
          costs no layout shift. It means "there is something above you" — at
          the top of a list there is nothing to separate from, and drawing a
          line anyway is what makes a header look stuck on. */}
      <header
        className={cn(
          "bg-background sticky top-0 z-10 border-b transition-colors duration-200 pt-safe",
          scrolled ? "border-border" : "border-transparent",
        )}
      >
        {/* Centred, not bottom-aligned. `items-end` was there to hold the
            baseline still while the title shrank on scroll; with one fixed size
            all it does is sit a 22px word on the floor of a 44px button. */}
        <div className="flex items-center justify-between gap-3 px-4 pt-2.5 pb-3">
          <div className="flex items-center gap-1.5">
            {/* One size, whatever the list is doing. It used to shrink on
                scroll, but only the words did — the avatar beside it cannot
                shrink with them, so the row rearranged itself around a control
                that held still, which reads as a glitch rather than as a
                header making room. The rule below is what says you have
                scrolled, and it costs the list nothing. */}
            <h1
              onClick={revealProbes}
              className="text-[22px] font-extrabold tracking-[-0.02em] select-none"
            >
              {t(tab === "chats" ? "tabs.chats" : tab === "contacts" ? "tabs.contacts" : "tabs.groups")}
            </h1>
            {add && (
              // The tap target is the button; what you see is the disc inside
              // it, the same way the profile avatar is smaller than the control
              // it sits in. A lone hairline plus beside an extrabold title
              // reads as a stray mark rather than a control — the disc gives it
              // an edge, and the heavier stroke gives it the weight of the word
              // it stands next to. Tinted the way every other icon in the app
              // is contained: see the rows of the attach menu.
              <Button
                variant="ghost"
                size="icon"
                onClick={add.onSelect}
                aria-label={add.label}
                className="-my-1 size-9 shrink-0 rounded-full"
              >
                <span className="bg-accent text-accent-foreground flex size-7 items-center justify-center rounded-full">
                  <Plus className="size-4" strokeWidth={2.75} />
                </span>
              </Button>
            )}
            {relayStatus === "offline" && (
              <span className="text-destructive ml-0.5 text-[11px] font-semibold">offline</span>
            )}
          </div>
          {/* The button is 44px, the smallest target a thumb hits reliably;
              the identicon inside is smaller, so the target is generous without
              the mark being loud. Its own transparent bands take off another
              tenth top and bottom, which is why 36 does not look like 36. */}
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              aria-label={t("app.hideSidebar")}
              aria-keyshortcuts={SIDEBAR_SHORTCUT_KEYS}
              title={`${t("app.hideSidebar")} (${SIDEBAR_SHORTCUT_LABEL})`}
              className="hidden size-11 shrink-0 rounded-full lg:flex"
            >
              <PanelLeftClose className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setProfileOpen(true)}
              aria-label={t("app.yourProfile")}
              className="size-11 shrink-0 rounded-full"
            >
              <AddressAvatar address={address} size="sm" className="size-9" />
            </Button>
          </div>
        </div>
      </header>

      {/* The gap a pull opens is padding on the scroller rather than a
          transform on a wrapper around its contents: the list inside stands on
          `min-h-full` to keep the compose button stuck to the bottom, and a
          wrapper between the two is exactly what stops that resolving. */}
      <div
        ref={setList}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
        className="scrollbar-none relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingTop: pull.distance,
          // Nothing while a finger is on it — the gap is the finger's to move.
          // On release it settles rather than snapping: out fast, in slow.
          transition: pull.dragging ? undefined : "padding-top 260ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        }}
      >
        <PullIndicator pull={pull} />

        {tab === "chats" ? (
          <>
            <KnockRequests
              knocks={knocks}
              owner={owner}
              deviceSecretKey={deviceSecretKey}
              onAccept={async (id) => {
                await accept(id)
                // The channel this just opened is a contact now. The poll would
                // find it within the minute; opening the door yourself is the
                // one case where there is no reason to wait for that.
                void refreshContacts()
                toast.success(t("app.connected"))
              }}
              onDecline={decline}
            />
            <Inbox
              conversations={threads}
              groups={groups}
              // Compact, because that is the form a thread is keyed by.
              knocked={new Set(sent.map((knock) => compact(knock.to)))}
              onOpen={openAnyThread}
              floating={compose === "floating"}
              onCompose={() => setComposing(true)}
              onDelete={(thread) => {
                deleteChat(thread)
                // And what was remembered of the room, if it was one. Nothing
                // is left to put a name on.
                forgetRoom(thread)
                // The pin goes with it. A key held up for a thread that no
                // longer exists is invisible until the thread comes back, and
                // then it is a pin nobody asked for.
                unpin(thread)
                // Deleting a thread is tidying this device, never leaving
                // anything — which is why the durable thing has its own tab.
                toast.success(
                  groups.some((group) => group.id === thread)
                    ? t("app.chatDeletedInGroup")
                    : t("app.chatDeletedInContacts"),
                )
              }}
              selectedThread={wide ? openThreadKey : null}
            />
          </>
        ) : tab === "contacts" ? (
          <Contacts
            contacts={contacts}
            setContacts={setContacts}
            error={contactsError}
            onOpen={openThread}
            onRemoved={deleteChat}
            selectedAddress={wide ? openPeer : null}
          />
        ) : (
          <>
            <GroupRequests groups={groups} queues={queues} onOpen={setQueueFor} />
            <Groups
              groups={groups}
              owner={address}
              loading={groupsLoading}
              onOpen={openRoom}
              onLeft={(id) => {
                // The room goes, and its chat with it — the same shape as
                // removing a contact, which also takes the conversation.
                deleteChat(id)
                void refreshGroups()
              }}
              selectedId={wide ? openGroup : null}
            />
          </>
        )}
      </div>

      {/* Reachable from the card above the room list, and unchanged inside the
          room's own details — the same queue, wherever you meet it. */}
      <JoinQueueSheet
        group={groups.find((group) => group.id === queueFor) ?? null}
        requests={queueFor ? (queues[queueFor] ?? []) : []}
        onOpenChange={(open) => !open && setQueueFor(null)}
        onAnswer={async (request, admit) => {
          await answerJoin(request.group_id, request.id, admit)
          // The room list carries the counts this queue is driven by, so
          // re-reading it is also what re-reads the queue — and admitting
          // somebody changes who is in the room, which that list draws.
          void refreshGroups()
        }}
      />

      <TabBar
        active={tab}
        onChange={setTab}
        unread={threads.reduce((total, c) => total + c.unread, 0) + knocks.length}
        waiting={Object.values(waiting).reduce((total, at) => total + at, 0)}
      />

      {knockSheet}
      {contactSheet}
      {composeMenu}
      {groupMenu}
      {groupSheets}

      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        address={address}
        mode={wallet?.mode ?? "nimiq-pay"}
        relayStatus={relayStatus}
        onCopy={copy}
        onSignOut={() => {
          setProfileOpen(false)
          session.invalidate()
        }}
      />
    </div>
  )

  // One thing at a time, a thread covering the list. What a phone is, and what
  // this was everywhere before there was room to be anything else. Each screen
  // carries the sheets it can open, which is why the two lists differ.
  if (!wide) {
    if (roomScreen) {
      return (
        <>
          {roomScreen}
          {giftSheet}
          {groupSheets}
          {/* A shared contact opens a knock, and a room is one of the places a
              card like that is read — without this the sheet has nowhere to
              appear until the room is closed. */}
          {knockSheet}
          {contactSheet}
        </>
      )
    }
    if (peerScreen) {
      return (
        <>
          {peerScreen}
          {knockSheet}
          {contactSheet}
          {composeMenu}
          {groupSheets}
        </>
      )
    }
    return listPane
  }

  // Both at once unless the person has hidden the list to give the thread the
  // full window. Closing a thread leaves its pane empty rather than changing
  // the list's visibility.
  //
  // Shared sheets live in the list pane. A thread adds none of its own here:
  // the two would be mounted twice over, and open twice over with them.
  return (
    <div className="flex h-full">
      {sidebarOpen && (
        <div className="flex w-[22rem] shrink-0 flex-col border-r">{listPane}</div>
      )}
      <div className="min-w-0 flex-1">
        {thread ?? (
          <NoThread onShowSidebar={!sidebarOpen ? () => setSidebarOpen(true) : undefined} />
        )}
      </div>
      {giftSheet}
    </div>
  )
}

/** Collapse the wallet and session state machines into one screen's status. */
function welcomeStatus(
  wallet: "connecting" | "connected" | "unavailable",
  session: "restoring" | "needed" | "preparing" | "signing" | "error",
): WelcomeStatus {
  if (wallet === "unavailable") return "no-host"
  if (wallet === "connecting" || session === "restoring") {
    // Finding the wallet runs to a 2.5s timeout when there is no provider to
    // answer, and the session cannot be restored until it finishes. Read
    // straight from storage instead of waiting: it says whether this is a
    // first visit or a returning one, which is the difference between an
    // invitation to sign in and a splash.
    return haveStoredSession() ? "resuming" : "detecting"
  }
  if (session === "preparing") return "preparing"
  if (session === "signing") return "signing"
  if (session === "error") return "error"
  return "ready"
}
