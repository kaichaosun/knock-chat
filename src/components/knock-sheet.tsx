import { useEffect, useState } from "react"
import { CheckCircle2, Clock, DoorOpen, Loader2 } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { compact, isValidAddress, normalizeInput, shortenAddress } from "@/lib/address"
import { formatNim } from "@/lib/postage"
import type { Reachability } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * Reaching someone new: enter an address, see what it costs, knock.
 *
 * The cost is shown before any wallet dialog appears, because the payment
 * happens first and is not refunded if the knock is then rejected.
 */
export function KnockSheet({
  open,
  onOpenChange,
  myAddress,
  suggestions,
  onReach,
  onKnock,
  onOpenThread,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  myAddress: string
  suggestions: Array<{ label: string; address: string }>
  onReach: (peer: string) => Promise<Reachability>
  onKnock: (peer: string, body: string, policyLuna: number) => Promise<void>
  onOpenThread: (peer: string) => void
}) {
  const [value, setValue] = useState("")
  const [body, setBody] = useState("")
  const [reach, setReach] = useState<Reachability | null>(null)
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setValue("")
      setBody("")
      setReach(null)
      setError("")
    }
  }, [open])

  const typed = compact(value)
  const valid = isValidAddress(value)
  const isSelf = valid && typed === compact(myAddress)

  // Ask the relay what this address costs as soon as one is fully typed.
  useEffect(() => {
    if (!valid || isSelf) {
      setReach(null)
      return
    }
    let cancelled = false
    setChecking(true)
    setError("")
    onReach(value)
      .then((r) => !cancelled && setReach(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Couldn't check"))
      .finally(() => !cancelled && setChecking(false))
    return () => {
      cancelled = true
    }
  }, [value, valid, isSelf, onReach])

  const submit = async () => {
    if (!reach || !body.trim()) return
    setSending(true)
    setError("")
    try {
      await onKnock(value, body.trim(), reach.policy.amount_luna)
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't knock")
    } finally {
      setSending(false)
    }
  }

  const cost = reach ? reach.policy.amount_luna : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Knock on a door</SheetTitle>
          <SheetDescription>
            Reaching someone new costs once. After they let you in, messages are free
            both ways, forever.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          <div className="relative">
            <input
              autoFocus
              value={value}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="NQ.. .... .... .... ...."
              aria-label="Their address"
              aria-invalid={(typed.length === 36 && !valid) || isSelf}
              onChange={(event) => setValue(normalizeInput(event.target.value))}
              className={cn(
                "bg-muted w-full rounded-2xl px-4 py-3.5 font-mono tracking-tight outline-none",
                "placeholder:text-muted-foreground/60 placeholder:font-sans",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                ((typed.length === 36 && !valid) || isSelf) && "ring-destructive ring-2",
              )}
            />
            {checking && (
              <Loader2 className="text-muted-foreground absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin" />
            )}
            {valid && !isSelf && !checking && reach && (
              <CheckCircle2 className="text-success absolute top-1/2 right-4 size-5 -translate-y-1/2" />
            )}
          </div>

          {typed.length === 36 && !valid && (
            <p className="text-destructive px-1 text-[13px]">
              That address isn't valid — check for a mistyped character.
            </p>
          )}
          {isSelf && <p className="text-destructive px-1 text-[13px]">That's your own address.</p>}

          {reach?.channel_open && (
            <div className="bg-accent text-accent-foreground flex items-center gap-2.5 rounded-2xl p-3.5 text-[13px]">
              <DoorOpen className="size-4 shrink-0" />
              <span className="flex-1">You're already in. Messages are free.</span>
              <Button
                size="sm"
                className="h-8 rounded-lg"
                onClick={() => {
                  onOpenThread(compact(value))
                  onOpenChange(false)
                }}
              >
                Open
              </Button>
            </div>
          )}

          {reach?.knock_pending && (
            <div className="bg-muted text-muted-foreground flex items-center gap-2.5 rounded-2xl p-3.5 text-[13px]">
              <Clock className="size-4 shrink-0" />
              You've already knocked. Waiting for them to answer.
            </div>
          )}

          {reach && !reach.channel_open && !reach.knock_pending && (
            <>
              <textarea
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Say who you are"
                aria-label="Your message"
                className={cn(
                  "bg-muted w-full resize-none rounded-2xl px-4 py-3 leading-snug outline-none",
                  "focus-visible:ring-ring/60 focus-visible:ring-2",
                )}
              />

              <Button
                size="lg"
                disabled={!body.trim() || sending}
                onClick={submit}
                className="h-13 w-full rounded-2xl text-base"
              >
                {sending ? <Loader2 className="animate-spin" /> : null}
                {cost === 0 ? "Knock" : `Knock — ${formatNim(cost)} NIM`}
              </Button>

              <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                {cost === 0
                  ? "They've made themselves free to reach."
                  : `They keep the ${formatNim(cost)} NIM whether or not they answer.`}
              </p>
            </>
          )}

          {error && <p className="text-destructive px-1 text-[13px] text-balance">{error}</p>}

          {suggestions.length > 0 && !reach && (
            <div className="pt-2">
              <p className="text-muted-foreground mb-2 px-1 text-xs font-medium">
                Test identities
              </p>
              <div className="space-y-1">
                {suggestions.map(({ label, address }) => (
                  <button
                    key={address}
                    type="button"
                    onClick={() => setValue(normalizeInput(address))}
                    className="active:bg-muted flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors"
                  >
                    <AddressAvatar address={address} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium capitalize">{label}</p>
                      <p className="text-muted-foreground truncate font-mono text-[11px]">
                        {shortenAddress(address)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
