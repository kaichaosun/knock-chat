import { useEffect, useMemo, useRef } from "react"
import { ChevronLeft, Copy } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Composer } from "@/components/composer"
import { MessageBubble } from "@/components/message-bubble"
import { Button } from "@/components/ui/button"
import { formatAddress, shortenAddress } from "@/lib/address"
import type { Message } from "@/lib/messages"
import { dayLabel } from "@/lib/time"

export function Conversation({
  peer,
  messages,
  onBack,
  onSend,
  onRetry,
  onCopyAddress,
}: {
  peer: string
  messages: Message[]
  onBack: () => void
  onSend: (body: string) => void
  onRetry: (message: Message) => void
  onCopyAddress: (address: string) => void
}) {
  const bottom = useRef<HTMLDivElement>(null)

  // Keep the newest message in view as the thread grows or the keyboard opens.
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" })
  }, [messages.length])

  const groups = useMemo(() => groupByDay(messages), [messages])

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

          <AddressAvatar address={peer} size="sm" />

          <div className="min-w-0 flex-1 px-1">
            <p className="truncate font-mono text-[13px] font-semibold tracking-tight">
              {shortenAddress(peer)}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopyAddress(formatAddress(peer))}
            aria-label="Copy address"
            className="size-10 shrink-0 rounded-full"
          >
            <Copy className="size-4" />
          </Button>

        </div>
      </header>

      <div className="scrollbar-none flex-1 overflow-y-auto overscroll-contain px-3.5 py-4">
        {groups.length === 0 ? (
          <ThreadIntro peer={peer} />
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-1">
              <div className="sticky top-1 z-[1] my-3 flex justify-center">
                <span className="bg-muted/90 text-muted-foreground rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur">
                  {group.label}
                </span>
              </div>
              <div className="space-y-2">
                {group.messages.map((message) => (
                  <MessageBubble key={message.id} message={message} onRetry={onRetry} />
                ))}
              </div>
            </section>
          ))
        )}
        <div ref={bottom} />
      </div>

      <Composer onSend={onSend} />
    </div>
  )
}

function ThreadIntro({ peer }: { peer: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <AddressAvatar address={peer} size="lg" />
      <p className="mt-4 font-mono text-[13px] font-semibold">{shortenAddress(peer)}</p>
      <p className="text-muted-foreground mt-2 text-sm text-balance">
        This is the start of your conversation. Say hello.
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
