import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, DoorClosed, Gift as GiftIcon, Info } from "lucide-react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { MemberSheet } from "@/components/member-sheet"
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
  /** Send this room's invite into your chat with somebody. */
  onInvite: (address: string) => void
  /** Leave a pot in the room. Absent on a relay that doesn't hold gifts. */
  onGift?: () => void
}) {
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
      toast.success("Removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove them")
    } finally {
      setBusy(false)
    }
  }
  const [attaching, setAttaching] = useState(false)

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
            aria-label="Back to messages"
            className="size-11 shrink-0 rounded-full"
          >
            <ChevronLeft className="size-6" />
          </Button>

          <GroupAvatar size="sm" members={detail?.members} className="size-9" />

          <button
            type="button"
            onClick={() => setDetails(true)}
            aria-label="Group details"
            className="min-w-0 flex-1 px-1 text-left active:opacity-60"
          >
            <p className="truncate text-[17px] leading-tight font-semibold">{group.name}</p>
            <p className="text-muted-foreground truncate text-[12px]">
              {memberCount === 0
                ? "Tap for details"
                : memberCount === 1
                  ? "Just you so far"
                  : `${memberCount} members`}
            </p>
          </button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDetails(true)}
            aria-label="Group details"
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
        {messages.length === 0 && <RoomIntro group={group} members={detail?.members} />}

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
                            aria-label="About you"
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
              ? "This group was removed, no more messages."
              : "You're not in this group any more."}
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
              label: "Leave a gift",
              description: "A pot for the room, first come first served.",
              onSelect: onGift,
            },
          ]}
        />
      )}

      <MemberSheet
        address={showing}
        onOpenChange={(next) => !next && setShowing(null)}
        you={owner}
        roomOwner={group.owner}
        mine={mine}
        onCopy={(address) => {
          void copyText(address).then((ok) =>
            ok ? toast.success("Address copied") : toast.error("Couldn't copy that"),
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
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <GroupAvatar size="lg" members={members} />
      <p className="mt-4 text-base font-semibold">{group.name}</p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        Nothing said here yet. Anyone in the room sees what you write.
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
