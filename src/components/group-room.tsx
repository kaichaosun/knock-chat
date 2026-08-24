import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, Info } from "lucide-react"

import { Composer } from "@/components/composer"
import { GroupAvatar } from "@/components/group-avatar"
import { GroupSheet } from "@/components/group-sheet"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { labelIn } from "@/lib/names"
import type { Message } from "@/lib/messages"
import type { Group, GroupDetail } from "@/lib/relay"
import { dayLabel } from "@/lib/time"

/**
 * A room.
 *
 * Close to a conversation and deliberately not identical: every incoming
 * message is labelled with who said it, because in a room that is not implied
 * by the thread.
 */
export function GroupRoom({
  group,
  detail,
  owner,
  messages,
  onBack,
  onSay,
  onRefreshDetail,
  onOpenChat,
}: {
  group: Group
  /** Members and settings; null until the first read lands. */
  detail: GroupDetail | null
  owner: string
  messages: Message[]
  onBack: () => void
  onSay: (body: string) => void
  onRefreshDetail: () => void
  /** Knock on a member — a room opens no channel, so this still costs. */
  onOpenChat: (address: string) => void
}) {
  const names = useNames()
  const bottom = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [details, setDetails] = useState(false)

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
  const memberCount = detail?.members.length ?? 0

  return (
    <div className="flex h-full flex-col">
      <header className="bg-background/85 sticky top-0 z-10 border-b backdrop-blur-xl pt-safe">
        <div className="flex items-center gap-1.5 px-1.5 py-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            aria-label="Back to messages"
            className="size-10 shrink-0 rounded-full"
          >
            <ChevronLeft className="size-5" />
          </Button>

          <GroupAvatar size="sm" />

          <button
            type="button"
            onClick={() => setDetails(true)}
            className="min-w-0 flex-1 px-1 text-left"
          >
            <p className="truncate text-[15px] leading-tight font-semibold">{group.name}</p>
            <p className="text-muted-foreground truncate text-[11px]">
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
            className="size-10 shrink-0 rounded-full"
          >
            <Info className="size-4" />
          </Button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {messages.length === 0 && <RoomIntro group={group} />}

        {groups.map((day) => (
          <div key={day.label}>
            <div className="flex justify-center py-2">
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium">
                {day.label}
              </span>
            </div>
            <div className="space-y-2">
              {day.messages.map((message) => (
                <div key={message.id}>
                  {/* Who spoke, over their first-person bubble. Shown for every
                      incoming message rather than only on a change of speaker:
                      a room read in glances is not read in runs. */}
                  {message.direction === "in" && (
                    <button
                      type="button"
                      onClick={() => onOpenChat(message.peer)}
                      className="text-muted-foreground mb-0.5 ml-1 block max-w-full truncate text-[11px] font-semibold"
                    >
                      {labelIn(names, message.peer)}
                    </button>
                  )}
                  <MessageBubble
                    message={message}
                    onRetry={() => {}}
                    channelOpen
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <Composer onSend={onSay} onAttach={() => setDetails(true)} />

      <GroupSheet
        open={details}
        onOpenChange={(next) => {
          setDetails(next)
          if (next) onRefreshDetail()
        }}
        group={group}
        detail={detail}
        owner={owner}
        onChanged={onRefreshDetail}
        onOpenChat={onOpenChat}
      />
    </div>
  )
}

function RoomIntro({ group }: { group: Group }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <GroupAvatar size="lg" />
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
