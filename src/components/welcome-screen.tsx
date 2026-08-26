import { useState } from "react"
import { ArrowUpRight, KeyRound, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { LegalSheet } from "@/components/legal-sheet"
import { Button } from "@/components/ui/button"
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legal"
import { nimiqPayDeeplink } from "@/lib/wallet"

/**
 * Everything before the inbox, on one screen.
 *
 * There is exactly one thing to do here — sign in — so there is exactly one
 * screen. Finding the wallet is a state of this screen, not a step of its own:
 * the wallet gives us the public key *inside* the signature, so there is
 * nothing to ask it beforehand.
 */
export type WelcomeStatus =
  | "detecting"
  /** Finding the wallet for somebody who is already signed in. */
  | "resuming"
  /** Provider ready, waiting for the user to start. */
  | "ready"
  | "signing"
  /** Not running inside Nimiq Pay. */
  | "no-host"
  | "error"

const POINTS = [
  {
    icon: Zap,
    title: "No sign-up",
    body: "Your Nimiq address is your account. Nothing to create, nothing to remember.",
  },
  {
    icon: ShieldCheck,
    title: "Spam costs money",
    body: "Strangers attach a small amount of NIM to reach you. Contacts never pay.",
  },
]

export function WelcomeScreen({
  status,
  message,
  onSignIn,
  onRetry,
}: {
  status: WelcomeStatus
  message?: string
  onSignIn: () => void
  onRetry: () => void
}) {
  /** Whichever document is being read, if either. */
  const [reading, setReading] = useState<LegalDoc | null>(null)

  // Somebody with a session is not being asked to do anything — they are
  // waiting. Showing them the pitch and a "sign in" control for the seconds it
  // takes to find the wallet says they are signed out, which they are not.
  if (status === "resuming") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 pt-safe pb-safe">
        <BrandMark className="w-24" />
        {/*<Loader2 className="text-muted-foreground size-5 animate-spin" />*/}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col justify-between px-6 pt-safe pb-safe">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <BrandMark className="w-24" />

        <h1 className="mt-7 text-3xl font-extrabold tracking-tight">Knock</h1>
        <p className="text-muted-foreground mt-2 max-w-xs text-balance">
          Messages between Nimiq wallets, with spam priced out instead of guessed at.
        </p>

        <div className="mt-10 w-full max-w-sm space-y-3 text-left">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card flex gap-3.5 rounded-2xl border p-4 shadow-sm">
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
        {message && (
          <p
            className={
              status === "error"
                ? "text-destructive px-2 text-center text-[13px] text-balance"
                : "text-muted-foreground px-2 text-center text-[13px] text-balance"
            }
          >
            {message}
          </p>
        )}

        {status === "no-host" ? (
          <>
            <Button
              size="lg"
              className="h-13 w-full rounded-2xl text-base"
              onClick={() => window.location.assign(nimiqPayDeeplink())}
            >
              Open in Nimiq Pay
              <ArrowUpRight />
            </Button>
            <Button size="lg" variant="ghost" className="h-11 w-full rounded-2xl" onClick={onRetry}>
              <RefreshCw />
              Try again
            </Button>
          </>
        ) : (
          <>
            <Button
              size="lg"
              disabled={status !== "ready" && status !== "error"}
              onClick={onSignIn}
              className="h-13 w-full rounded-2xl text-base"
            >
              {status === "detecting" || status === "signing" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <KeyRound />
              )}
              {label(status)}
            </Button>
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[12px]">
              <ShieldCheck className="size-3.5" />
              One signature. Nothing is spent.
            </p>

            {/* Where the agreement is made, so it is on the screen the
                signature is given on rather than somewhere it could be said
                nobody passed. Both open here rather than in a browser: a Mini
                App has none to send anybody to. */}
            <p className="text-muted-foreground px-2 text-center text-[12px] leading-snug text-balance">
              By signing in you agree to our{" "}
              <button
                type="button"
                onClick={() => setReading(TERMS)}
                className="text-foreground font-semibold underline underline-offset-2"
              >
                Terms of Service
              </button>{" "}
              and{" "}
              <button
                type="button"
                onClick={() => setReading(PRIVACY)}
                className="text-foreground font-semibold underline underline-offset-2"
              >
                Privacy Policy
              </button>
              .
            </p>
          </>
        )}
      </div>

      <LegalSheet
        doc={reading}
        open={reading !== null}
        onOpenChange={(next) => !next && setReading(null)}
      />
    </div>
  )
}

function label(status: WelcomeStatus): string {
  switch (status) {
    case "detecting":
    case "resuming":
      return "Looking for your wallet"
    case "signing":
      return "Waiting for your wallet"
    case "error":
      return "Try again"
    default:
      return "Sign in with your wallet"
  }
}
