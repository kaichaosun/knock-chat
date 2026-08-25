import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Loader2, ShieldOff, Trash2, UserMinus, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PickContactSheet } from "@/components/pick-contact-sheet"
import { QrCode } from "@/components/qr-code"
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
import { copyText } from "@/lib/clipboard"
import { groupLink } from "@/lib/group-link"
import { labelIn, nameIn, remember } from "@/lib/names"
import { parseNim } from "@/lib/payments"
import { formatNim } from "@/lib/postage"
import {
  answerJoinRequest,
  disbandGroup,
  listJoinRequests,
  removeGroupMember,
  updateGroup,
  LUNA_PER_NIM,
  type Group,
  type GroupDetail,
  type JoinRequest,
} from "@/lib/relay"
import { cn } from "@/lib/utils"

/** Offered as taps, the same shape the profile sheet uses for postage. */
const JOIN_PRESETS_NIM = [0, 1, 10, 100]

/**
 * What a room is, who is in it, and — for its owner — the controls.
 *
 * The owner's half is deliberately in the same sheet as everyone's half rather
 * than behind a separate settings screen. A room has one person who can change
 * it, and hiding that makes it look like nobody can.
 */
export function GroupSheet({
  open,
  onOpenChange,
  group,
  detail,
  owner,
  onChanged,
  onOpenChat,
  onInvite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  detail: GroupDetail | null
  owner: string
  onChanged: () => void
  onOpenChat: (address: string) => void
  /** Send this room's invite into your chat with them. */
  onInvite: (address: string) => void
}) {
  const names = useNames()
  const mine = group.owner === owner
  /** Open once the owner asks to disband, holding what they have typed. */
  const [disbanding, setDisbanding] = useState(false)
  const [typed, setTyped] = useState("")
  const [ending, setEnding] = useState(false)
  // Typed exactly, because the confirm is the only thing standing between a
  // tap and everybody else's room. Trimmed at the ends only — a name can have
  // spaces inside it, and matching those is the point.
  const named = typed.trim() === group.name.trim()

  async function disband() {
    setEnding(true)
    try {
      await disbandGroup(group.id)
      setDisbanding(false)
      onOpenChange(false)
      onChanged()
      toast.success(`${group.name} is gone. Everyone keeps what was said.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't disband it")
    } finally {
      setEnding(false)
    }
  }
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  // Seeded from the room each time the sheet opens, so it never shows a stale
  // value after the owner changed it on another device.
  const [name, setName] = useState("")
  const [price, setPrice] = useState("")
  const [saving, setSaving] = useState<"name" | "price" | null>(null)
  // Held until confirmed. It is a small icon in a list of faces, and getting
  // somebody back in can cost them money — or be up to the owner entirely.
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(group.name)
    setPrice(group.join_price_luna === 0 ? "" : formatNim(group.join_price_luna))
  }, [open, group.name, group.join_price_luna])

  const loadRequests = useCallback(async () => {
    if (!mine || !group.requires_approval) {
      setRequests([])
      return
    }
    try {
      const answer = await listJoinRequests(group.id)
      remember(answer.names)
      setRequests(answer.requests)
    } catch {
      // Not worth surfacing; the sheet still shows everything else.
    }
  }, [mine, group.id, group.requires_approval])

  useEffect(() => {
    if (open) void loadRequests()
  }, [open, loadRequests])

  const answer = async (request: JoinRequest, admit: boolean) => {
    setBusy(request.id)
    try {
      await answerJoinRequest(group.id, request.id, admit)
      setRequests((current) => current.filter((r) => r.id !== request.id))
      onChanged()
      toast.success(admit ? "They're in" : "Left outside")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't answer that")
    } finally {
      setBusy(null)
    }
  }

  const remove = async (address: string) => {
    setBusy(address)
    try {
      await removeGroupMember(group.id, address)
      setRemoving(null)
      onChanged()
      toast.success(
        group.requires_approval
          ? "Removed. They'd have to ask to come back."
          : "Removed — though they can walk back in while the door is open.",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove them")
    } finally {
      setBusy(null)
    }
  }

  const setApproval = async (requires_approval: boolean) => {
    try {
      await updateGroup(group.id, { requires_approval })
      onChanged()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    }
  }

  const saveName = async () => {
    setSaving("name")
    try {
      await updateGroup(group.id, { name: name.trim() })
      onChanged()
      toast.success("Name saved")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    } finally {
      setSaving(null)
    }
  }

  /** Blank means free, which is a price rather than an empty field. */
  const luna = price.trim() === "" ? 0 : parseNim(price)

  const savePrice = async (value: number) => {
    setSaving("price")
    try {
      await updateGroup(group.id, { join_price_luna: value })
      setPrice(value === 0 ? "" : formatNim(value))
      onChanged()
      toast.success(
        value === 0 ? "Anyone with the link can get in" : `Joining now costs ${formatNim(value)} NIM`,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    } finally {
      setSaving(null)
    }
  }

  const members = detail?.members ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{group.name}</SheetTitle>
          <SheetDescription>
            {group.join_price_luna === 0
              ? "Anyone with the link can get in."
              : `Getting in costs ${formatNim(group.join_price_luna)} NIM, paid to the owner.`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          <section className="space-y-2">
            {/* For the case a link cannot reach: two phones on a table. */}
            <div className="flex justify-center pb-1">
              <QrCode value={groupLink(group.id)} className="size-44 rounded-2xl" />
            </div>
            <Button
              variant="secondary"
              className="h-11 w-full rounded-2xl"
              onClick={async () => {
                const ok = await copyText(groupLink(group.id))
                toast[ok ? "success" : "info"](
                  ok ? "Invite link copied" : "Couldn't reach the clipboard",
                )
              }}
            >
              <Copy className="size-4" />
              Copy invite link
            </Button>
            <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
              <ShieldOff className="mt-0.5 size-3 shrink-0" />
              Messages in a group aren't encrypted.
            </p>
          </section>

          {mine && (
            <section>
              <h3 className="text-sm font-semibold">Name</h3>
              <div className="mt-2 flex gap-2">
                <input
                  value={name}
                  disabled={saving !== null}
                  onChange={(event) => setName(event.target.value)}
                  aria-label="Group name"
                  className={cn(
                    "bg-muted min-w-0 flex-1 rounded-2xl px-4 py-3 font-medium outline-none",
                    "focus-visible:ring-ring/60 focus-visible:ring-2",
                  )}
                />
                <Button
                  disabled={saving !== null || name.trim() === "" || name.trim() === group.name}
                  onClick={() => void saveName()}
                  className="h-12 rounded-2xl px-5"
                >
                  {saving === "name" ? <Loader2 className="animate-spin" /> : <Check />}
                  Save
                </Button>
              </div>
            </section>
          )}

          {mine && (
            <section>
              <h3 className="text-sm font-semibold">Cost to join</h3>
              <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                What someone new pays you to get in. Changing it leaves everyone already
                here where they are.
              </p>

              <div className="mt-2 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={price}
                    inputMode="decimal"
                    disabled={saving !== null}
                    placeholder="Free"
                    aria-label="Cost to join, in NIM"
                    aria-invalid={luna === null}
                    onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, ""))}
                    className={cn(
                      "bg-muted w-full rounded-2xl py-3 pr-14 pl-4 font-semibold tabular-nums outline-none",
                      "placeholder:text-muted-foreground/70 placeholder:font-normal",
                      "focus-visible:ring-ring/60 focus-visible:ring-2",
                      luna === null && "ring-destructive ring-2",
                    )}
                  />
                  <span className="text-muted-foreground pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-medium">
                    NIM
                  </span>
                </div>
                <Button
                  disabled={saving !== null || luna === null || luna === group.join_price_luna}
                  onClick={() => luna !== null && void savePrice(luna)}
                  className="h-12 rounded-2xl px-5"
                >
                  {saving === "price" ? <Loader2 className="animate-spin" /> : <Check />}
                  Save
                </Button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                {JOIN_PRESETS_NIM.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={saving !== null}
                    onClick={() => void savePrice(preset * LUNA_PER_NIM)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                      "active:bg-muted disabled:opacity-50",
                      group.join_price_luna === preset * LUNA_PER_NIM && "border-primary text-primary",
                    )}
                  >
                    {preset === 0 ? "Free" : `${preset} NIM`}
                  </button>
                ))}
              </div>
            </section>
          )}

          {mine && (
            <section>
              <h3 className="text-sm font-semibold">Who can get in</h3>
              <div className="mt-2 flex gap-2">
                {[false, true].map((approval) => (
                  <button
                    key={String(approval)}
                    type="button"
                    onClick={() => void setApproval(approval)}
                    className={cn(
                      "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                      group.requires_approval === approval && "border-primary text-primary",
                    )}
                  >
                    <span className="block font-semibold">
                      {approval ? "You approve" : "Anyone with the link"}
                    </span>
                    <span className="text-muted-foreground block text-[11px] leading-snug">
                      {approval ? "They ask, you answer" : "They walk straight in"}
                    </span>
                  </button>
                ))}
              </div>
              {!group.requires_approval && (
                <p className="text-warning mt-2 text-[12px] leading-snug">
                  With an open door, removing someone doesn't hold — they can walk back in.
                </p>
              )}
            </section>
          )}

          {mine && requests.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">
                {requests.length === 1 ? "Someone wants in" : `${requests.length} want in`}
              </h3>
              <ul className="mt-2 space-y-2">
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="bg-card flex items-center gap-3 rounded-2xl border p-2.5"
                  >
                    <AddressAvatar address={request.address} size="sm" />
                    <div className="min-w-0 flex-1">
                      {nameIn(names, request.address) && (
                        <p className="truncate text-[13px] leading-tight font-semibold">
                          {nameIn(names, request.address)}
                        </p>
                      )}
                      <p className="text-muted-foreground truncate font-mono text-[11px]">
                        {shortenAddress(request.address)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Decline"
                        disabled={busy === request.id}
                        onClick={() => void answer(request, false)}
                        className="size-9 rounded-full"
                      >
                        <X className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        aria-label="Let them in"
                        disabled={busy === request.id}
                        onClick={() => void answer(request, true)}
                        className="size-9 rounded-full"
                      >
                        {busy === request.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold">
                {members.length > 1 ? `${members.length} in the room` : "In the room"}
              </h3>
              {/* Anyone in the room can bring somebody in — an invite is only a
                  message, and the door decides who actually gets through. */}
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="text-primary flex items-center gap-1 text-[13px] font-semibold"
              >
                <UserPlus className="size-3.5" />
                Add someone
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {members.map((address) => (
                <li key={address} className="flex items-center gap-3 rounded-2xl py-1.5">
                  <AddressAvatar address={address} size="sm" />
                  <button
                    type="button"
                    disabled={address === owner}
                    onClick={() => {
                      onOpenChat(address)
                      onOpenChange(false)
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[13px] font-semibold">
                      {address === owner ? "You" : labelIn(names, address)}
                    </p>
                    <p className="text-muted-foreground truncate font-mono text-[11px]">
                      {shortenAddress(address)}
                      {address === group.owner && " · owner"}
                    </p>
                  </button>
                  {mine && address !== group.owner && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${labelIn(names, address)}`}
                      disabled={busy === address}
                      onClick={() => setRemoving(address)}
                      className="text-muted-foreground size-9 shrink-0 rounded-full"
                    >
                      {busy === address ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <UserMinus className="size-4" />
                      )}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* Last, and only for the person who can. Not beside the settings it
              sits under — those change a room, and this ends one. */}
          {mine && (
            <section className="border-t pt-5">
              <Button
                variant="ghost"
                onClick={() => {
                  setTyped("")
                  setDisbanding(true)
                }}
                className="text-destructive h-11 w-full justify-start rounded-2xl px-3"
              >
                <Trash2 className="size-4" />
                Disband group
              </Button>
              <p className="text-muted-foreground mt-1 px-3 text-[13px] leading-snug">
                Ends the room for everyone. Nobody is charged, and nobody is refunded.
              </p>
            </section>
          )}
        </div>
      </SheetContent>

      <PickContactSheet
        open={adding}
        onOpenChange={setAdding}
        members={members}
        onPick={onInvite}
      />

      {/* Typed, not tapped. Every other confirm in the app protects one
          person's own data; this one ends a place other people are using, and
          the cost of getting it wrong is not yours to pay. Asking for the name
          makes it impossible to do by accident and impossible to do to the
          wrong room. */}
      <Dialog open={disbanding} onOpenChange={(open) => !open && setDisbanding(false)}>
        <DialogContent className="max-w-[21rem] rounded-3xl">
          <DialogHeader>
            <DialogTitle>Disband {group.name}?</DialogTitle>
            <DialogDescription className="text-balance">
              The room ends for everyone in it. Nobody can post or rejoin, and what
              people were charged to join is not refunded. Everyone keeps the messages
              already on their phone until they delete the chat.
            </DialogDescription>
          </DialogHeader>

          <label className="text-muted-foreground block text-[13px]">
            Type <span className="text-foreground font-semibold">{group.name}</span> to
            confirm
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label={`Type ${group.name} to confirm`}
              className={cn(
                "bg-muted mt-2 w-full rounded-2xl px-4 py-3 font-medium outline-none",
                "focus-visible:ring-ring/60 focus-visible:ring-2",
              )}
            />
          </label>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              className="h-11 rounded-2xl"
              onClick={() => setDisbanding(false)}
            >
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={!named || ending}
              className="h-11 rounded-2xl"
              onClick={() => void disband()}
            >
              {ending && <Loader2 className="animate-spin" />}
              Disband
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center">
            {removing && <AddressAvatar address={removing} />}
            <DialogTitle className="mt-2">Remove them?</DialogTitle>
            {removing && nameIn(names, removing) && (
              <p className="text-[15px] font-semibold">{nameIn(names, removing)}</p>
            )}
            <p className="font-mono text-[13px] font-semibold tracking-tight">
              {removing ? shortenAddress(removing) : ""}
            </p>
            <DialogDescription className="text-balance">
              {group.requires_approval
                ? "They keep what they've already read and lose the room. Coming back means asking you again."
                : group.join_price_luna > 0
                  ? `They keep what they've already read and lose the room. Coming back would cost them ${formatNim(group.join_price_luna)} NIM again.`
                  : "They keep what they've already read and lose the room — though with an open door they can walk straight back in."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => setRemoving(null)}>
              Keep
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              className="h-11 rounded-2xl"
              onClick={() => removing && void remove(removing)}
            >
              {busy === removing && <Loader2 className="animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  )
}
