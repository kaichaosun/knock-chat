import { useState } from "react"
import { MessageSquarePlus, PenLine, Plus } from "lucide-react"

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
  floating,
}: {
  conversations: Conversation[]
  /** The rooms you are in, so a room's thread can be labelled with its name. */
  groups: Group[]
  onOpen: (thread: string) => void
  onCompose: () => void
  onDelete: (thread: string) => void
  /** Whether the compose button belongs here. Off, it lives in the header. */
  floating: boolean
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
    // `min-h-full`, not `h-full`: the button below sticks to the bottom of the
    // scrollport, and a sticky box is confined to its containing block. At a
    // flat 100% that block is one screen tall however long the list is, so the
    // button would come unstuck a screenful down and scroll away with the rest.
    // A minimum lets the box grow with the list it contains.
    <div className="relative min-h-full">
      {/* Room for the button when there is one to clear. */}
      <ul className={cn("px-2", floating ? "pb-28" : "pb-24")}>
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

      {floating && (
        <div className="pointer-events-none sticky bottom-0 flex justify-end px-5 pb-safe">
          <Button
            size="icon"
            onClick={onCompose}
            aria-label="New chat"
            className="bg-primary/85 pointer-events-auto mb-5 size-12 rounded-full shadow-md shadow-primary/20 backdrop-blur-sm"
          >
            {/* A plus, not a pen: this opens a menu of three unrelated things —
                a message, a room of your own, a room of somebody else's — and a
                pen claims the first of them. The one glyph that means "add
                something" without saying which is the honest one here.

                Small, and not quite opaque. A plus is the densest glyph in the
                app — two full-length strokes crossing, no counters — so at the
                size a drawn icon needs it reads twice as loud as one. */}
            <Plus className="size-5" />
          </Button>
        </div>
      )}
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
