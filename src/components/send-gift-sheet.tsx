import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AlreadyPaidError } from "@/lib/gift-funding"
import { parseNim } from "@/lib/payments"
import { reason } from "@/lib/reason"
import { formatNim } from "@/lib/postage"
import { MAX_AMOUNT_LUNA, MAX_AMOUNT_NIM } from "@/lib/relay"
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
  const { t } = useTranslation()
  const [amount, setAmount] = useState("")
  // Text rather than a number, so a half-typed value stays half-typed instead
  // of snapping to something the person did not mean.
  const [shareText, setShareText] = useState("5")
  const [split, setSplit] = useState<"even" | "random">("random")
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  // Set once the wallet has paid. From here there is nothing to try again —
  // only something to wait for.
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (open) {
      setAmount("")
      setShareText("5")
      setSplit("random")
      setNote("")
      setError("")
      setPaid(false)
    }
  }, [open])

  const luna = parseNim(amount)
  const typed = amount.trim() !== ""
  /** As in the transfer sheet: "0" and "0." are on the way to every amount. */
  const [settled, setSettled] = useState(false)

  const shares = Number.parseInt(shareText, 10)
  const sharesValid = Number.isInteger(shares) && shares >= 1 && shares <= maxShares

  const overMax = luna !== null && luna > MAX_AMOUNT_LUNA

  // Every share needs a luna of its own, or somebody would get nothing — which
  // the relay refuses, so there is no sense offering it here. And a ceiling at
  // the other end, which the relay also refuses — better met before a wallet
  // opens than after.
  const enough = luna !== null && sharesValid && luna >= shares && !overMax
  const wrong = settled && typed && !enough
  const each = enough && luna !== null ? Math.floor(luna / shares) : 0

  const submit = async () => {
    if (luna === null || !enough || !sharesValid) return
    setSending(true)
    setError("")
    try {
      await onSend({ total_luna: luna, shares, split, note: note.trim() })
      onOpenChange(false)
    } catch (e) {
      if (e instanceof AlreadyPaidError) setPaid(true)
      setError(reason(e, t("gift.failed")))
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("gift.title")}</SheetTitle>
          <SheetDescription>
            {t("gift.note", { hours: expiresInHours })}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div className="relative">
            <input
              autoFocus
              value={amount}
              inputMode="decimal"
              disabled={sending || paid}
              placeholder="0"
              aria-label={t("gift.totalLabel")}
              aria-invalid={wrong}
              onBlur={() => setSettled(true)}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
              className={cn(
                "bg-muted w-full rounded-2xl py-4 pr-16 pl-4 text-2xl font-bold tabular-nums outline-none",
                "placeholder:text-muted-foreground/50",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                wrong && "ring-destructive ring-2",
              )}
            />
            <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 font-semibold">
              NIM
            </span>
          </div>

          {overMax && (
            <p className="text-destructive px-1 text-[12px] leading-snug">
              {MAX_AMOUNT_NIM.toLocaleString()} NIM is the most a gift can hold.
            </p>
          )}

          <div>
            <h3 className="px-1 text-sm font-semibold">How many can take a share</h3>

            {/* Typed or tapped. The presets are the common answers, not the
                only ones — anything up to the relay's limit is allowed. */}
            <div className="relative mt-2">
              <input
                value={shareText}
                inputMode="numeric"
                disabled={sending || paid}
                aria-label={t("gift.sharesLabel")}
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
                  disabled={sending || paid}
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
                {t("gift.sharesRange", { max: maxShares })}
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
                  disabled={sending || paid}
                  onClick={() => setSplit(mode)}
                  className={cn(
                    "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                    split === mode && "border-primary text-primary",
                  )}
                >
                  <span className="block font-semibold">
                    {t(mode === "random" ? "gift.random" : "gift.even")}
                  </span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">
                    {mode === "random"
                      ? t("gift.randomNote")
                      : enough
                        ? `${formatNim(each)} NIM each`
                        : t("gift.evenNote")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <input
            value={note}
            disabled={sending || paid}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("gift.wordPlaceholder")}
            aria-label={t("gift.wordLabel")}
            className={cn(
              "bg-muted w-full rounded-2xl px-4 py-3 outline-none",
              "placeholder:text-muted-foreground/70",
              "focus-visible:ring-ring/60 focus-visible:ring-2",
            )}
          />

          {wrong && sharesValid && (
            <p className="text-destructive px-1 text-[13px]">
              {luna === null
                ? t("gift.aboveZero")
                : `Too little to split ${shares} ways — every share needs at least one luna.`}
            </p>
          )}

          {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

          {paid ? (
            // Paid, not placed. The one thing that must not be offered here is
            // the button that pays again.
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="h-13 w-full rounded-2xl text-base"
              >
                Close
              </Button>
              <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                {t("gift.safe", { amount: formatNim(luna ?? 0) })}
              </p>
            </>
          ) : (
            <>
              <Button
                disabled={!enough || sending}
                onClick={() => void submit()}
                className="brand-gradient h-13 w-full rounded-2xl text-base"
              >
                {sending && <Loader2 className="animate-spin" />}
                {enough && luna !== null
                  ? t("gift.leaveFor", { amount: formatNim(luna) })
                  : t("gift.title")}
              </Button>

              <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                {t("gift.confirmNote")}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
