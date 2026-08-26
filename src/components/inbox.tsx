import { useState } from "react"
import { Clock, MessageSquarePlus, Pin, PinOff, Plus } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
import { GroupAvatar } from "@/components/group-avatar"
import { SwipeRow } from "@/components/swipe-row"
import { Button } from "@/components/ui/button"
import { useNames } from "@/hooks/use-names"
import { usePins } from "@/hooks/use-pins"
import { useRooms } from "@/hooks/use-rooms"
import { shortenAddress } from "@/lib/address"
import { labelIn, nameIn, type Directory } from "@/lib/names"
import { arrange, isPinned, toggle as togglePin } from "@/lib/pins"
import { preview } from "@/lib/payload"
import type { Conversation } from "@/lib/messages"
import type { Group } from "@/lib/relay"
import { relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function Inbox({
  conversations,
  groups,
  knocked,
  onOpen,
  onCompose,
  onDelete,
  floating,
}: {
  conversations: Conversation[]
  /** The rooms you are in, so a room's thread can be labelled with its name. */
  groups: Group[]
  /** Addresses you have knocked on and are still waiting to hear from. */
  knocked: Set<string>
  onOpen: (thread: string) => void
  onCompose: () => void
  onDelete: (thread: string) => void
  /** Whether the compose button belongs here. Off, it lives in the header. */
  floating: boolean
}) {
  // Only one row open at a time, so a stray Delete is never left lurking under
  // a row the user has moved on from.
  const [revealed, setRevealed] = useState<string | null>(null)
  /** The thread a held finger opened the menu for. */
  const [holding, setHolding] = useState<Conversation | null>(null)
  const names = useNames()
  const pins = usePins()
  const remembered = useRooms()
  // Remembered first, live over the top. A room that was disbanded is only in
  // the first, and without it its thread would be titled "Group" — the row
  // would lose its name at the moment there is nothing left to look it up with.
  const rooms = new Map<string, Group>(Object.entries(remembered))
  for (const group of groups) rooms.set(group.id, group)
  // Pinned first, in the order they were pinned; the rest keep the recency the
  // list arrived in. Done here rather than upstream because a pin is a fact
  // about this device, and the thread list is a fact about the relay.
  const ordered = arrange(conversations, pins)
  // How far down the block reaches. `arrange` puts pinned rows first, so this
  // is a count rather than a search — and rows whose thread has not loaded yet
  // are not in the list, so it counts what is drawn rather than what is held.
  const heldUp = ordered.findIndex((conversation) => !isPinned(pins, conversation.key))
  const pinnedCount = heldUp === -1 ? ordered.length : heldUp

  return (
    // `min-h-full`, not `h-full`: the button below sticks to the bottom of the
    // scrollport, and a sticky box is confined to its containing block. At a
    // flat 100% that block is one screen tall however long the list is, so the
    // button would come unstuck a screenful down and scroll away with the rest.
    // A minimum lets the box grow with the list it contains.
    //
    // A column, so the button can be pushed to the bottom of it. Sticky only
    // holds something *up* against the edge of the scrollport — it does not
    // move it down — so after a short list the button's ordinary place is
    // directly under the last row, halfway up the screen.
    <div className="relative flex min-h-full flex-col">
      {conversations.length === 0 ? (
        <EmptyInbox />
      ) : (
        /* Room for the button when there is one to clear. */
        <ul className={cn("px-2", floating ? "pb-28" : "pb-24")}>
          {ordered.map((conversation, index) => (
            <ConversationRow
              key={conversation.key}
              conversation={conversation}
              room={conversation.group ? rooms.get(conversation.group) : undefined}
              names={names}
              onOpen={onOpen}
              onDelete={onDelete}
              waiting={conversation.peer !== null && knocked.has(conversation.peer)}
              pinned={index < pinnedCount}
              blockStart={index === 0}
              blockEnd={index === pinnedCount - 1}
              onLongPress={() => setHolding(conversation)}
              revealed={revealed === conversation.key}
              onReveal={(open) => setRevealed(open ? conversation.key : null)}
            />
          ))}
        </ul>
      )}

      {floating && <ComposeButton onCompose={onCompose} />}

      {/* What a held finger opens. One row today, and a menu rather than a
          straight toggle because the next thing anyone wants here — mute, mark
          read — is another row in it, where a gesture that does exactly one
          thing has nowhere to put the second. */}
      <AttachMenu
        open={holding !== null}
        onOpenChange={(open) => !open && setHolding(null)}
        title={holding ? threadTitle(holding, rooms, names) : ""}
        actions={
          holding
            ? [
                {
                  icon: isPinned(pins, holding.key) ? PinOff : Pin,
                  label: isPinned(pins, holding.key) ? "Unpin" : "Pin to top",
                  description: isPinned(pins, holding.key)
                    ? "Let it sit by when it last stirred again."
                    : "Hold it above the rest. The newest pin goes highest.",
                  onSelect: () => togglePin(holding.key),
                },
              ]
            : []
        }
      />
    </div>
  )
}

/**
 * The title over the menu a held row opens.
 *
 * Says what kind of thread it is as well as which one, because the menu covers
 * both and the actions in it will not always mean the same for each. A bare
 * name would also read as the thing you are about to act on, when what you are
 * acting on is the thread.
 */
function threadTitle(
  conversation: Conversation,
  rooms: Map<string, Group>,
  names: Directory,
): string {
  if (conversation.group) {
    return `Group chat: ${rooms.get(conversation.group)?.name ?? "Group"}`
  }
  // Nothing to be "with" if the peer is missing, which is a thread that should
  // not exist — say the half that is still true rather than inventing a name.
  if (!conversation.peer) return "Direct message"
  return `Direct message with ${labelIn(names, conversation.peer)}`
}

function ConversationRow({
  conversation,
  room,
  names,
  waiting,
  onOpen,
  onDelete,
  pinned,
  blockStart,
  blockEnd,
  onLongPress,
  revealed,
  onReveal,
}: {
  conversation: Conversation
  /** Set when this thread is a room, and absent while its details load. */
  room: Group | undefined
  names: Directory
  /** A knock of yours is at this door, unanswered. */
  waiting: boolean
  onOpen: (thread: string) => void
  onDelete: (thread: string) => void
  pinned: boolean
  /** Where this row sits in the pinned block, so only its ends are rounded. */
  blockStart: boolean
  blockEnd: boolean
  onLongPress: () => void
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
      onLongPress={onLongPress}
      revealed={revealed}
      onReveal={onReveal}
      // One tinted block rather than a mark on every row: what is being said is
      // that these belong together and sit above the rest, which is a fact
      // about the group and not about any row in it. Rounded at the ends only,
      // so a run of them reads as one shape instead of a stack of chips.
      surface={pinned ? "bg-accent active:brightness-95" : undefined}
      className={cn(
        pinned && "rounded-none",
        pinned && blockStart && "rounded-t-2xl",
        pinned && blockEnd && "rounded-b-2xl",
      )}
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
          {unread > 0 ? (
            <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
              {unread}
            </span>
          ) : (
            waiting && (
              /* Why this thread has gone quiet. The last thing in it is your
                 own knock, which otherwise reads as a message they simply have
                 not replied to — and a knock is not delivered until it is
                 answered. */
              <span className="bg-muted text-muted-foreground flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium">
                <Clock className="size-3" />
                Knock sent
              </span>
            )
          )}
        </div>
      </div>
    </SwipeRow>
  )
}

/**
 * The one way to start something, wherever the list is at.
 *
 * A plus, not a pen: it opens a menu of three unrelated things — a message, a
 * room of your own, a room of somebody else's — and a pen claims the first of
 * them. The one glyph that means "add something" without saying which is the
 * honest one here.
 *
 * Small, and not quite opaque. A plus is the densest glyph in the app — two
 * full-length strokes crossing, no counters — so at the size a drawn icon
 * needs it reads twice as loud as one.
 */
function ComposeButton({ onCompose }: { onCompose: () => void }) {
  return (
    <div className="pointer-events-none sticky bottom-0 mt-auto flex justify-end px-5 pb-safe">
      <Button
        size="icon"
        onClick={onCompose}
        aria-label="New chat"
        className="bg-primary/85 pointer-events-auto mb-5 size-12 rounded-full shadow-md shadow-primary/20 backdrop-blur-sm"
      >
        <Plus className="size-5" />
      </Button>
    </div>
  )
}

function EmptyInbox() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-10 pb-16 text-center">
      <div className="bg-accent text-accent-foreground flex size-20 items-center justify-center rounded-3xl">
        <MessageSquarePlus className="size-9" strokeWidth={1.5} />
      </div>
      <h2 className="mt-6 text-xl font-bold tracking-tight">No messages yet</h2>
      <p className="text-muted-foreground mt-2 max-w-[18rem] text-balance">
        Start a conversation with anyone who has opened Knock.
      </p>
    </div>
  )
}
