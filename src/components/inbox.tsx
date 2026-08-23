import { useRef, useState } from "react"
import { MessageSquarePlus, PenLine, Trash2 } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { shortenAddress } from "@/lib/address"
import type { Conversation } from "@/lib/messages"
import { relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

/** How far the row slides to reveal Delete, how far a swipe must go to stick, and
 *  how much travel separates a swipe from a tap. */
const REVEAL_PX = 92
const COMMIT_PX = 45
const SLOP_PX = 8
/** Width at which the icon and label fit; below it they would be clipped. */
const LABEL_PX = 64

export function Inbox({
  conversations,
  onOpen,
  onCompose,
  onDelete,
}: {
  conversations: Conversation[]
  onOpen: (peer: string) => void
  onCompose: () => void
  onDelete: (peer: string) => void
}) {
  // Only one row open at a time, so a stray Delete is never left lurking under
  // a row the user has moved on from.
  const [revealed, setRevealed] = useState<string | null>(null)
  if (conversations.length === 0) {
    return <EmptyInbox onCompose={onCompose} />
  }

  return (
    <div className="relative h-full">
      <ul className="divide-border/60 divide-y px-2 pb-28">
        {conversations.map((conversation) => (
          <ConversationRow
            key={conversation.peer}
            conversation={conversation}
            onOpen={onOpen}
            onDelete={onDelete}
            revealed={revealed === conversation.peer}
            onReveal={(open) => setRevealed(open ? conversation.peer : null)}
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
  onOpen,
  onDelete,
  revealed,
  onReveal,
}: {
  conversation: Conversation
  onOpen: (peer: string) => void
  onDelete: (peer: string) => void
  revealed: boolean
  onReveal: (open: boolean) => void
}) {
  const { peer, last, unread } = conversation
  const preview = last.direction === "out" ? `You: ${last.body}` : last.body

  // Tracked in a ref rather than state: this updates on every touchmove, and
  // re-rendering the list at that rate would stutter.
  const start = useRef<{ x: number; y: number } | null>(null)
  // Set once a gesture has travelled far enough to be a swipe. The browser fires a
  // click after touchend, and without this that click would open the chat too.
  const swiped = useRef(false)
  const [drag, setDrag] = useState(0)

  const distance = revealed ? REVEAL_PX : drag
  // Either fully there or not at all — a partly faded label reads as blurry, and a
  // partly uncovered one reads as broken. It crosses over past the commit point, so
  // its arrival also says that letting go now will keep the row open.
  const showLabel = distance >= LABEL_PX

  return (
    <li className="relative overflow-hidden rounded-2xl">
      {/* Grows in from the right edge as the row slides, so it is never wider than
          what the swipe has actually uncovered. */}
      <button
        type="button"
        aria-label={`Delete chat with ${shortenAddress(peer)}`}
        tabIndex={revealed ? 0 : -1}
        onClick={() => {
          onReveal(false)
          onDelete(peer)
        }}
        style={{ width: distance }}
        className="bg-destructive text-destructive-foreground absolute inset-y-0 right-0 flex flex-col items-center justify-center gap-1 overflow-hidden"
      >
        <span
          className={cn(
            "flex flex-col items-center gap-1 transition-opacity duration-150",
            showLabel ? "opacity-100" : "opacity-0",
          )}
        >
          <Trash2 className="size-4.5" />
          <span className="text-[11px] font-semibold">Delete</span>
        </span>
      </button>

      <button
        type="button"
        style={{ transform: `translateX(${-distance}px)` }}
        onTouchStart={(event) => {
          const touch = event.touches[0]
          start.current = { x: touch.clientX, y: touch.clientY }
          swiped.current = false
        }}
        onTouchMove={(event) => {
          if (!start.current) return
          const touch = event.touches[0]
          const dx = start.current.x - touch.clientX
          // Ignore mostly-vertical gestures so the list still scrolls.
          if (Math.abs(touch.clientY - start.current.y) > Math.abs(dx)) return
          if (Math.abs(dx) > SLOP_PX) swiped.current = true
          setDrag(Math.max(0, Math.min(dx, REVEAL_PX)))
        }}
        onTouchEnd={() => {
          if (drag > COMMIT_PX) onReveal(true)
          else if (revealed) onReveal(false)
          setDrag(0)
          start.current = null
        }}
        onClick={() => {
          // A swipe that fell short still ends in a click; it must not open the chat.
          if (swiped.current) {
            swiped.current = false
            return
          }
          if (revealed) onReveal(false)
          else onOpen(peer)
        }}
        className={cn(
          "bg-background relative flex w-full items-center gap-3.5 px-3 py-3.5 text-left",
          "active:bg-muted transition-colors",
          drag === 0 && "transition-transform",
        )}
      >
        <AddressAvatar address={peer} />

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                "truncate font-mono text-[13px] tracking-tight",
                unread > 0 ? "font-bold" : "font-semibold",
              )}
            >
              {shortenAddress(peer)}
            </span>
            <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
              {relativeTime(last.at)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-3">
            <span
              className={cn(
                "truncate text-sm",
                unread > 0 ? "text-foreground font-medium" : "text-muted-foreground",
              )}
            >
              {preview}
            </span>
            {unread > 0 && (
              <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums">
                {unread}
              </span>
            )}
          </div>
        </div>
      </button>
    </li>
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
