import { Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { AddressAvatar } from "@/components/address-avatar"
import { QrCode } from "@/components/qr-code"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { copyText } from "@/lib/clipboard"
import { peerLink } from "@/lib/peer-link"

/**
 * Your code, given the room a code needs.
 *
 * A sheet of its own rather than a block in the profile: a code is held up to
 * somebody else's phone, so it wants to be big and to have nothing around it
 * competing to be read.
 */
export function MyCodeSheet({
  open,
  onOpenChange,
  address,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: string
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>{t("code.title")}</SheetTitle>
          <SheetDescription>
            {t("code.note")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-8">
          <div className="flex justify-center">
            <QrCode
              value={peerLink(address)}
              label={t("code.label")}
              center={<AddressAvatar address={address} />}
              className="size-60 rounded-2xl"
            />
          </div>

          <Button
            variant="secondary"
            className="h-11 w-full rounded-2xl"
            onClick={async () => {
              const ok = await copyText(peerLink(address))
              toast[ok ? "success" : "info"](
                ok ? t("groupSheet.inviteCopied") : t("groupSheet.clipboardFailed"),
              )
            }}
          >
            <Copy className="size-4" />
            {t("code.copy")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
