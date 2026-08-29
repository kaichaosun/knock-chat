import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, DoorClosed, Gift as GiftIcon, Info, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { MemberSheet } from "@/components/member-sheet"
import { PickContactSheet } from "@/components/pick-contact-sheet"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
import { AttachMenu } from "@/components/attach-menu"
import { Composer } from "@/components/composer"
import { GroupAvatar } from "@/components/group-avatar"
import { GroupSheet } from "@/components/group-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { copyText } from "@/lib/clipboard"
import { labelIn } from "@/lib/names"
import { carriesTime, opensTurn, type Message } from "@/lib/messages"
import { removeGroupMember, type Group, type GroupDetail } from "@/lib/relay"
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
  onSay,
  onRefreshDetail,
  onOpenChat,
  onOpenInvite,
  onOpenContact,
  onShareContact,
  onInvite,
  onGift,
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
  onSay: (body: string) => void
  onRefreshDetail: () => void
  /** Knock on a member — a room opens no channel, so this still costs. */
  onOpenChat: (address: string) => void
  /** Open the door an invite card points at. */
  onOpenInvite: (group: string) => void
  /** Open the door a shared contact points at. */
  onOpenContact: (address: string) => void
  /** Post somebody's contact into this room. */
  onShareContact: (address: string) => void
  /** Send this room's invite into your chat with somebody. */
  onInvite: (address: string) => void
  /** Leave a pot in the room. Absent on a relay that doesn't hold gifts. */
  onGift?: () => void
}) {
  const { t } = useTranslation()
  const names = useNames()
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [details, setDetails] = useState(false)
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const observer = new ResizeObserver(() => bottom.current?.scrollIntoView({ block: "end" }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const groups = useMemo(() => groupByDay(messages), [messages])
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

          <GroupAvatar size="sm" members={faces} className="size-9" />

          <button
            type="button"
            onClick={() => setDetails(true)}
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
            onClick={() => setDetails(true)}
            aria-label={t("room.details")}
            className="size-11 shrink-0 rounded-full"
          >
            <Info className="size-6" />
          </Button>
        </div>
      </header>

      <div
        ref={scroller}
        className="scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3"
      >
        {messages.length === 0 && <RoomIntro group={group} members={faces} />}

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
                    <div key={message.id} className="flex items-start gap-2">
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
                        <MessageBubble
                          message={message}
                          onRetry={() => {}}
                          onOpenInvite={onOpenInvite}
                          onOpenContact={onOpenContact}
                          channelOpen
                          owner={owner}
                          stamped={stamped}
                        />
                      </div>
                    </div>
                  )
                }
                const opens = opensTurn(day.messages[index - 1], message)
                const who = labelIn(names, message.peer)
                return (
                  <div key={message.id} className="flex items-start gap-2">
                    {/* A gutter, held open for the whole run rather than only
                        where the face is drawn: without it the rest of what
                        somebody says steps left out from under them. */}
                    <div className="w-8 shrink-0">
                      {opens && (
                        <button
                          type="button"
                          onClick={() => setShowing(message.peer)}
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
                          onClick={() => setShowing(message.peer)}
                          className="text-muted-foreground mb-0.5 ml-1 block max-w-full truncate text-[13px] font-semibold"
                        >
                          {who}
                        </button>
                      )}
                      <MessageBubble
                        message={message}
                        onRetry={() => {}}
                        onOpenInvite={onOpenInvite}
                        onOpenContact={onOpenContact}
                        channelOpen
                        owner={owner}
                        stamped={stamped}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
        <div ref={bottom} />
      </div>

      {member ? (
        /* `+` appears only when there is something behind it — a relay
           without a wallet holds no gifts, and an empty menu is worse than
           no button. */
        <Composer onSend={onSay} onAttach={onGift && (() => setAttaching(true))} />
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

      {onGift && (
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
      )}

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
        onOpenChange={(next) => {
          setDetails(next)
          if (next) onRefreshDetail()
        }}
        group={group}
        detail={detail}
        gone={gone}
        owner={owner}
        onChanged={onRefreshDetail}
        // The same way out the back arrow uses: to whichever list this was
        // opened from, where the room is now missing.
        onDisbanded={onBack}
        onDeleteChat={onDeleteChat}
        onOpenChat={onOpenChat}
        onInvite={onInvite}
      />
    </div>
  )
}

function RoomIntro({ group, members }: { group: Group; members?: string[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <GroupAvatar size="lg" members={members} />
      <p className="mt-4 text-base font-semibold">{group.name}</p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        {t("room.emptyRoom")}
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
