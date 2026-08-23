import { useLayoutEffect, useRef, useState } from "react"
import { ArrowUp, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Matches the relay's `max_body_len`, so the UI stops before the server does. */
const MAX_BODY_BYTES = 4096

export function Composer({
  onSend,
  onAttach,
  disabled,
}: {
  onSend: (body: string) => void
  /** Opens the menu of things a message can be other than text. */
  onAttach: () => void
  disabled?: boolean
}) {
  const [value, setValue] = useState("")
  const textarea = useRef<HTMLTextAreaElement>(null)

  // Grow with the content, up to roughly five lines, then scroll internally.
  useLayoutEffect(() => {
    const element = textarea.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`
  }, [value])

  const bytes = new TextEncoder().encode(value).length
  const overLimit = bytes > MAX_BODY_BYTES
  const canSend = value.trim().length > 0 && !overLimit && !disabled

  const submit = () => {
    if (!canSend) return
    onSend(value.trim())
    setValue("")
  }

  return (
    <div className="bg-background/85 border-t backdrop-blur-xl">
      <div className="flex items-end gap-2 px-3 py-2.5">
        {/* Disabled alongside the composer, not independently: a transfer would
            still go through with the door shut, but the note about it would
            not, leaving money moved and no record of it in the thread. */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={onAttach}
          disabled={disabled}
          aria-label="Send something else"
          className="text-muted-foreground size-11 shrink-0 rounded-full"
        >
          <Plus className="size-5" />
        </Button>

        <textarea
          ref={textarea}
          rows={1}
          value={value}
          disabled={disabled}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends on a hardware keyboard; Shift+Enter always inserts a
            // newline. On touch keyboards Enter inserts a newline as usual.
            if (event.key === "Enter" && !event.shiftKey && !isTouch()) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder="Message"
          aria-label="Message"
          className={cn(
            "bg-muted placeholder:text-muted-foreground max-h-33 min-h-11 flex-1 resize-none",
            "rounded-2xl px-4 py-2.5 leading-snug outline-none",
            "focus-visible:ring-ring/60 focus-visible:ring-2",
            "disabled:opacity-60",
            overLimit && "ring-destructive ring-2",
          )}
        />
        <Button
          type="button"
          size="icon"
          onClick={submit}
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            "size-11 shrink-0 rounded-full transition-transform",
            canSend ? "brand-gradient scale-100" : "scale-95",
          )}
        >
          <ArrowUp className="size-5" />
        </Button>
      </div>

      {overLimit && (
        <p className="text-destructive px-5 pb-2 text-xs">
          {bytes.toLocaleString()} of {MAX_BODY_BYTES.toLocaleString()} bytes — too long to send.
        </p>
      )}
      <div className="pb-safe" />
    </div>
  )
}

function isTouch(): boolean {
  return window.matchMedia("(pointer: coarse)").matches
}
