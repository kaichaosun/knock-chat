import { useEffect, useState } from "react"
import { Copy, Loader2, LogOut, QrCode as QrCodeIcon, Settings, Wifi, WifiOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { MyCodeSheet } from "@/components/my-code-sheet"
import { SettingsSheet } from "@/components/settings-sheet"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { RelayStatus } from "@/hooks/use-messages"
import { formatAddress } from "@/lib/address"
import { rememberOne } from "@/lib/names"
import {
  LUNA_PER_NIM,
  MAX_AMOUNT_NIM,
  MAX_NAME_LEN,
  getReachability,
  setPolicy,
  setProfile,
} from "@/lib/relay"
import { cn } from "@/lib/utils"
import type { WalletMode } from "@/lib/wallet"

/** Offered as taps because typing a number on a phone is a chore. */
const PRESETS_NIM = [0, 1, 10, 100]

/**
 * Your profile: who you are here, and what it costs to reach you.
 *
 * Both are public — anyone can read your address and your price from the relay
 * — which is what makes this a profile rather than settings. Preferences only
 * you experience live in [`SettingsSheet`], which opens from the bottom of here.
 */
export function ProfileSheet({
  open,
  onOpenChange,
  address,
  mode,
  relayStatus,
  onCopy,
  onSignOut,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
  mode: WalletMode
  relayStatus: RelayStatus
  onCopy: (address: string) => void
  /** End the relay session. Nothing on the device goes with it. */
  onSignOut: () => void
}) {
  const { t } = useTranslation()
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)

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
  const valid =
    nim.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_AMOUNT_NIM
  const overMax = Number.isFinite(parsed) && parsed > MAX_AMOUNT_NIM

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
      toast.success(saved.name ? t("profile.showUpAs", { name: saved.name }) : t("profile.nameCleared"))
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
      toast.success(parsed === 0 ? t("profile.nowFree") : t("profile.nowCosts", { amount: parsed }))
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
          <SheetTitle>{t("profile.title")}</SheetTitle>
        </SheetHeader>

        <div className="space-y-7 pb-8">
          <section className="flex items-center gap-3.5">
            <AddressAvatar address={address} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-[12px]">{t("profile.yourAddress")}</p>
              <p className="select-value font-mono text-[13px] leading-relaxed font-semibold wrap-anywhere">
                {formatAddress(address)}
              </p>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t("profile.copyAddress")}
                  onClick={() => onCopy(formatAddress(address))}
                  className="size-9 rounded-lg"
                >
                  <Copy className="size-4" />
                </Button>
                {/* For the case a link cannot reach: two phones on a table. */}
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label={t("profile.inviteLink")}
                  onClick={() => setCodeOpen(true)}
                  className="size-9 rounded-lg"
                >
                  <QrCodeIcon className="size-4" />
                </Button>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold">{t("profile.yourName")}</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              {t("profile.yourNameNote")}
            </p>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={loading ? "" : name}
                  disabled={loading || savingName}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("profile.unnamed")}
                  aria-label={t("profile.nameLabel")}
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
            <h3 className="text-sm font-semibold">{t("profile.costTitle")}</h3>
            <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
              {t("profile.costNote")}
            </p>

            <div className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <input
                  value={loading ? "" : nim}
                  inputMode="decimal"
                  disabled={loading || saving}
                  onChange={(event) => setNim(event.target.value.replace(/[^\d.]/g, ""))}
                  aria-label={t("profile.costLabel")}
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

            {overMax && (
              <p className="text-destructive mt-2 px-1 text-[12px] leading-snug">
                {t("profile.costMax", { max: MAX_AMOUNT_NIM.toLocaleString() })}
              </p>
            )}

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
                  {preset === 0 ? t("profile.free") : `${preset} NIM`}
                </button>
              ))}
            </div>

            {valid && parsed === 0 && !loading && (
              // Worded as what free means rather than what is in force, because
              // this shows both before Save and after it.
              <p className="text-warning mt-2.5 text-[12px] leading-snug">
                {t("profile.freeNote")}
              </p>
            )}
          </section>

          {/* Last of the things you can do here, and the only one that is
              about the session rather than about you. Quiet on purpose: it is
              not a way out of anything, and nothing in this app is behind it. */}
          <section>
            <Button
              variant="outline"
              onClick={() => setLeaving(true)}
              className="text-muted-foreground h-11 w-full rounded-2xl"
            >
              <LogOut className="size-4" />
              {t("profile.signOut")}
            </Button>
          </section>

          <section className="text-muted-foreground flex items-center gap-4 border-t pt-3 text-[13px]">
            {/* Three states, not two: before the first poll lands the status is
                simply unknown, and calling that "unreachable" is a lie the user
                has no way to check. */}
            <span className="flex items-center gap-1.5">
              {relayStatus === "offline" ? (
                <WifiOff className="text-destructive size-4" />
              ) : relayStatus === "online" ? (
                <Wifi className="text-success size-4" />
              ) : (
                <Loader2 className="size-4 animate-spin" />
              )}
              {relayStatus === "offline"
                ? t("profile.relayOffline")
                : relayStatus === "online"
                  ? t("profile.relayOnline")
                  : t("profile.relayChecking")}
            </span>
            <span className="bg-border h-3.5 w-px" />
            {/* The app's own name, not the host's — inside Nimiq Pay the host
                is the one thing nobody needs telling. Set in words rather than
                with the mark, which belongs at the size it can be read at, in
                About. A dev identity hangs off the name rather than replacing
                it, kept short because spelling it out wraps the line on a small
                phone, and coloured because that is what makes two words read as
                a warning. */}
            <span className="font-semibold">
              Knock
              {mode === "dev" && <span className="text-warning">{t("profile.devIdentity")}</span>}
            </span>

            {/* At the far end of the line the app already ends on. Settings are
                not part of the profile — the profile is what the relay
                publishes about you — so they get a way in rather than a place
                of their own. The negative margin keeps the tap target a target
                without making the line taller. */}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("profile.settings")}
              onClick={() => setSettingsOpen(true)}
              className="-my-2 ml-auto shrink-0 rounded-full"
            >
              <Settings className="size-5" />
            </Button>
          </section>
        </div>
      </SheetContent>

      {/* Worth asking, not because anything is lost — nothing is — but because
          getting back in costs a signature, and a wallet prompt nobody asked
          for is the thing this app tries hardest never to cause. */}
      <Dialog open={leaving} onOpenChange={(next) => !next && setLeaving(false)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle>{t("profile.signOutTitle")}</DialogTitle>
            <DialogDescription className="text-balance">
              {t("profile.signOutBody")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => setLeaving(false)}>
              {t("profile.cancel")}
            </Button>
            <Button
              className="h-11 rounded-2xl"
              onClick={() => {
                setLeaving(false)
                onSignOut()
              }}
            >
              {t("profile.signOut")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MyCodeSheet open={codeOpen} onOpenChange={setCodeOpen} address={address} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Sheet>
  )
}
