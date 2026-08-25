import { useEffect, useState } from "react"
import { Copy, Loader2, Wifi, WifiOff } from "lucide-react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { RelayStatus } from "@/hooks/use-messages"
import { formatAddress } from "@/lib/address"
import { rememberOne } from "@/lib/names"
import { LUNA_PER_NIM, MAX_NAME_LEN, getReachability, setPolicy, setProfile } from "@/lib/relay"
import { cn } from "@/lib/utils"
import type { WalletMode } from "@/lib/wallet"

/** Offered as taps because typing a number on a phone is a chore. */
const PRESETS_NIM = [0, 1, 10, 100]

/**
 * Your profile: who you are here, and what it costs to reach you.
 *
 * Both are public — anyone can read your address and your price from the relay
 * — which is what makes this a profile rather than settings. Preferences only
 * you experience would belong somewhere else.
 */
export function ProfileSheet({
  open,
  onOpenChange,
  address,
  mode,
  relayStatus,
  onCopy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
  mode: WalletMode
  relayStatus: RelayStatus
  onCopy: (address: string) => void
}) {
  const [nim, setNim] = useState("")
  const [name, setName] = useState("")
  /** What the relay last confirmed, so Save can tell a change from a re-tap. */
  const [savedName, setSavedName] = useState("")
  /**
   * The same for the price, kept in luna rather than NIM — luna is what is
   * actually sent, so "1" and "1.0" compare equal instead of reading as an edit.
   * Null until the relay answers, and again if it never does.
   */
  const [savedLuna, setSavedLuna] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingName, setSavingName] = useState(false)

  // Read the current values each time the sheet opens, so it never shows a
  // stale one after being changed on another device.
  useEffect(() => {
    if (!open) return
    setLoading(true)
    getReachability(address)
      .then((r) => {
        setNim(String(r.policy.amount_luna / LUNA_PER_NIM))
        setSavedLuna(r.policy.amount_luna)
        setName(r.name ?? "")
        setSavedName(r.name ?? "")
      })
      .catch(() => {
        setNim("")
        setSavedLuna(null)
      })
      .finally(() => setLoading(false))
  }, [open, address])

  const parsed = Number(nim)
  const valid = nim.trim() !== "" && Number.isFinite(parsed) && parsed >= 0

  // Counted in characters rather than `length`, which counts UTF-16 units and
  // would call a name of emoji twice as long as it looks.
  const nameLength = [...name.trim()].length
  const nameTooLong = nameLength > MAX_NAME_LEN
  const nameChanged = name.trim() !== savedName

  // What Save would send, and whether sending it would change anything.
  const luna = valid ? Math.round(parsed * LUNA_PER_NIM) : null
  const priceChanged = luna !== null && luna !== savedLuna

  const saveName = async () => {
    setSavingName(true)
    try {
      const saved = await setProfile(name.trim())
      setName(saved.name ?? "")
      setSavedName(saved.name ?? "")
      rememberOne(address, saved.name)
      toast.success(saved.name ? `You'll show up as ${saved.name}` : "Name cleared")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    } finally {
      setSavingName(false)
    }
  }

  const save = async () => {
    if (luna === null) return
    setSaving(true)
    try {
      await setPolicy(luna)
      setSavedLuna(luna)
      toast.success(parsed === 0 ? "Anyone can reach you now" : `Knocks now cost ${parsed} NIM`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Your profile</SheetTitle>
        </SheetHeader>

        <div className="space-y-7 pb-8">
          <section className="flex items-center gap-3.5">
            <AddressAvatar address={address} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[11px]">Your address</p>
              <p className="select-value font-mono text-[13px] leading-relaxed font-semibold wrap-anywhere">
                {formatAddress(address)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onCopy(formatAddress(address))}
                className="mt-2 h-8 rounded-lg"
              >
                <Copy className="size-3.5" />
                Copy
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Your name</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              Shown next to your address to anyone who looks you up. Anyone can pick any
              name, so it is a label rather than proof — your address is what identifies
              you.
            </p>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={loading ? "" : name}
                  disabled={loading || savingName}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Unnamed"
                  aria-label="Your name"
                  aria-invalid={nameTooLong}
                  className={cn(
                    "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-medium outline-none",
                    "placeholder:text-muted-foreground/70 placeholder:font-normal",
                    "focus-visible:ring-ring/60 focus-visible:ring-2",
                    nameTooLong && "ring-destructive ring-2",
                  )}
                />
                {/* Only once it is close to mattering: a counter sitting there
                    from the first keystroke reads as a limit to aim for. */}
                {nameLength > MAX_NAME_LEN - 8 && (
                  <span
                    className={cn(
                      "pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-xs tabular-nums",
                      nameTooLong ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {MAX_NAME_LEN - nameLength}
                  </span>
                )}
              </div>
              <Button
                disabled={loading || savingName || nameTooLong || !nameChanged}
                onClick={() => void saveName()}
                className="h-12 rounded-2xl px-5"
              >
                {savingName && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Cost to knock</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              What someone new pays to reach you. You keep it whether or not you answer.
              People you've let in never pay again.
            </p>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={loading ? "" : nim}
                  inputMode="decimal"
                  disabled={loading || saving}
                  onChange={(event) => setNim(event.target.value.replace(/[^\d.]/g, ""))}
                  aria-label="Cost to knock, in NIM"
                  aria-invalid={!valid && nim.trim() !== ""}
                  className={cn(
                    "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-semibold tabular-nums outline-none",
                    "focus-visible:ring-ring/60 focus-visible:ring-2",
                    !valid && nim.trim() !== "" && "ring-destructive ring-2",
                  )}
                />
                <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : "NIM"}
                </span>
              </div>
              <Button
                disabled={!priceChanged || saving || loading}
                onClick={() => void save()}
                className="h-12 rounded-2xl px-5"
              >
                {saving && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {PRESETS_NIM.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={saving || loading}
                  onClick={() => setNim(String(preset))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    "active:bg-muted disabled:opacity-50",
                    valid && parsed === preset && "border-primary text-primary",
                  )}
                >
                  {preset === 0 ? "Free" : `${preset} NIM`}
                </button>
              ))}
            </div>

            {valid && parsed === 0 && !loading && (
              // Worded as what free means rather than what is in force, because
              // this shows both before Save and after it.
              <p className="text-warning mt-2.5 text-[12px] leading-snug">
                Free means anyone can reach you without paying.
              </p>
            )}
          </section>

          <section className="text-muted-foreground flex items-center gap-4 border-t pt-5 text-xs">
            {/* Three states, not two: before the first poll lands the status is
                simply unknown, and calling that "unreachable" is a lie the user
                has no way to check. */}
            <span className="flex items-center gap-1.5">
              {relayStatus === "offline" ? (
                <WifiOff className="text-destructive size-3.5" />
              ) : relayStatus === "online" ? (
                <Wifi className="text-success size-3.5" />
              ) : (
                <Loader2 className="size-3.5 animate-spin" />
              )}
              {relayStatus === "offline"
                ? "Relay unreachable"
                : relayStatus === "online"
                  ? "Relay connected"
                  : "Checking relay"}
            </span>
            <span className="bg-border h-3 w-px" />
            <span>{mode === "nimiq-pay" ? "Nimiq Pay" : "Development identity"}</span>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}
