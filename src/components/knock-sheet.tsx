import { useEffect, useRef, useState } from "react"
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
import { canBeReached } from "@/lib/keys"
import { compact, isValidAddress, normalizeInput, shortenAddress } from "@/lib/address"
import { rememberOne, sanitize } from "@/lib/names"
import type { Receipt } from "@/lib/receipts"
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
  peer,
  suggestions,
  onReach,
  held,
  onKnock,
  onOpenThread,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  myAddress: string
  /** Set when knocking on a door you already know — from inside a closed chat.
   *  The address is then fixed rather than typed. */
  peer?: string
  suggestions: Array<{ label: string; address: string }>
  onReach: (peer: string) => Promise<Reachability>
  /** The payment already made for this address, if one is waiting to be used. */
  held: (peer: string) => Receipt | null
  onKnock: (peer: string, body: string, policyLuna: number) => Promise<void>
  onOpenThread: (peer: string) => void
}) {
  const [value, setValue] = useState("")
  const [body, setBody] = useState("")
  const [reach, setReach] = useState<Reachability | null>(null)
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  /**
   * Whether there is anybody at this address to answer.
   *
   * Null until asked. A knock is sealed to the recipient's key, and somebody who
   * has never opened Knock has published none — so the price on the button is
   * for something that cannot happen, and saying so first is the whole point of
   * a screen you look at before paying.
   */
  const [reachable, setReachable] = useState<boolean | null>(null)

  useEffect(() => {
    if (open) {
      setValue(peer ? normalizeInput(peer) : "")
      setBody("")
      setReach(null)
      setReachable(null)
      setError("")
    }
  }, [open, peer])

  // The address a message was last put back for, so editing it sticks: the
  // words are restored once when the recipient becomes known, never again.
  const restoredFor = useRef<string | null>(null)

  const typed = compact(value)
  const valid = isValidAddress(value)
  const isSelf = valid && typed === compact(myAddress)

  // Put back what they wrote last time, once the recipient is known. They can
  // send it as it stands or write something else; the payment is bound to who
  // paid, not to the words, so changing it costs nothing.
  useEffect(() => {
    if (!open) {
      restoredFor.current = null
      return
    }
    if (!valid || isSelf) return
    if (restoredFor.current === typed) return
    restoredFor.current = typed

    const earlier = held(value)?.body
    if (earlier) setBody(earlier)
  }, [open, valid, isSelf, typed, value, held])

  // Ask the relay what this address costs as soon as one is fully typed.
  useEffect(() => {
    if (!valid || isSelf) {
      setReach(null)
      setReachable(null)
      return
    }
    let cancelled = false
    setChecking(true)
    setError("")
    // Asked alongside the price, because the two are only useful together: what
    // it costs, and whether it can happen at all.
    void canBeReached(value).then((yes) => !cancelled && setReachable(yes))
    onReach(value)
      .then((r) => {
        if (cancelled) return
        setReach(r)
        rememberOne(value, r.name)
      })
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
  /**
   * Already paid for, on an attempt that did not get through.
   *
   * Shown rather than silently reused, because the button otherwise offers to
   * charge for something already bought — and that offer is what cost people
   * money before the payment was written down.
   */
  const holding = valid && !isSelf ? held(value) : null
  const alreadyPaid = holding !== null
  /**
   * What this address says it is called.
   *
   * Read from the relay's answer rather than the directory, because this is the
   * one screen where the address might belong to someone never seen before —
   * and it is deliberately never the only thing shown. Paying to reach a name is
   * paying to reach whoever claimed it.
   */
  const claimed = reach?.name ? sanitize(reach.name) : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{peer ? "Knock to reopen" : "Knock on a door"}</SheetTitle>
          <SheetDescription>
            {peer
              ? "This chat is closed. Knocking asks them to open it again — after that, messages are free both ways."
              : "Knocking may cost once. After they let you in, messages are free both ways and encrypted."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 pb-6">
          {peer ? (
            <div className="bg-muted flex items-center gap-3 rounded-2xl px-4 py-3">
              <AddressAvatar address={peer} size="sm" />
              <div className="min-w-0 flex-1">
                {claimed && <p className="truncate text-[15px] leading-tight font-semibold">{claimed}</p>}
                <p className="text-muted-foreground truncate font-mono text-[12px] font-semibold tracking-tight">
                  {shortenAddress(peer)}
                </p>
              </div>
              {checking && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
            </div>
          ) : (
          <div className="relative">
            <input
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
                "bg-muted w-full rounded-2xl py-3.5 pl-4 pr-11 font-mono text-[13px] tracking-tight outline-none",
                "placeholder:text-muted-foreground/60 placeholder:font-sans placeholder:text-base",
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
          )}

          {typed.length === 36 && !valid && (
            <p className="text-destructive px-1 text-[13px]">
              That address isn't valid — check for a mistyped character.
            </p>
          )}
          {isSelf && <p className="text-destructive px-1 text-[13px]">That's your own address.</p>}

          {!peer && claimed && (
            <p className="text-muted-foreground px-1 text-[13px]">
              This address calls itself <span className="text-foreground font-semibold">{claimed}</span>.
              Anyone can choose any name.
            </p>
          )}

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

          {/* The whole task, from the moment the sheet opens: address, message,
              knock. Waiting for the relay before drawing the last two left it
              opening as a stub and then jumping twice as an address was typed —
              and a sheet whose height is set by how far through you are is one
              you cannot see the shape of before you start. What the relay
              answers changes what the button says, not whether it is there. */}
          {!reach?.channel_open && !reach?.knock_pending && (
            <>
              {alreadyPaid && (
                <p className="text-muted-foreground px-1 text-[12px] leading-snug">
                  This is what you wrote last time. Send it as it is, or change it.
                </p>
              )}

              <textarea
                rows={3}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Say who you are"
                aria-label="Your message"
                className={cn(
                  "bg-muted w-full resize-none rounded-2xl px-4 py-3 leading-snug outline-none",
                  "placeholder:text-muted-foreground/70",
                  "focus-visible:ring-ring/60 focus-visible:ring-2",
                )}
              />

              <Button
                size="lg"
                disabled={!reach || reachable === false || !body.trim() || sending}
                onClick={submit}
                className="h-13 w-full rounded-2xl text-base"
              >
                {sending ? <Loader2 className="animate-spin" /> : null}
                {/* No price on a door nobody is behind. The relay quotes its
                    default for an address it has never seen, which is right —
                    anyone can be knocked on before they have set a price — but
                    quoting it here would put a number on something that cannot
                    happen, greyed out or not. */}
                {reachable === false
                  ? "Knock"
                  : alreadyPaid
                    ? "Knock — already paid"
                    : cost === 0
                      ? "Knock"
                      : `Knock — ${formatNim(cost)} NIM`}
              </Button>

              <p className="text-muted-foreground px-1 text-center text-[12px] leading-snug">
                {reachable === false
                  ? "Nobody has opened Knock at this address, so there is no key to seal a message to and no way for them to answer."
                  : !reach
                  ? "Enter their address to see what it costs."
                  : alreadyPaid
                    ? "You've already paid for this one. Sending it again won't charge you."
                    : cost === 0
                      ? "They've made themselves free to reach."
                      : `They keep the ${formatNim(cost)} NIM whether or not they answer.`}
              </p>
            </>
          )}

          {error && <p className="text-destructive px-1 text-[13px] text-balance">{error}</p>}

          {suggestions.length > 0 && !reach && !peer && (
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
