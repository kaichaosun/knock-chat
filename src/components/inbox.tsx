import { useState } from "react"
import { MessageSquarePlus, PenLine } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { SwipeRow } from "@/components/swipe-row"
import { Button } from "@/components/ui/button"
import { shortenAddress } from "@/lib/address"
import type { Conversation } from "@/lib/messages"
import { relativeTime } from "@/lib/time"
import { cn } from "@/lib/utils"

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

  return (
    <SwipeRow
      actionLabel={`Delete chat with ${shortenAddress(peer)}`}
      onAction={() => onDelete(peer)}
      onClick={() => onOpen(peer)}
      revealed={revealed}
      onReveal={onReveal}
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
