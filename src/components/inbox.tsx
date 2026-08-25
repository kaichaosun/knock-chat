import { useState } from "react"
import { MessageSquarePlus, PenLine } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { GroupAvatar } from "@/components/group-avatar"
import { SwipeRow } from "@/components/swipe-row"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { labelIn, nameIn, type Directory } from "@/lib/names"
import { preview } from "@/lib/payload"
import type { Conversation } from "@/lib/messages"
import type { Group } from "@/lib/relay"
import { relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function Inbox({
  conversations,
  groups,
  onOpen,
  onCompose,
  onDelete,
}: {
  conversations: Conversation[]
  /** The rooms you are in, so a room's thread can be labelled with its name. */
  groups: Group[]
  onOpen: (thread: string) => void
  onCompose: () => void
  onDelete: (thread: string) => void
}) {
  // Only one row open at a time, so a stray Delete is never left lurking under
  // a row the user has moved on from.
  const [revealed, setRevealed] = useState<string | null>(null)
  const names = useNames()
  const rooms = new Map(groups.map((group) => [group.id, group]))
  if (conversations.length === 0) {
    return <EmptyInbox onCompose={onCompose} />
  }

  return (
    <div className="relative h-full">
      <ul className="px-2 pb-28">
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.key}
            conversation={conversation}
            room={conversation.group ? rooms.get(conversation.group) : undefined}
            names={names}
            onOpen={onOpen}
            onDelete={onDelete}
            revealed={revealed === conversation.key}
            onReveal={(open) => setRevealed(open ? conversation.key : null)}
          />
        ))}
      </ul>

      <div className="pointer-events-none sticky bottom-0 flex justify-end px-5 pb-safe">
        <Button
          size="icon"
          onClick={onCompose}
          aria-label="New message"
          className="pointer-events-auto mb-5 size-14 rounded-full shadow-lg shadow-primary/30"
        >
          <PenLine className="size-5" />
        </Button>
      </div>
    </div>
  )
}

function ConversationRow({
  conversation,
  room,
  names,
  onOpen,
  onDelete,
  revealed,
  onReveal,
}: {
  conversation: Conversation
  /** Set when this thread is a room, and absent while its details load. */
  room: Group | undefined
  names: Directory
  onOpen: (thread: string) => void
  onDelete: (thread: string) => void
  revealed: boolean
  onReveal: (open: boolean) => void
}) {
  const { key, peer, group, last, at, unread } = conversation
  // A room you are in but nobody has spoken in yet. It is still a place.
  const summary = last ? preview(last.body, last.direction) : "No messages yet"

  // A room is titled by its name; a chat by whoever it is with. A room whose
  // details have not arrived yet is still a room, so it says so rather than
  // showing a bare id nobody can read.
  const title = group ? (room?.name ?? "Group") : (peer && nameIn(names, peer))
  const mono = !group && !title

  return (
    <SwipeRow
      actionLabel={
        group
          ? `Delete ${room?.name ?? "group"} chat`
          : `Delete chat with ${peer ? labelIn(names, peer) : "this chat"}`
      }
      onAction={() => onDelete(key)}
      onClick={() => onOpen(key)}
      revealed={revealed}
      onReveal={onReveal}
    >
      {group ? <GroupAvatar members={room?.members} /> : peer && <AddressAvatar address={peer} />}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={cn(
              "truncate",
              mono ? "font-mono text-[13px] tracking-tight" : "text-[15px]",
              unread > 0 ? "font-bold" : "font-semibold",
            )}
          >
            {title ?? (peer ? shortenAddress(peer) : "")}
          </span>
          <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
            {relativeTime(at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <span
            className={cn(
              "truncate text-sm",
              unread > 0 ? "text-foreground font-medium" : "text-muted-foreground",
              !last && "italic",
            )}
          >
            {/* In a room the speaker matters as much as what was said. */}
            {group && last?.direction === "in" && (
              <span className="font-medium not-italic">{labelIn(names, last.peer)}: </span>
            )}
            {summary}
          </span>
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
              {unread}
            </span>
          )}
        </div>
      </div>
    </SwipeRow>
  )
}

function EmptyInbox({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-10 pb-16 text-center">
      <div className="bg-accent text-accent-foreground flex size-20 items-center justify-center rounded-3xl">
        <MessageSquarePlus className="size-9" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold tracking-tight">No messages yet</h2>
      <p className="text-muted-foreground mt-2 max-w-[18rem] text-balance">
        Start a conversation with anyone who has opened Knock. Messages are encrypted
        to their device.
      </p>
      <Button onClick={onCompose} size="lg" className="mt-7 h-12 rounded-2xl px-6">
        <PenLine />
        New message
      </Button>
    </div>
  )
}
