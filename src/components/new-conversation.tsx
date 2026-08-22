import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"

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
import { cn } from "@/lib/utils"

export function NewConversation({
  open,
  onOpenChange,
  onStart,
  myAddress,
  suggestions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onStart: (peer: string) => void
  myAddress: string
  suggestions: Array<{ label: string; address: string }>
}) {
  const [value, setValue] = useState("")

  useEffect(() => {
    if (open) setValue("")
  }, [open])

  const typed = compact(value)
  const valid = isValidAddress(value)
  const isSelf = valid && typed === compact(myAddress)
  const showError = typed.length === 36 && !valid

  const start = (address: string) => {
    onStart(compact(address))
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>New message</SheetTitle>
          <SheetDescription>
            Enter a Nimiq address. They need to have opened Knock at least once, so
            there is a key to encrypt to.
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
              aria-label="Recipient address"
              aria-invalid={showError || isSelf}
              onChange={(event) => setValue(normalizeInput(event.target.value))}
              className={cn(
                "bg-muted w-full rounded-2xl px-4 py-3.5 font-mono tracking-tight outline-none",
                "placeholder:text-muted-foreground/60 placeholder:font-sans",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                (showError || isSelf) && "ring-destructive ring-2",
              )}
            />
            {valid && !isSelf && (
              <CheckCircle2 className="text-success absolute top-1/2 right-4 size-5 -translate-y-1/2" />
            )}
          </div>

          {showError && (
            <p className="text-destructive px-1 text-[13px]">
              That address isn't valid — check for a mistyped character.
            </p>
          )}
          {isSelf && (
            <p className="text-destructive px-1 text-[13px]">
              That's your own address.
            </p>
          )}

          <Button
            size="lg"
            disabled={!valid || isSelf}
            onClick={() => start(value)}
            className="h-13 w-full rounded-2xl text-base"
          >
            Start conversation
          </Button>

          {suggestions.length > 0 && (
            <div className="pt-2">
              <p className="text-muted-foreground mb-2 px-1 text-xs font-medium">
                Test identities
              </p>
              <div className="space-y-1">
                {suggestions.map(({ label, address }) => (
                  <button
                    key={address}
                    type="button"
                    onClick={() => start(address)}
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
