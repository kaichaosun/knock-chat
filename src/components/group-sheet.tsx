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
  MAX_AMOUNT_LUNA,
  MAX_AMOUNT_NIM,
  answerJoinRequest,
  disbandGroup,
  listJoinRequests,
  removeGroupMember,
  updateGroup,
  type Group,
  type GroupDetail,
  type JoinRequest,
} from "@/lib/relay"
import { cn } from "@/lib/utils"

/**
 * What a room is, who is in it, and — for its owner — the controls.
 *
 * The owner's half is deliberately in the same sheet as everyone's half rather
 * than behind a separate settings screen. A room has one person who can change
 * it, and hiding that makes it look like nobody can.
 */
/**
 * The two doors a room can have, in one place.
 *
 * The cards and the confirmation say the same words about the same thing —
 * written twice they would drift, and a dialog that describes the choice in
 * language the choice does not use is a dialog you have to read twice.
 *
 * Both are read against the price, because approval is the second latch and
 * not the only one. A room that charges is never walked into: what approval
 * decides is whether paying is the whole of getting in, or only what it takes
 * to be asked about.
 */
function doorFor(requiresApproval: boolean, priceLuna: number) {
  const price = priceLuna > 0 ? `${formatNim(priceLuna)} NIM` : null

  if (requiresApproval) {
    return {
      label: "You approve",
      hint: price ? "They pay, you answer" : "They ask, you answer",
      means: price
        ? `New people pay the ${price} and wait for your answer. Paying buys the asking, not the room — declining does not send it back. Everyone already in stays in.`
        : "New people ask to join, and wait for your answer. Everyone already in stays in.",
    }
  }

  return {
    label: "Anyone with the link",
    hint: price ? "They pay and are in" : "They walk straight in",
    means: price
      ? `Anyone with the link pays the ${price} and is in, without asking you. Anyone you remove can pay again and come back the same way.`
      : "Anyone with the link walks straight in, without asking you. Anyone you remove can walk back in the same way.",
  }
}

