import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useNames } from "@/hooks/use-names"
import { shortenAddress } from "@/lib/address"
import { nameIn } from "@/lib/names"
import { formatNim } from "@/lib/postage"
import type { Group } from "@/lib/relay"

/**
 * Showing somebody out of a room.
 *
 * Held until confirmed: it is a small icon in a list of faces, and getting
 * back in can cost money — or be up to the owner entirely, which is what the
 * wording turns on.
 *
 * Shared by the two places a member can be removed from, the room's details
 * and its full list, so what somebody is told about the consequence cannot
 * differ depending on which screen they were looking at.
 */
export function RemoveMemberDialog({
  address,
  group,
  busy,
  onOpenChange,
  onConfirm,
}: {
  /** Who is being removed, or null when nothing is. */
  address: string | null
  group: Group
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (address: string) => void
}) {
  const { t } = useTranslation()
  const names = useNames()

  return (
    <Dialog open={address !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[20rem] rounded-3xl">
        <DialogHeader className="items-center">
          {address && <AddressAvatar address={address} />}
          <DialogTitle className="mt-2">{t("member.confirmTitle")}</DialogTitle>
          {address && nameIn(names, address) && (
            <p className="text-[15px] font-semibold">{nameIn(names, address)}</p>
          )}
          <p className="font-mono text-[13px] font-semibold tracking-tight">
            {address ? shortenAddress(address) : ""}
          </p>
          <DialogDescription className="text-balance">
            {group.requires_approval
              ? t("member.confirmApproval")
              : group.join_price_luna > 0
                ? `They keep what they've already read and lose the room. Coming back would cost them ${formatNim(group.join_price_luna)} NIM again.`
                : t("member.confirmOpen")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" className="h-11 rounded-2xl" onClick={() => onOpenChange(false)}>
            Keep
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            className="h-11 rounded-2xl"
            onClick={() => address && onConfirm(address)}
          >
            {busy && <Loader2 className="animate-spin" />}
            {t("member.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
