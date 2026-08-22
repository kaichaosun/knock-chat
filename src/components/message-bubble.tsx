import { AlertCircle, Check, Clock, LockKeyhole } from "lucide-react"

import type { Message } from "@/lib/messages"
import { clockTime } from "@/lib/time"
import { cn } from "@/lib/utils"

export function MessageBubble({
  message,
  onRetry,
}: {
  message: Message
  onRetry: (message: Message) => void
}) {
  const outgoing = message.direction === "out"
  const failed = message.status === "failed"

  // Kept and shown rather than hidden: a message this device cannot read is
  // still evidence someone wrote, and dropping it would leave a silent gap.
  if (message.undecryptable) {
    return (
      <div className="flex w-full justify-start">
        <div className="bg-muted/60 text-muted-foreground flex max-w-[80%] items-center gap-2 rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] italic">
          <LockKeyhole className="size-3.5 shrink-0" />
          Can't be opened on this device
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex w-full", outgoing ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%]", outgoing && "flex flex-col items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug whitespace-pre-wrap",
            "wrap-anywhere",
            outgoing
              ? "brand-gradient rounded-br-md text-white shadow-sm"
              : "bg-muted text-foreground rounded-bl-md",
            failed && "opacity-60",
          )}
        >
          {message.body}
        </div>

        <div
          className={cn(
            "text-muted-foreground mt-1 flex items-center gap-1 px-1 text-[11px]",
            outgoing ? "flex-row-reverse" : "flex-row",
          )}
        >
          <span className="tabular-nums">{clockTime(message.at)}</span>
          {outgoing && <DeliveryState message={message} onRetry={onRetry} />}
        </div>
      </div>
    </div>
  )
}

function DeliveryState({
  message,
  onRetry,
}: {
  message: Message
  onRetry: (message: Message) => void
}) {
  if (message.status === "sending") {
    return <Clock className="size-3 animate-pulse" aria-label="Sending" />
  }
  if (message.status === "failed") {
    return (
      <button
        type="button"
        onClick={() => onRetry(message)}
        className="text-destructive flex items-center gap-1 font-medium"
      >
        <AlertCircle className="size-3" />
        Tap to retry
      </button>
    )
  }
  return <Check className="size-3" aria-label="Sent" />
}
