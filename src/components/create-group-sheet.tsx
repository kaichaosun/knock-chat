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
import { MAX_NAME_LEN, type Group } from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * Start a room.
 *
 * Two knobs and a name. The defaults are the ones that make a room worth
 * having — free and open — so creating one is a name and a tap, and the owner
 * only meets the other decisions if they go looking.
 */
export function CreateGroupSheet({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (input: {
    name: string
    join_price_luna: number
    requires_approval: boolean
  }) => Promise<Group>
}) {
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [approval, setApproval] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (open) {
      setName("")
      setPrice("")
      setApproval(false)
      setError("")
    }
  }, [open])

  const trimmed = name.trim()
  const nameLength = [...trimmed].length
  const nameTooLong = nameLength > MAX_NAME_LEN
  // Blank means free, which is the default rather than an error.
  const luna = price.trim() === "" ? 0 : parseNim(price)
  const priceValid = luna !== null
  const canCreate = trimmed !== "" && !nameTooLong && priceValid && !creating

  const submit = async () => {
    if (!canCreate || luna === null) return
    setCreating(true)
    setError("")
    try {
      await onCreate({ name: trimmed, join_price_luna: luna, requires_approval: approval })
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the group")
    } finally {
      setCreating(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>New group</SheetTitle>
          <SheetDescription>
            A room you share by link. Messages here aren't encrypted, and being in it
            together doesn't open a private chat with anyone.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-6">
          <div>
            <input
              autoFocus
              value={name}
              disabled={creating}
              onChange={(event) => setName(event.target.value)}
              placeholder="Group name"
              aria-label="Group name"
              aria-invalid={nameTooLong}
              className={cn(
                "bg-muted w-full rounded-2xl px-4 py-3.5 font-medium outline-none",
                "placeholder:text-muted-foreground/70 placeholder:font-normal",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
                nameTooLong && "ring-destructive ring-2",
              )}
            />
            {nameTooLong && (
              <p className="text-destructive mt-1.5 px-1 text-[13px]">
                A name can be at most {MAX_NAME_LEN} characters.
              </p>
            )}
          </div>

          <div>
            <h3 className="px-1 text-sm font-semibold">Cost to join</h3>
            <p className="text-muted-foreground mt-1 px-1 text-[13px] leading-snug">
              Paid to you, once, by anyone who joins. Leave it empty and anyone with the
              link walks in.
            </p>
            <div className="relative mt-2">
              <input
                value={price}
                inputMode="decimal"
                disabled={creating}
                onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="Free"
                aria-label="Cost to join, in NIM"
                aria-invalid={!priceValid}
                className={cn(
                  "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-semibold tabular-nums outline-none",
                  "placeholder:text-muted-foreground/70 placeholder:font-normal",
                  "focus-visible:ring-ring/60 focus-visible:ring-2",
                  !priceValid && "ring-destructive ring-2",
                )}
              />
              <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium">
                NIM
              </span>
            </div>
          </div>

          <div>
            <h3 className="px-1 text-sm font-semibold">Who can get in</h3>
            <div className="mt-2 flex gap-2">
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  disabled={creating}
                  onClick={() => setApproval(value)}
                  className={cn(
                    "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                    approval === value && "border-primary text-primary",
                  )}
                >
                  <span className="block font-semibold">
                    {value ? "You approve" : "Anyone with the link"}
                  </span>
                  <span className="text-muted-foreground block text-[11px] leading-snug">
                    {value ? "They ask, you answer" : "They walk straight in"}
                  </span>
                </button>
              ))}
            </div>
            {/* The one combination worth warning about: a queue anybody can fill
                for nothing is the problem postage exists to solve. */}
            {approval && luna === 0 && (
              <p className="text-warning mt-2 px-1 text-[12px] leading-snug">
                Asking is free, so anyone can fill your list with requests. A cost to join
                is what keeps that in check.
              </p>
            )}
          </div>

          {error && <p className="text-destructive px-1 text-[13px]">{error}</p>}

          <Button
            disabled={!canCreate}
            onClick={() => void submit()}
            className="brand-gradient h-13 w-full rounded-2xl text-base"
          >
            {creating && <Loader2 className="animate-spin" />}
            Create group
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
