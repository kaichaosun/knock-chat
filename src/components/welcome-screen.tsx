import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { ArrowUpRight, KeyRound, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { LegalSheet } from "@/components/legal-sheet"
import { Button } from "@/components/ui/button"
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legal"
import { insideNimiqPay, nimiqPayDeeplink } from "@/lib/wallet"

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
  { icon: Zap, key: "noSignup" },
  { icon: ShieldCheck, key: "spamCosts" },
] as const

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
  const { t } = useTranslation()
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
    // One column, centred as a whole, rather than content pushed up and
    // actions pushed down: with a short bottom block all the slack collects
    // between the two, and the button reads as having been left behind.
    // Scrollable because a centred column that outgrows the screen would
    // otherwise lose both ends of itself.
    <div className="flex h-full flex-col justify-center overflow-y-auto px-6 pt-safe pb-safe">
      <div className="flex flex-col items-center text-center">
        <BrandMark className="w-24" />

        <h1 className="mt-7 text-3xl font-extrabold tracking-tight">Knock</h1>
        <p className="text-muted-foreground mt-2 max-w-xs text-balance">
          {t("welcome.tagline")}
        </p>

        <div className="mt-10 w-full max-w-sm space-y-3 text-left">
          {POINTS.map(({ icon: Icon, key }) => (
            <div key={key} className="bg-card flex gap-3.5 rounded-2xl border p-4 shadow-sm">
              <div className="bg-accent text-accent-foreground flex size-9 shrink-0 items-center justify-center rounded-xl">
                <Icon className="size-4.5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{t(`welcome.points.${key}.title`)}</p>
                <p className="text-muted-foreground text-[13px] leading-snug">
                  {t(`welcome.points.${key}.body`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-10 w-full shrink-0 space-y-3">
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
              {t("welcome.openInPay")}
              <ArrowUpRight />
            </Button>
            {/* Only where it could work. Outside Nimiq Pay there is no provider
                to find, however many times it is asked for — the offer to look
                again belongs to the case where one is late, not absent. */}
            {insideNimiqPay() && (
              <Button size="lg" variant="ghost" className="h-11 w-full rounded-2xl" onClick={onRetry}>
                <RefreshCw />
                {t("welcome.tryAgain")}
              </Button>
            )}
          </>
        ) : (
          <>
            {/* Unchanged by tapping it. The wallet's sheet covers the screen
                the moment it opens, so a spinner here is never seen doing its
                job — the only time it is on screen is after the sheet has gone,
                which is the one moment it is not true. On iOS a sheet dismissed
                by tapping outside settles nothing at all (the host calls
                neither `sendResponse` nor `sendError`, and no event reaches the
                page — see the dismissal probe), so a button that changed on tap
                would change back only for somebody who signed. */}
            <Button
              size="lg"
              disabled={status === "detecting"}
              onClick={onSignIn}
              className="h-13 w-full rounded-2xl text-base"
            >
              {status === "detecting" ? <Loader2 className="animate-spin" /> : <KeyRound />}
              {/* "resuming" never reaches here — it returns its own screen above
                  — so the spinner's condition is the whole of it. */}
              {t(status === "detecting" ? "welcome.looking" : "welcome.signIn")}
            </Button>
            <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[12px]">
              <ShieldCheck className="size-3.5" />
              {t("welcome.oneSignature")}
            </p>

            {/* Where the agreement is made, so it is on the screen the
                signature is given on rather than somewhere it could be said
                nobody passed. Both open here rather than in a browser: a Mini
                App has none to send anybody to. */}
            <p className="text-muted-foreground px-2 text-center text-[12px] leading-snug text-balance">
              {/* One sentence with two buttons inside it. Split into three
                  strings it could not be reordered, and word order is the first
                  thing a translation changes. */}
              <Trans
                i18nKey="welcome.agree"
                components={{
                  terms: (
                    <button
                      type="button"
                      onClick={() => setReading(TERMS)}
                      className="text-foreground font-semibold underline underline-offset-2"
                    />
                  ),
                  privacy: (
                    <button
                      type="button"
                      onClick={() => setReading(PRIVACY)}
                      className="text-foreground font-semibold underline underline-offset-2"
                    />
                  ),
                }}
              />
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

