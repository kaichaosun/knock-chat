import { useCallback, useEffect, useState } from "react"
import {
  Check,
  ChevronRight,
  Copy,
  Loader2,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  X,
} from "lucide-react"
import { t as translate } from "i18next"
import { Trans, useTranslation } from "react-i18next"
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
import { MemberSheet } from "@/components/member-sheet"
import { MembersSheet } from "@/components/members-sheet"
import { PickContactSheet } from "@/components/pick-contact-sheet"
import { RemoveMemberDialog } from "@/components/remove-member-dialog"
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
/**
 * The two things a room can do with its past, in the room's own words.
 *
 * Same shape and same reason as [`doorFor`] below: the card and the dialog that
 * confirms it both read from here, so the dialog is the choice restated rather
 * than a second thing to read and reconcile.
 */
function pastFor(shares: boolean) {
  if (shares) {
    return {
      label: translate("roomSettings.historyVisible"),
      hint: translate("roomSettings.historyVisibleHint"),
      means: translate("groupSheet.pastSharedMeans"),
    }
  }
  return {
    label: translate("roomSettings.historyHidden"),
    hint: translate("roomSettings.historyHiddenHint"),
    means: translate("groupSheet.pastPrivateMeans"),
  }
}

function doorFor(requiresApproval: boolean, priceLuna: number) {
  const price = priceLuna > 0 ? `${formatNim(priceLuna)} NIM` : null

  if (requiresApproval) {
    return {
      label: translate("roomSettings.doorApprove"),
      hint: translate(price ? "roomSettings.doorApproveHintPaid" : "roomSettings.doorApproveHint"),
      means: price
        ? translate("groupSheet.doorApproveMeansPaid", { price })
        : translate("groupSheet.doorApproveMeans"),
    }
  }

  return {
    label: translate("roomSettings.doorOpen"),
    hint: translate(price ? "roomSettings.doorOpenHintPaid" : "roomSettings.doorOpenHint"),
    means: price
      ? translate("groupSheet.doorOpenMeansPaid", { price })
      : translate("groupSheet.doorOpenMeans"),
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
  const { t } = useTranslation()
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
      toast.error(error instanceof Error ? error.message : t("groupSheet.disbandFailed"))
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
  const [saving, setSaving] = useState<"name" | "price" | "door" | "past" | null>(null)
  /** The door being changed to, while it is being confirmed. Null when nothing is. */
  const [changing, setChanging] = useState<boolean | null>(null)
  /** The history setting being moved to, while it is still only being offered. */
  const [changingPast, setChangingPast] = useState<boolean | null>(null)

  /**
   * Whether this room shares its past, read as a boolean rather than compared
   * to one.
   *
   * A relay too old to know the field leaves it undefined, and `undefined`
   * equals neither `true` nor `false` — so both cards went dark and the room
   * looked as though it had no setting at all. Absent means off, which is
   * exactly what such a relay does.
   */
  const sharesHistory = Boolean(group.share_history)
  // Held until confirmed. It is a small icon in a list of faces, and getting
  // somebody back in can cost them money — or be up to the owner entirely.
  const [removing, setRemoving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  /** Open once somebody wants past the handful the details carry. */
  const [listing, setListing] = useState(false)
  /** Whose details are open. Tapping a member says who they are, not hello. */
  const [showing, setShowing] = useState<string | null>(null)

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
      toast.success(t(admit ? "queue.admitted" : "queue.declined"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("queue.answerFailed"))
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
          ? t("groupSheet.removedApproval")
          : t("groupSheet.removedOpen"),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("room.removeFailed"))
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
          ? t("groupSheet.doorApprovalOn")
          : t("groupSheet.doorApprovalOff"),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("groupSheet.saveFailed"))
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

  const setPast = async (share_history: boolean) => {
    setSaving("past")
    try {
      await updateGroup(group.id, { share_history })
      setChangingPast(null)
      onChanged()
      toast.success(
        share_history ? t("groupSheet.pastSharedOn") : t("groupSheet.pastSharedOff"),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("groupSheet.saveFailed"))
    } finally {
      setSaving(null)
    }
  }

  /**
   * Answer a tap on one of the two history cards.
   *
   * Confirmed rather than immediate, for the reason the door is: these two
   * cards look alike, and one of them opens everything the room has ever said
   * to everybody in it. That is not a thing to do to a room with a stray thumb.
   */
  const choosePast = (share: boolean) => {
    if (share === sharesHistory) return
    setChangingPast(share)
  }

  const saveName = async () => {
    setSaving("name")
    try {
      await updateGroup(group.id, { name: name.trim() })
      onChanged()
      toast.success(t("groupSheet.nameSaved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("groupSheet.saveFailed"))
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
        value === 0
          ? t("groupSheet.costFree")
          : t("groupSheet.costSet", { amount: formatNim(value) }),
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("groupSheet.saveFailed"))
    } finally {
      setSaving(null)
    }
  }

  // The first few, which is all the relay sends now. The whole room is its own
  // screen — see [`MembersSheet`].
  const members = detail?.members ?? []
  const memberCount = detail?.member_count ?? members.length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{group.name}</SheetTitle>
          <SheetDescription>
            {gone
              ? t("groupSheet.disbandedNote")
              : group.join_price_luna === 0
                ? t("groupSheet.freeNote")
                : t("groupSheet.priceNote", { amount: formatNim(group.join_price_luna) })}
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
                  {t("groupSheet.deleteChat")}
                </span>
                <span className="text-muted-foreground block text-[13px] leading-snug">
                  {t("groupSheet.deleteChatNote")}
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
                <QrCode
                  value={groupLink(group.id)}
                  label={t("groupSheet.scanToJoin")}
                  className="size-44 rounded-2xl"
                />
              </div>
              <Button
                variant="secondary"
                className="h-11 w-full rounded-2xl"
                onClick={async () => {
                  const ok = await copyText(groupLink(group.id))
                  toast[ok ? "success" : "info"](
                    ok ? t("groupSheet.inviteCopied") : t("groupSheet.clipboardFailed"),
                  )
                }}
              >
                <Copy className="size-4" />
                {t("groupSheet.copyInvite")}
              </Button>
              <p className="text-muted-foreground flex items-start gap-1.5 px-1 text-[12px] leading-snug">
                <ShieldOff className="mt-0.5 size-3 shrink-0" />
                {t("groupSheet.notEncrypted")}
              </p>
            </section>

            {mine && (
              <section>
                <h3 className="text-sm font-semibold">{t("groupSheet.name")}</h3>
                <div className="mt-2 flex gap-2">
                  <input
                    value={name}
                    disabled={saving !== null}
                    onChange={(event) => setName(event.target.value)}
                    aria-label={t("roomSettings.nameLabel")}
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
                <h3 className="text-sm font-semibold">{t("roomSettings.costTitle")}</h3>
                <p className="text-muted-foreground mt-1 text-[13px] leading-snug">
                  {t("groupSheet.costNote")}
                </p>

                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <input
                      value={price}
                      inputMode="decimal"
                      disabled={saving !== null}
                      placeholder={t("newGroup.costPlaceholder")}
                      aria-label={t("newGroup.costLabel")}
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
                <h3 className="text-sm font-semibold">{t("roomSettings.doorTitle")}</h3>
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
                      ? t("groupSheet.openDoorPaid")
                      : t("groupSheet.openDoorFree")}
                  </p>
                )}
              </section>
            )}

            {mine && (
              <section>
                <h3 className="text-sm font-semibold">{t("roomSettings.historyTitle")}</h3>
                <div className="mt-2 flex gap-2">
                  {[false, true].map((share) => (
                    <button
                      key={String(share)}
                      type="button"
                      onClick={() => choosePast(share)}
                      aria-pressed={sharesHistory === share}
                      className={cn(
                        "flex-1 rounded-2xl border px-3 py-2.5 text-left text-[13px] transition-colors",
                        sharesHistory === share && "border-primary text-primary",
                      )}
                    >
                      <span className="block font-semibold">{pastFor(share).label}</span>
                      <span className="text-muted-foreground block text-[11px] leading-snug">
                        {pastFor(share).hint}
                      </span>
                    </button>
                  ))}
                </div>
                {sharesHistory && (
                  <p className="text-warning mt-2 text-[12px] leading-snug">
                    {t("groupSheet.pastSharedWarning")}
                  </p>
                )}
              </section>
            )}

            {mine && requests.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold">
                  {requests.length === 1
                    ? t("queue.oneWaiting")
                    : t("queue.countWaiting", { count: requests.length })}
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
                          aria-label={t("queue.decline")}
                          disabled={busy === request.id}
                          onClick={() => void answer(request, false)}
                          className="size-9 rounded-full"
                        >
                          <X className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          aria-label={t("queue.admit")}
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
                  {memberCount > 1
                    ? t("members.countInTheRoom", { count: memberCount })
                    : t("members.inTheRoom")}
                </h3>
                {/* Anyone in the room can bring somebody in — an invite is only a
                    message, and the door decides who actually gets through. */}
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="text-primary flex items-center gap-1 text-[13px] font-semibold"
                >
                  <UserPlus className="size-3.5" />
                  {t("groupSheet.addSomeone")}
                </button>
              </div>
              <ul className="mt-2 space-y-1">
                {members.map((address) => (
                  <li key={address} className="flex items-center gap-3 rounded-2xl py-1.5">
                    {/* Face and name are one target — they are one person. */}
                    <button
                      type="button"
                      onClick={() => setShowing(address)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <AddressAvatar address={address} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold">
                          {address === owner ? t("members.you") : labelIn(names, address)}
                        </p>
                        <p className="text-muted-foreground truncate font-mono text-[11px]">
                          {shortenAddress(address)}
                          {address === group.owner && t("members.ownerSuffix")}
                        </p>
                      </div>
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

              {/* Only when there is more than what is shown. The details carry
                  the first few; the room itself is a screen of its own, with a
                  search, because at this room's limit a list is not something
                  anybody scrolls. */}
              {memberCount > members.length && (
                <button
                  type="button"
                  onClick={() => setListing(true)}
                  className="text-primary active:bg-muted mt-1 flex w-full items-center justify-center gap-1 rounded-2xl py-2.5 text-[13px] font-semibold transition-colors"
                >
                  {t("groupSheet.showAll")}
                  <ChevronRight className="size-3.5" />
                </button>
              )}
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
                      {t("groupSheet.disband")}
                    </span>
                    <span className="text-muted-foreground block text-[13px] leading-snug">
                      {t("groupSheet.disbandNote")}
                    </span>
                  </span>
                </button>
              </section>
            )}
          </div>
        )}
      </SheetContent>

      <MemberSheet
        address={showing}
        onOpenChange={(next) => !next && setShowing(null)}
        you={owner}
        roomOwner={group.owner}
        mine={mine}
        onCopy={(address) => {
          void copyText(address).then((ok) =>
            ok ? toast.success(t("room.addressCopied")) : toast.error(t("room.copyFailed")),
          )
        }}
        onOpenChat={(address) => {
          setShowing(null)
          onOpenChange(false)
          onOpenChat(address)
        }}
        onRemove={(address) => {
          setShowing(null)
          setRemoving(address)
        }}
      />

      <MembersSheet
        open={listing}
        onOpenChange={setListing}
        group={group}
        total={memberCount}
        owner={owner}
        mine={mine}
        onCopy={(address) => {
          void copyText(address).then((ok) =>
            ok ? toast.success(t("room.addressCopied")) : toast.error(t("room.copyFailed")),
          )
        }}
        onOpenChat={(address) => {
          onOpenChange(false)
          onOpenChat(address)
        }}
        onRemoved={onChanged}
      />

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
            <SheetTitle>{t("groupSheet.disbandTitle", { name: group.name })}</SheetTitle>
            <SheetDescription>
              {t("groupSheet.disbandBody")}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 pb-8">
            <label className="text-muted-foreground block text-[13px]">
              <Trans
                i18nKey="groupSheet.typeToConfirm"
                values={{ name: group.name }}
                components={{ name: <span className="text-foreground font-semibold" /> }}
              />
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-label={t("groupSheet.typeToConfirmLabel", { name: group.name })}
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
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle>
              {changing !== null && doorFor(changing, group.join_price_luna).label}
            </DialogTitle>
            <DialogDescription className="text-balance">
              {changing !== null && doorFor(changing, group.join_price_luna).means}
              {changing === false && requests.length > 0 && (
                <>
                  {" "}
                  {t("groupSheet.theWord")}
                  {requests.length === 1
                    ? t("groupSheet.onePersonWaiting")
                    : t("groupSheet.peopleWaiting", { count: requests.length })}{" "}
                  {t("groupSheet.stillNeedAnswer")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => setChanging(null)}>
              {t("groupSheet.cancel")}
            </Button>
            <Button
              disabled={saving === "door"}
              className="h-11 rounded-2xl"
              onClick={() => changing !== null && void setApproval(changing)}
            >
              {saving === "door" && <Loader2 className="animate-spin" />}
              {t("groupSheet.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmed the way the door is, and in the same words as the card. The
          off direction gets a sentence of its own: shutting the past stops it
          being handed out from here on, and cannot reach what somebody has
          already read onto their own device. Better said than implied. */}
      <Dialog
        open={changingPast !== null}
        onOpenChange={(open) => !open && setChangingPast(null)}
      >
        <DialogContent className="max-w-[20rem] rounded-3xl">
          <DialogHeader className="items-center text-center sm:text-center">
            <DialogTitle>{changingPast !== null && pastFor(changingPast).label}</DialogTitle>
            <DialogDescription className="text-balance">
              {changingPast !== null && pastFor(changingPast).means}
              {changingPast === false && <> {t("groupSheet.pastNoRecall")}</>}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              className="h-11 rounded-2xl"
              onClick={() => setChangingPast(null)}
            >
              {t("groupSheet.cancel")}
            </Button>
            <Button
              disabled={saving === "past"}
              className="h-11 rounded-2xl"
              onClick={() => changingPast !== null && void setPast(changingPast)}
            >
              {saving === "past" && <Loader2 className="animate-spin" />}
              {t("groupSheet.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RemoveMemberDialog
        address={removing}
        group={group}
        busy={busy !== null && busy === removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        onConfirm={(address) => void remove(address)}
      />
    </Sheet>
  )
}
