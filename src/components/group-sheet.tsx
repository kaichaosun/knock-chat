import { useCallback, useEffect, useState } from "react"
import { Check, Copy, Loader2, ShieldOff, UserMinus, X } from "lucide-react"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
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
import { labelIn, nameIn, remember } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import {
  answerJoinRequest,
  listJoinRequests,
  removeGroupMember,
  updateGroup,
  type Group,
  type GroupDetail,
  type JoinRequest,
} from "@/lib/relay"
import { cn } from "@/lib/utils"

/** A link that opens this room in the app. */
export function groupLink(id: string): string {
  const url = new URL(window.location.href)
  url.search = `?group=${id}`
  url.hash = ""
  return url.toString()
}

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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: Group
  detail: GroupDetail | null
  owner: string
  onChanged: () => void
  onOpenChat: (address: string) => void
}) {
  const names = useNames()
  const mine = group.owner === owner
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)

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
              Messages in a group aren't encrypted. Being here together doesn't open a
              private chat either — writing to someone directly still costs their postage.
            </p>
          </section>

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
            <h3 className="text-sm font-semibold">
              {members.length > 1 ? `${members.length} in the room` : "In the room"}
            </h3>
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
                      onClick={() => void remove(address)}
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
        </div>
      </SheetContent>
    </Sheet>
  )
}
