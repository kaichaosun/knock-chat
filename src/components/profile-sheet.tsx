import { Copy, Wifi, WifiOff } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { formatAddress } from "@/lib/address"
import type { RelayStatus } from "@/hooks/use-messages"
import type { WalletMode } from "@/lib/wallet"

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
  const online = relayStatus === "online"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe">
        <SheetHeader className="px-0">
          <SheetTitle>Your address</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col items-center pb-8 text-center">
          <AddressAvatar address={address} size="lg" />

          <p className="mt-5 font-mono text-sm leading-relaxed font-semibold text-balance">
            {formatAddress(address)}
          </p>

          <Button
            variant="secondary"
            onClick={() => onCopy(formatAddress(address))}
            className="mt-4 h-11 rounded-2xl px-5"
          >
            <Copy />
            Copy address
          </Button>

          <div className="text-muted-foreground mt-7 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              {online ? (
                <Wifi className="text-success size-3.5" />
              ) : (
                <WifiOff className="text-destructive size-3.5" />
              )}
              {online ? "Relay connected" : "Relay unreachable"}
            </span>
            <span className="bg-border h-3 w-px" />
            <span>{mode === "nimiq-pay" ? "Nimiq Pay" : "Development identity"}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
