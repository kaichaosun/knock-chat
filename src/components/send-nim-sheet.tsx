import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import { NIM_DECIMALS, parseNim } from "@/lib/payments"
import { formatNim } from "@/lib/postage"
import { cn } from "@/lib/utils"

/**
 * Send NIM to the person you are talking to.
 *
 * The recipient is fixed and shown rather than typed. This sheet is only ever
 * opened from inside a conversation, and re-asking for an address you are
 * already looking at would be a chance to get it wrong for no benefit.
 */
export function SendNimSheet({
  open,
  onOpenChange,
  peer,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  peer: string
  /** Raises the wallet, then posts the payment into the thread. */
  onSend: (luna: number) => Promise<void>
}) {
  const names = useNames()
  const [value, setValue] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setValue("")
      setError("")
    }
  }, [open])

  const luna = parseNim(value)
  const typed = value.trim() !== ""
  const name = nameIn(names, peer)

  const submit = async () => {
    if (luna === null) return
    setSending(true)
    setError("")
    try {
      await onSend(luna)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment didn't go through")
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Send NIM</SheetTitle>
          <SheetDescription>
            Straight from your wallet to theirs. It leaves a note in this chat, and it
            cannot be undone.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          {/* Who is being paid, at the size that decision deserves. The address
              stays visible: a name is chosen by its owner, and this is money. */}
          <div className="bg-muted flex items-center gap-3 rounded-2xl px-4 py-3">
            <AddressAvatar address={peer} size="sm" />
            <div className="min-w-0 flex-1">
              {name && <p className="truncate text-[15px] leading-tight font-semibold">{name}</p>}
              <p className="text-muted-foreground truncate font-mono text-[12px] font-semibold tracking-tight">
                {shortenAddress(peer)}
              </p>
            </div>
          </div>

          <div className="relative">
            <input
              autoFocus
              value={value}
              inputMode="decimal"
              disabled={sending}
              placeholder="0"
              aria-label="Amount in NIM"
              aria-invalid={typed && luna === null}
              onChange={(event) => setValue(event.target.value.replace(/[^\d.]/g, ""))}
              className={cn(
                "bg-muted w-full rounded-2xl py-4 pr-16 pl-4 text-2xl font-bold tabular-nums outline-none",
                "placeholder:text-muted-foreground/50",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                typed && luna === null && "ring-destructive ring-2",
              )}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold">
              NIM
            </span>
          </div>

          {typed && luna === null && (
            <p className="text-destructive px-1 text-[13px]">
              Enter an amount above zero, with at most {NIM_DECIMALS} decimal places.
            </p>
          )}

          {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

          <Button
            disabled={luna === null || sending}
            onClick={() => void submit()}
            className="brand-gradient h-13 w-full rounded-2xl text-base"
          >
            {sending ? <Loader2 className="animate-spin" /> : null}
            {luna === null ? "Send" : `Send ${formatNim(luna)} NIM`}
          </Button>

          <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
            Your wallet will ask you to confirm. The network fee is on top of the amount.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
