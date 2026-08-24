import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { parseNim } from "@/lib/payments"
import { formatNim } from "@/lib/postage"
import { cn } from "@/lib/utils"

/** Offered as taps, since a share count is a small number and typing is a chore. */
const SHARE_PRESETS = [3, 5, 10, 20]

/**
 * Leave a pot in the room.
 *
 * The two knobs are the amount and how many can take a share; everything else
 * is a consequence. What each person would get is shown as it is typed —
 * dividing NIM by people in your head is exactly the sum a phone should do,
 * and it is the number the sender actually cares about.
 */
export function SendGiftSheet({
  open,
  onOpenChange,
  expiresInHours,
  maxShares,
  onSend,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** How long the relay holds what nobody takes. */
  expiresInHours: number
  maxShares: number
  onSend: (input: {
    total_luna: number
    shares: number
    split: "even" | "random"
    note: string
  }) => Promise<void>
}) {
  const [amount, setAmount] = useState("")
  // Text rather than a number, so a half-typed value stays half-typed instead
  // of snapping to something the person did not mean.
  const [shareText, setShareText] = useState("5")
  const [split, setSplit] = useState<"even" | "random">("random")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setAmount("")
      setShareText("5")
      setSplit("random")
      setNote("")
      setError("")
    }
  }, [open])

  const luna = parseNim(amount)
  const typed = amount.trim() !== ""

  const shares = Number.parseInt(shareText, 10)
  const sharesValid = Number.isInteger(shares) && shares >= 1 && shares <= maxShares

  // Every share needs a luna of its own, or somebody would get nothing — which
  // the relay refuses, so there is no sense offering it here.
  const enough = luna !== null && sharesValid && luna >= shares
  const each = enough && luna !== null ? Math.floor(luna / shares) : 0

  const submit = async () => {
    if (luna === null || !enough || !sharesValid) return
    setSending(true)
    setError("")
    try {
      await onSend({ total_luna: luna, shares, split, note: note.trim() })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't leave the gift")
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Leave a gift</SheetTitle>
          <SheetDescription>
            First come, first served. Whatever nobody takes comes back to you after{" "}
            {expiresInHours} hours.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="relative">
            <input
              autoFocus
              value={amount}
              inputMode="decimal"
              disabled={sending}
              placeholder="0"
              aria-label="Total, in NIM"
              aria-invalid={typed && !enough}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
              className={cn(
                "bg-muted w-full rounded-2xl py-4 pr-16 pl-4 text-2xl font-bold tabular-nums outline-none",
                "placeholder:text-muted-foreground/50",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                typed && !enough && "ring-destructive ring-2",
              )}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold">
              NIM
            </span>
          </div>

          <div>
            <h3 className="px-1 text-sm font-semibold">How many can take a share</h3>

            {/* Typed or tapped. The presets are the common answers, not the
                only ones — anything up to the relay's limit is allowed. */}
            <div className="relative mt-2">
              <input
                value={shareText}
                inputMode="numeric"
                disabled={sending}
                aria-label="How many shares"
                aria-invalid={!sharesValid}
                onChange={(event) => setShareText(event.target.value.replace(/[^\d]/g, ""))}
                className={cn(
                  "bg-muted w-full rounded-2xl py-3 pr-20 pl-4 font-semibold tabular-nums outline-none",
                  "focus-visible:ring-ring/60 focus-visible:ring-2",
                  !sharesValid && "ring-destructive ring-2",
                )}
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium">
                {sharesValid && shares === 1 ? "person" : "people"}
              </span>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {SHARE_PRESETS.filter((preset) => preset <= maxShares).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={sending}
                  onClick={() => setShareText(String(preset))}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                    "active:bg-muted disabled:opacity-50",
                    shares === preset && "border-primary text-primary",
                  )}
                >
                  {preset}
                </button>
              ))}
            </div>

            {!sharesValid && (
              <p className="text-destructive mt-2 px-1 text-[13px]">
                Between 1 and {maxShares} people.
              </p>
            )}
          </div>

          <div>
            <h3 className="px-1 text-sm font-semibold">How it's divided</h3>
            <div className="mt-2 flex gap-2">
              {(["random", "even"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={sending}
                  onClick={() => setSplit(mode)}
                  className={cn(
                    "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                    split === mode && "border-primary text-primary",
                  )}
                >
                  <span className="block font-semibold">
                    {mode === "random" ? "Random" : "Even"}
                  </span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">
                    {mode === "random"
                      ? "Somebody gets the good one"
                      : enough
                        ? `${formatNim(each)} NIM each`
                        : "Everyone the same"}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <input
            value={note}
            disabled={sending}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Say something (optional)"
            aria-label="A word with the gift"
            className={cn(
              "bg-muted w-full rounded-2xl px-4 py-3 outline-none",
              "placeholder:text-muted-foreground/70",
              "focus-visible:ring-ring/60 focus-visible:ring-2",
            )}
          />

          {typed && !enough && sharesValid && (
            <p className="text-destructive px-1 text-[13px]">
              {luna === null
                ? "Enter an amount above zero."
                : `Too little to split ${shares} ways — every share needs at least one luna.`}
            </p>
          )}

          {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

          <Button
            disabled={!enough || sending}
            onClick={() => void submit()}
            className="brand-gradient h-13 w-full rounded-2xl text-base"
          >
            {sending && <Loader2 className="animate-spin" />}
            {enough && luna !== null
              ? `Leave ${formatNim(luna)} NIM`
              : "Leave a gift"}
          </Button>

          <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
            Your wallet will ask you to confirm. The relay holds the money until it's
            taken or returned.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