export function GroupSheet({
  open,
  onOpenChange,
  group,
  detail,
  gone,
  owner,
  onChanged,
  onDisbanded,
  onDeleteChat,
  onOpenChat,
  onInvite,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  detail: GroupDetail | null
  /** The relay no longer has this room: its owner ended it. */
  gone: boolean
  owner: string
  onChanged: () => void
  /** Leave the room behind — it is not there to stay in. */
  onDisbanded: () => void
  /** Offered only once the room is gone: the thread is all that is left of it. */
  onDeleteChat: () => void
  onOpenChat: (address: string) => void
  /** Send this room's invite into your chat with them. */
  onInvite: (address: string) => void
}) {
  const names = useNames()
  // Nothing below acts on anything but a live room, and a disbanded one is not
  // there to act on. Dropping the owner's half is most of that; the rest goes
  // with the body, below.
  const mine = group.owner === owner && !gone
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
      // Out of the room as well as out of the sheet. Staying would leave the
      // person who just ended it reading a bar that tells them so.
      onDisbanded()
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
  const [saving, setSaving] = useState<"name" | "price" | "door" | null>(null)
  /** The door being changed to, while it is being confirmed. Null when nothing is. */
  const [changing, setChanging] = useState<boolean | null>(null)
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
    setSaving("door")
    try {
      await updateGroup(group.id, { requires_approval })
      setChanging(null)
      onChanged()
      // Said out loud, because the two cards look alike and a change nobody
      // meant to make used to happen in silence.
      toast.success(
        requires_approval
          ? "New people will have to ask you first."
          : "Door open — anyone with the link walks in.",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save")
    } finally {
      setSaving(null)
    }
  }

  /**
   * Answer a tap on one of the two cards.
   *
   * Neither direction takes effect on the tap. The cards sit side by side in a
   * sheet people scroll past, the difference between them is a sentence of
   * small type, and until now either one changed who could get into the room
   * the moment a thumb brushed it.
   */
  const chooseApproval = (approval: boolean) => {
    // A tap on the card that is already chosen is not a change of anything. It
    // used to save the setting it already had.
    if (approval === group.requires_approval) return
    setChanging(approval)
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
  // Empty means free. Anything above the ceiling is treated as unreadable
  // rather than clamped: silently charging somebody a different price from the
  // one they typed is worse than refusing the number.
  const entered = price.trim() === "" ? 0 : parseNim(price)
  const overMax = entered !== null && entered > MAX_AMOUNT_LUNA
  const luna = overMax ? null : entered

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
            {gone
              ? "This group was disbanded. Nobody can post or rejoin, and the messages on your phone are yours to keep or delete."
              : group.join_price_luna === 0
                ? "Anyone with the link can get in."
                : `Getting in costs ${formatNim(group.join_price_luna)} NIM, paid to the owner.`}
          </SheetDescription>
        </SheetHeader>

        {/* Everything here acts on the room through the relay — the link, the
            QR, the price, who is in it, ending it. A disbanded room is not
            there to act on, so the sheet keeps only its name and what became
            of it, above. */}
        {gone && (
          <div className="pb-8">
            {/* The same row as the owner's disband, because it is the same kind
                of thing: the last act available on a room, in red. What it ends
                is smaller — a copy on one phone rather than a place for
                everyone — so it says so plainly rather than asking twice. */}
            <button
              type="button"
              onClick={() => {
                onOpenChange(false)
                onDeleteChat()
              }}
              className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
            >
              <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-2xl">
                <Trash2 className="size-5" strokeWidth={1.75} />
              </span>
              <span className="min-w-0">
                <span className="text-destructive block text-[15px] font-semibold">
                  Delete chat
                </span>
                <span className="text-muted-foreground block text-[13px] leading-snug">
                  Takes the messages off this phone.
                </span>
              </span>
            </button>
          </div>
        )}

        {!gone && (
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
                    {saving === "name" && <Loader2 className="animate-spin" />}
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
                    {saving === "price" && <Loader2 className="animate-spin" />}
                    Save
                  </Button>
                </div>

                {overMax && (
                  <p className="text-destructive mt-2 px-1 text-[12px] leading-snug">
                    {MAX_AMOUNT_NIM.toLocaleString()} NIM is the most that can be asked.
                  </p>
                )}
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
                      onClick={() => chooseApproval(approval)}
                      aria-pressed={group.requires_approval === approval}
                      className={cn(
                        "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                        group.requires_approval === approval && "border-primary text-primary",
                      )}
                    >
                      <span className="block font-semibold">
                        {doorFor(approval, group.join_price_luna).label}
                      </span>
                      <span className="text-muted-foreground block text-[11px] leading-snug">
                        {doorFor(approval, group.join_price_luna).hint}
                      </span>
                    </button>
                  ))}
                </div>
                {!group.requires_approval && (
                  <p className="text-warning mt-2 text-[12px] leading-snug">
                    {group.join_price_luna > 0
                      ? "With an open door, removing someone doesn't hold — they can pay again and come back."
                      : "With an open door, removing someone doesn't hold — they can walk back in."}
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
              <section className="border-t pt-4">
                {/* The shape every row in the compose menu has: a tinted glyph,
                    what it does, and a line saying what that means. Borrowed
                    rather than invented, because a button with a caption under
                    it is two things that have to be aligned by hand, and this
                    is one thing that cannot come apart. Red where that one is
                    blue — the only difference, which is the point. */}
                <button
                  type="button"
                  onClick={() => {
                    setTyped("")
                    setDisbanding(true)
                  }}
                  className="active:bg-muted flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-colors"
                >
                  <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-2xl">
                    <Trash2 className="size-5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="text-destructive block text-[15px] font-semibold">
                      Disband group
                    </span>
                    <span className="text-muted-foreground block text-[13px] leading-snug">
                      Ends the room for everyone.
                    </span>
                  </span>
                </button>
              </section>
            )}
          </div>
        )}
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
          wrong room.

          A sheet rather than a dialog, because it asks for typing: only the
          sheet is anchored above the keyboard (`--keyboard-inset`), and only
          the sheet refuses Radix's grab at the first field — a centred dialog
          would raise the keyboard on open and then sit behind it. */}
      <Sheet open={disbanding} onOpenChange={(open) => !open && setDisbanding(false)}>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
        >
          <SheetHeader className="px-0">
            <SheetTitle>Disband {group.name}?</SheetTitle>
            <SheetDescription>
              The room ends for everyone in it. Nobody can post or rejoin, and what
              people were charged to join is not refunded. Everyone keeps the messages
              already on their phone until they delete the chat.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 pb-8">
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
                  "bg-muted mt-2 w-full rounded-2xl px-4 py-3.5 font-medium outline-none",
                  "focus-visible:ring-ring/60 focus-visible:ring-2",
                )}
              />
            </label>

            <Button
              variant="destructive"
              disabled={!named || ending}
              onClick={() => void disband()}
              className="h-13 w-full rounded-2xl text-base"
            >
              {ending && <Loader2 className="animate-spin" />}
              Disband
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDisbanding(false)}
              className="text-muted-foreground h-11 w-full rounded-2xl"
            >
              Keep it
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* The door you are moving to, named and explained in its own words —
          the same ones the card uses, so the dialog is the choice restated
          rather than a second thing to understand. */}
      <Dialog open={changing !== null} onOpenChange={(open) => !open && setChanging(null)}>
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center">
            <DialogTitle>
              {changing !== null && doorFor(changing, group.join_price_luna).label}
            </DialogTitle>
            <DialogDescription className="text-balance">
              {changing !== null && doorFor(changing, group.join_price_luna).means}
              {changing === false && requests.length > 0 && (
                <>
                  {" "}
                  The {requests.length === 1 ? "one person" : `${requests.length} people`}{" "}
                  already waiting still need an answer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => setChanging(null)}>
              Cancel
            </Button>
            <Button
              disabled={saving === "door"}
              className="h-11 rounded-2xl"
              onClick={() => changing !== null && void setApproval(changing)}
            >
              {saving === "door" && <Loader2 className="animate-spin" />}
              Confirm
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
