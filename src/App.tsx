import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { PenLine, Users } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"

import { Conversation } from "@/components/conversation"
import { Inbox } from "@/components/inbox"
import { Contacts } from "@/components/contacts"
import { KnockRequests } from "@/components/knock-requests"
import { KnockSheet } from "@/components/knock-sheet"
import { ProfileSheet } from "@/components/profile-sheet"
import { AttachMenu } from "@/components/attach-menu"
import { TabBar, type Tab } from "@/components/tab-bar"
import { Button } from "@/components/ui/button"
import { CreateGroupSheet } from "@/components/create-group-sheet"
import { GroupRoom } from "@/components/group-room"
import { JoinGroupSheet } from "@/components/join-group-sheet"
import { useGroups } from "@/hooks/use-groups"
import { useKnocks } from "@/hooks/use-knocks"
import { useMessages } from "@/hooks/use-messages"
import { useWallet } from "@/hooks/use-wallet"
import { compact } from "@/lib/address"
import { copyText } from "@/lib/clipboard"
import { messageId, type Message } from "@/lib/messages"
import { adopt as adoptNames, rememberOne } from "@/lib/names"
import { encode as encodePayload, payment } from "@/lib/payload"
import { sendNim } from "@/lib/payments"
import { formatNim } from "@/lib/postage"
import { NoKeyError } from "@/lib/keys"
import { deviceKeyPair } from "@/lib/keys"
import { RelayError, type Group, type GroupDetail, type Reachability } from "@/lib/relay"
import { devIdentities } from "@/lib/wallet"
import { WelcomeScreen, type WelcomeStatus } from "@/components/welcome-screen"
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
  const revealProbes = useSecretTap(onRevealProbes)
  const { state, retry } = useWallet()
  const wallet = state.status === "connected" ? state.wallet : null

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
    relayStatus,
  } = useMessages(owner, deviceSecretKey, session.invalidate)

  const { knocks, reach, knock, accept, decline } = useKnocks(wallet, owner)
  const { groups, refresh: refreshGroups, inspect, create, join, say } = useGroups(wallet, owner)

  const [openPeer, setOpenPeer] = useState<string | null>(null)
  const [knocking, setKnocking] = useState(false)
  // Set when knocking on a door we already know, so the sheet fixes the address
  // instead of asking for it. Null for the ordinary compose flow.
  const [knockPeer, setKnockPeer] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("chats")
  const [profileOpen, setProfileOpen] = useState(false)
  // A room is a thread like any other, but nothing a direct chat does applies
  // to it — no reachability, no knocking — so it is opened separately rather
  // than threaded through logic that would have to keep asking which it is.
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [groupDetail, setGroupDetail] = useState<GroupDetail | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [composing, setComposing] = useState(false)
  /** A room a link pointed at, waiting to be joined. */
  const [invited, setInvited] = useState<Group | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

  // Let the hardware/gesture back control leave a thread instead of the app.
  useEffect(() => {
    if (!openPeer) return
    window.history.pushState({ thread: openPeer }, "")
    const onPop = () => setOpenPeer(null)
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [openPeer])

  // Names are learnt per identity: switching to a development identity should
  // not inherit what the previous one had been told.
  useEffect(() => adoptNames(owner), [owner])

  const openThread = useCallback((peer: string) => setOpenPeer(peer), [])

  /** Open whichever kind of thread this key names. */
  const openAnyThread = useCallback(
    (thread: string) => {
      if (groups.some((group) => group.id === thread)) setOpenGroup(thread)
      else setOpenPeer(thread)
    },
    [groups],
  )

  const refreshGroupDetail = useCallback(async () => {
    if (!openGroup) return
    try {
      setGroupDetail(await inspect(openGroup))
    } catch {
      // The room still opens; only its member list is missing.
    }
  }, [openGroup, inspect])

  useEffect(() => {
    setGroupDetail(null)
    void refreshGroupDetail()
  }, [openGroup, refreshGroupDetail])

  // A link carries a room id. Looked up rather than joined on sight: what it
  // costs has to be visible before anyone pays it.
  useEffect(() => {
    if (!owner) return
    const id = new URLSearchParams(window.location.search).get("group")
    if (!id) return
    // Cleared straight away so a reload does not reopen the same door.
    const url = new URL(window.location.href)
    url.searchParams.delete("group")
    window.history.replaceState({}, "", url)

    setInviteOpen(true)
    setInviteLoading(true)
    inspect(id)
      .then((detail) => setInvited(detail.group))
      .catch(() => {
        setInviteOpen(false)
        toast.error("That group link doesn't lead anywhere.")
      })
      .finally(() => setInviteLoading(false))
  }, [owner, inspect])

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

  const closeThreadView = useCallback(() => {
    // Unwind the entry pushed above so back doesn't need two presses.
    if (window.history.state?.thread) window.history.back()
    else setOpenPeer(null)
  }, [])

  const copy = useCallback(async (text: string) => {
    // Some WebViews simply will not give a page the clipboard. Say what to do
    // instead of reporting a failure the user can do nothing about.
    const ok = await copyText(text)
    toast[ok ? "success" : "info"](
      ok ? "Address copied" : "Couldn't reach the clipboard — long-press the address to select it",
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
          toast.error("They closed this chat. Send again to knock and reopen it.")
          return
        }
        // Someone who has never opened Knock has published no key, so there is
        // nothing to encrypt to. Say that plainly instead of "failed to send".
        toast.error(
          error instanceof NoKeyError
            ? "They haven't joined Knock yet — nothing to encrypt to."
            : error instanceof Error
              ? error.message
              : "Message failed to send",
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
      if (!wallet?.provider) {
        throw new Error("Sending NIM needs Nimiq Pay. Open the app there to continue.")
      }
      const reference = await sendNim(wallet.provider, peer, luna)
      try {
        await send(peer, encodePayload(payment(luna, reference)))
      } catch {
        toast.info(`Sent ${formatNim(luna)} NIM, but the note didn't reach this chat.`)
        return
      }
      toast.success(`Sent ${formatNim(luna)} NIM`)
    },
    [wallet, send],
  )

  /** Knock on a door we already know, reusing the sheet the compose flow uses. */
  const knockOnOpenPeer = useCallback(() => {
    setKnockPeer(openPeer)
    setKnocking(true)
  }, [openPeer])

  const onRetrySend = useCallback(
    async (message: Message) => {
      try {
        await retrySend(message)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Still couldn't send")
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
      recordOutgoing(owner, body, id, openGroup)
      try {
        await say(openGroup, body)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't send that")
      }
    },
    [openGroup, owner, say, recordOutgoing],
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

  const knockSheet = (
    <KnockSheet
      open={knocking}
      onOpenChange={setKnocking}
      myAddress={address}
      peer={knockPeer ?? undefined}
      onReach={reach}
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
        toast.success("Knocked. They'll see it next time they open Knock.")
      }}
      onOpenThread={openThread}
      suggestions={
        wallet?.mode === "dev"
          ? devIdentities.filter((identity) => compact(identity.address) !== compact(address))
          : []
      }
    />
  )

  /** What the compose button offers: a message, or a room. */
  const composeMenu = (
    <AttachMenu
      open={composing}
      onOpenChange={setComposing}
      title="Start something"
      actions={[
        {
          icon: PenLine,
          label: "New message",
          description: "Knock on someone's door with their address.",
          onSelect: () => {
            setKnockPeer(null)
            setKnocking(true)
          },
        },
        {
          icon: Users,
          label: "New group",
          description: "A room you share by link. Not encrypted.",
          onSelect: () => setCreatingGroup(true),
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
          setOpenGroup(group.id)
          toast.success("Group created. Share the link to let people in.")
          return group
        }}
      />
      <JoinGroupSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        group={invited}
        loading={inviteLoading}
        onJoin={async (group) => {
          const result = await join(group)
          if (result.status === "joined") {
            setOpenGroup(group.id)
            toast.success(`You're in ${group.name}`)
          } else {
            toast.success("Asked to join. The owner will answer.")
          }
        }}
      />
    </>
  )

  const room = groups.find((group) => group.id === openGroup)
  if (openGroup && room) {
    return (
      <>
        <GroupRoom
          group={room}
          detail={groupDetail}
          owner={address}
          messages={threadWith(openGroup)}
          onBack={() => setOpenGroup(null)}
          onSay={onSay}
          onRefreshDetail={() => {
            void refreshGroupDetail()
            void refreshGroups()
          }}
          onOpenChat={(peer) => {
            setOpenGroup(null)
            openThread(peer)
          }}
        />
        {groupSheets}
      </>
    )
  }

  if (openPeer) {
    return (
      <>
        <Conversation
          peer={openPeer}
          messages={openMessages}
          reach={openReach}
          onBack={closeThreadView}
          onSend={onSend}
          onKnock={knockOnOpenPeer}
          onRetry={onRetrySend}
          onCopyAddress={copy}
          onPay={onPay}
        />
        {knockSheet}
        {composeMenu}
        {groupSheets}
      </>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-baseline gap-2">
            <h1
              onClick={revealProbes}
              className="text-xl font-extrabold tracking-tight select-none"
            >
              {tab === "chats" ? "Messages" : "Contacts"}
            </h1>
            {relayStatus === "offline" && (
              <span className="text-destructive text-[11px] font-semibold">offline</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setProfileOpen(true)}
            aria-label="Your profile"
            className="size-10 rounded-full"
          >
            <AddressAvatar address={address} size="sm" />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "chats" ? (
          <>
            <KnockRequests
              knocks={knocks}
              onAccept={async (id) => {
                await accept(id)
                toast.success("You're connected. Messages are free from here.")
              }}
              onDecline={decline}
            />
            <Inbox
              conversations={conversations}
              groups={groups}
              onOpen={openAnyThread}
              onCompose={() => setComposing(true)}
              onDelete={(peer) => {
                deleteThread(peer)
                toast.success("Chat deleted. They're still in Contacts.")
              }}
            />
          </>
        ) : (
          <Contacts signedIn onOpen={openThread} onRemoved={deleteThread} />
        )}
      </div>

      <TabBar
        active={tab}
        onChange={setTab}
        unread={conversations.reduce((total, c) => total + c.unread, 0) + knocks.length}
      />

      {knockSheet}
      {composeMenu}
      {groupSheets}

      <ProfileSheet
        open={profileOpen}
        onOpenChange={setProfileOpen}
        address={address}
        mode={wallet?.mode ?? "nimiq-pay"}
        relayStatus={relayStatus}
        onCopy={copy}
      />
    </div>
  )
}

/** Collapse the wallet and session state machines into one screen's status. */
function welcomeStatus(
  wallet: "connecting" | "connected" | "unavailable",
  session: "restoring" | "needed" | "signing" | "error",
): WelcomeStatus {
  if (wallet === "unavailable") return "no-host"
  if (wallet === "connecting" || session === "restoring") return "detecting"
  if (session === "signing") return "signing"
  if (session === "error") return "error"
  return "ready"
}
