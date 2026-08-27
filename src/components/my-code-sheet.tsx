import { Copy } from "lucide-react"
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Your invite link</SheetTitle>
          <SheetDescription>
            Send it or let someone scan it to find you.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 pb-8">
          <div className="flex justify-center">
            <QrCode
              value={peerLink(address)}
              label="Scan to knock on this door"
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
                ok ? "Invite link copied" : "Couldn't reach the clipboard",
              )
            }}
          >
            <Copy className="size-4" />
            Copy invite link
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
