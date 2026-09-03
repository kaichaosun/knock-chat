import { useEffect, useRef, useState } from "react"
import {
  Copy,
  ImagePlus,
  Loader2,
  Camera,
  LogOut,
  Pencil,
  QrCode as QrCodeIcon,
  Settings,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { AttachMenu } from "@/components/attach-menu"
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
import { useNames } from "@/hooks/use-names"
import type { RelayStatus } from "@/hooks/use-messages"
import { formatAddress } from "@/lib/address"
import { faceIn, rememberFace, rememberOne } from "@/lib/names"
import { PictureError, prepare } from "@/lib/picture"
import {
  LUNA_PER_NIM,
  MAX_AMOUNT_NIM,
  MAX_AVATAR_BYTES,
  MAX_NAME_LEN,
  clearAvatar,
  getReachability,
  setAvatar,
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
  const directory = useNames()
  /** What the top of this sheet is drawing — a chosen picture, or nothing. */
  const face = faceIn(directory, address)
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
  const [picturing, setPicturing] = useState(false)
  const [pictureMenu, setPictureMenu] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  /** How long a finger has to stay put before it counts as a press. */
  const HOLD_MS = 500
  /** How far it may wander first — a finger on glass is never quite still. */
  const HOLD_SLOP_PX = 10
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressed = useRef<{ x: number; y: number } | null>(null)

  // A held finger opens the same menu a tap does. Both, because they answer
  // different halves of the problem: a hold is what a phone teaches you to try
  // on a picture, and a click is the only one of the two a mouse has — the hold
  // below is touch-only, as it is everywhere else in this app, so without the
  // tap a desktop would have no way to set a picture at all.
  //
  // No guard against the click that follows a hold. Elsewhere one is needed
  // because the tap means something else; here they both open this menu, so
  // firing twice sets the same flag to the same value.
  const holdStart = (at: { clientX: number; clientY: number; button: number; pointerType: string }) => {
    if (at.pointerType !== "touch" || at.button !== 0) return
    pressed.current = { x: at.clientX, y: at.clientY }
    window.clearTimeout(holding.current ?? undefined)
    holding.current = setTimeout(() => setPictureMenu(true), HOLD_MS)
  }

  const holdMove = (at: { clientX: number; clientY: number }) => {
    const from = pressed.current
    if (!from) return
    if (Math.abs(at.clientX - from.x) > HOLD_SLOP_PX || Math.abs(at.clientY - from.y) > HOLD_SLOP_PX) {
      holdCancel()
    }
  }

  const holdCancel = () => {
    window.clearTimeout(holding.current ?? undefined)
    pressed.current = null
  }
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
        // An answer about one address can be believed about the absence too,
        // so this is what corrects a picture changed on another device.
        rememberFace(address, r.avatar ?? null)
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

  /**
   * Take the file the picker handed over and wear it.
   *
   * Prepared on this device first — see `lib/picture` — so what crosses the
   * network is kilobytes rather than the several megabytes a phone camera
   * produces. The relay decodes and re-encodes it again regardless; this is
   * about the upload, not about trust.
   */
  const wear = async (file: File) => {
    setPicturing(true)
    try {
      const image = await prepare(file)
      if (image.size > MAX_AVATAR_BYTES) {
        toast.error(t("profile.avatarTooBig", { max: MAX_AVATAR_BYTES / 1024 / 1024 }))
        return
      }
      const worn = await setAvatar(image)
      rememberFace(address, worn.avatar)
      toast.success(t("profile.avatarSaved"))
    } catch (error) {
      if (error instanceof PictureError) toast.error(t("profile.avatarNotAnImage"))
      else toast.error(error instanceof Error ? error.message : t("profile.saveFailed"))
    } finally {
      setPicturing(false)
    }
  }

  const bare = async () => {
    setPicturing(true)
    try {
      await clearAvatar()
      rememberFace(address, null)
      toast.success(t("profile.avatarCleared"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("profile.saveFailed"))
    } finally {
      setPicturing(false)
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
            {/* The picture is its own control: one badge on the corner rather
                than a row of icons underneath, which is the same offer made
                with one thing to read instead of two. A badge is also the only
                part of this a first-time user can see — nobody's instinct is
                to tap their own face — so it stays put whether or not there is
                a picture, and the menu behind it is what changes. */}
            <button
              type="button"
              disabled={picturing}
              onClick={() => setPictureMenu(true)}
              onPointerDown={holdStart}
              onPointerMove={holdMove}
              onPointerUp={holdCancel}
              onPointerCancel={holdCancel}
              // Named for what it opens rather than what it is, since the face
              // itself is decorative everywhere else in the app.
              aria-label={t("profile.avatarMenu")}
              className={cn(
                "focus-visible:ring-ring/60 relative shrink-0 rounded-full transition-opacity outline-none",
                "focus-visible:ring-2 focus-visible:ring-offset-2",
                // The only thing marking it as a control. Deliberately quiet:
                // a face is not a button, and this is the least that still
                // answers a finger. Covers the badge as well — pressing a child
                // makes its ancestor `:active`, and the dimming applies to the
                // whole button — so the badge must not dim itself again or the
                // two multiply.
                "active:opacity-60 disabled:opacity-50",
              )}
            >
              <AddressAvatar address={address} size="lg" />

              {picturing ? (
                // The one moment this needs to say something, because the
                // picture on screen is still the old one until the upload
                // lands and nothing else would show that it is working. Over a
                // scrim, since a spinner drawn straight onto a photograph is
                // only visible on the photographs that happen to be pale.
                <span className="bg-background/70 pointer-events-none absolute inset-0 flex items-center justify-center rounded-full">
                  <Loader2 className="size-5 animate-spin" />
                </span>
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    // Deliberately *not* `pointer-events-none`. The badge hangs
                    // over the corner of a `rounded-full` button, and a round
                    // hit area does not reach its own corners — so with events
                    // switched off here a tap on the badge fell through the gap
                    // between the two and hit nothing at all. Left on, the badge
                    // catches the tap itself and it bubbles to the button, which
                    // works because the two are related by the DOM rather than
                    // by where they happen to overlap.
                    "absolute -top-0.5 -right-0.5",
                    "flex size-6 items-center justify-center rounded-full",
                    // The same fill as the copy and invite buttons across from
                    // it, so the three read as one family of things you can do
                    // here rather than as a decoration and two controls.
                    "bg-secondary text-secondary-foreground",
                    // A gap punched out of whatever is behind, so the badge
                    // sits above the face instead of on it. Drawn from the
                    // sheet's own ground, which is what it overlaps.
                    "ring-background ring-2",
                  )}
                >
                  <Camera className="size-3.5" strokeWidth={2} />
                </span>
              )}
            </button>

            {/* Hidden rather than styled: a file input cannot be made to look
                like anything else, and the button above is the control. */}
            <input
              ref={picker}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                // Cleared before the upload rather than after, so picking the
                // same file twice still fires a change the second time.
                event.target.value = ""
                if (file) void wear(file)
              }}
            />

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

      {/* What can be done to the face at the top of this sheet. Built from
          what is there rather than greyed out: with no picture there is one
          thing to do, and with one there are two — a "Remove" row that cannot
          remove anything is a control that does nothing, which this app
          refuses everywhere else. */}
      <AttachMenu
        open={pictureMenu}
        onOpenChange={setPictureMenu}
        title={t("profile.avatarMenu")}
        actions={
          face
            ? [
                {
                  icon: Pencil,
                  label: t("profile.avatarChange"),
                  description: t("profile.avatarChangeNote"),
                  onSelect: () => picker.current?.click(),
                },
                {
                  icon: Trash2,
                  label: t("profile.avatarRemove"),
                  description: t("profile.avatarRemoveNote"),
                  tone: "destructive",
                  onSelect: () => void bare(),
                },
              ]
            : [
                {
                  icon: ImagePlus,
                  label: t("profile.avatarAdd"),
                  description: t("profile.avatarAddNote"),
                  onSelect: () => picker.current?.click(),
                },
              ]
        }
      />

      <MyCodeSheet open={codeOpen} onOpenChange={setCodeOpen} address={address} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </Sheet>
  )
}
