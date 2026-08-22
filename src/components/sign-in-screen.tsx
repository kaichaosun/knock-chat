import { KeyRound, Loader2, ShieldCheck } from "lucide-react"

import { AddressAvatar } from "@/components/address-avatar"
import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { shortenAddress } from "@/lib/address"

/**
 * Shown once per device. The relay proves who you are by having your wallet
 * sign a challenge, so this step necessarily raises a wallet confirmation —
 * which is why it is a deliberate tap rather than something that happens on
 * load.
 */
export function SignInScreen({
  address,
  signing,
  error,
  onSignIn,
}: {
  address: string
  signing: boolean
  error?: string
  onSignIn: () => void
}) {
  return (
    <div className="flex h-full flex-col justify-between px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <BrandMark className="size-16" />

        <h1 className="mt-6 text-2xl font-extrabold tracking-tight">Prove it's you</h1>
        <p className="text-muted-foreground mt-2 max-w-xs text-balance">
          Your wallet signs a one-time challenge. Nothing is spent, and nothing leaves
          your device but the signature.
        </p>

        <div className="bg-card mt-8 flex w-full max-w-sm items-center gap-3 rounded-2xl border p-3.5 shadow-sm">
          <AddressAvatar address={address} />
          <div className="min-w-0 text-left">
            <p className="text-muted-foreground text-[11px]">Signing in as</p>
            <p className="truncate font-mono text-[13px] font-semibold">
              {shortenAddress(address)}
            </p>
          </div>
        </div>

        <p className="text-muted-foreground mt-6 flex items-center gap-1.5 text-[12px]">
          <ShieldCheck className="size-3.5" />
          Stays signed in for 30 days
        </p>
      </div>

      <div className="w-full space-y-3 pt-8 pb-4">
        {error && (
          <p className="text-destructive px-2 text-center text-[13px] text-balance">{error}</p>
        )}
        <Button
          size="lg"
          disabled={signing}
          onClick={onSignIn}
          className="h-13 w-full rounded-2xl text-base"
        >
          {signing ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {signing ? "Waiting for your wallet" : "Sign in"}
        </Button>
      </div>
    </div>
  )
}
