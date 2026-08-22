import { ArrowUpRight, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { Button } from "@/components/ui/button"
import { nimiqPayDeeplink } from "@/lib/wallet"

const POINTS = [
  {
    icon: Zap,
    title: "No sign-up",
    body: "Your Nimiq address is your account. Nothing to create, nothing to remember.",
  },
  {
    icon: ShieldCheck,
    title: "Spam costs money",
    body: "Strangers attach a small refundable amount of NIM to reach you. Contacts never pay.",
  },
]

/** First run, and the fallback when the app is opened outside Nimiq Pay. */
export function ConnectScreen({
  connecting,
  message,
  onRetry,
}: {
  connecting: boolean
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="flex h-full flex-col justify-between px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <BrandMark className="size-20" />

        <h1 className="mt-7 text-3xl font-extrabold tracking-tight">Knock</h1>
        <p className="text-muted-foreground mt-2 max-w-xs text-balance">
          Messages between Nimiq wallets, with spam priced out instead of guessed at.
        </p>

        <div className="mt-10 w-full max-w-sm space-y-3 text-left">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-card flex gap-3.5 rounded-2xl border p-4 shadow-sm"
            >
              <div className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
                <Icon className="size-4.5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{title}</p>
                <p className="text-muted-foreground text-[13px] leading-snug">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full space-y-3 pt-8 pb-4">
        {connecting ? (
          <Button size="lg" disabled className="h-13 w-full rounded-2xl text-base">
            <Loader2 className="animate-spin" />
            Looking for your wallet
          </Button>
        ) : (
          <>
            {message && (
              <p className="text-muted-foreground px-2 text-center text-[13px] text-balance">
                {message}
              </p>
            )}
            <Button
              size="lg"
              className="h-13 w-full rounded-2xl text-base"
              onClick={() => window.location.assign(nimiqPayDeeplink())}
            >
              Open in Nimiq Pay
              <ArrowUpRight />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              className="h-11 w-full rounded-2xl"
              onClick={onRetry}
            >
              <RefreshCw />
              Try again
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
