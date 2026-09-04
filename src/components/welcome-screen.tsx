import { useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Loader2, RefreshCw, ShieldCheck, Zap } from "lucide-react"

import { BrandMark } from "@/components/brand-mark"
import { SignInBlock, SignInSheet } from "@/components/sign-in-sheet"
import { Button } from "@/components/ui/button"
import {
  NIMIQ_PAY_PAGE,
  chooseBrowserWallet,
  insideNimiqPay,
  openNimiqPay,
} from "@/lib/wallet"

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
  /** Tapped, and waiting on the relay's challenge — the wallet is not up yet. */
  | "preparing"
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
  onDismiss,
}: {
  status: WelcomeStatus
  message?: string
  onSignIn: () => void
  onRetry: () => void
  /**
   * Forget an attempt that failed.
   *
   * There is no session to lose here — this screen is only on show when there
   * isn't one — so all this does is put the status back to where it was before
   * the tap.
   */
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  /**
   * Whether a wallet in this browser is the way in being taken.
   *
   * Separate from the sheet being open, because it outlives it. Closing the
   * sheet is stepping back to where it was opened from — and without this the
   * screen behind would have become the signed-out sign-in layout by then,
   * since `connect` has answered with the Hub and the status says `ready`. That
   * is the duplicate screen this sheet exists to avoid, arrived at by going
   * backwards instead of forwards.
   */
  const [browserWallet, setBrowserWallet] = useState(false)
  /** Whether the sheet is up. */
  const [signingIn, setSigningIn] = useState(false)
  /** Set once a tap on "Open in Nimiq Pay" has gone unanswered. */
  const [payMissing, setPayMissing] = useState(false)
  /** Between the tap and finding out whether anything answered it. */
  const [openingPay, setOpeningPay] = useState(false)

  // The one thing actually knowable about where this is running. Inside Nimiq
  // Pay the host may have answered too late, which is worth another try;
  // outside it there is no provider to wait for and the way in is a choice.
  const inPay = insideNimiqPay()

  // Being offered that choice is not a failure and should not read as one.
  // `message` is the wallet's own words, right for something that broke.
  const explain = status === "no-host" && !inPay ? null : message

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
      <div className="mx-auto flex w-full max-w-sm flex-col items-center text-center">
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

      <div className="mx-auto mt-10 w-full max-w-sm shrink-0 space-y-3">
        {explain && !signingIn && (
          <p
            className={
              status === "error"
                ? "text-destructive px-2 text-center text-[13px] text-balance"
                : "text-muted-foreground px-2 text-center text-[13px] text-balance"
            }
          >
            {explain}
          </p>
        )}

        {/* Which way in is on offer, rather than how far along it is. A
            browser gets the two choices and keeps them: the sheet is a step in
            front of this screen, so this screen has to still be here when it
            closes. Nimiq Pay has no such choice to make and signs in from
            here. */}
        {status === "no-host" || browserWallet ? (
          <>
            {/* First, because it is the answer for most of the people who get
                here: Knock is a Nimiq Pay Mini App, and the wallet they already
                have is in that app. On a desktop this leads nowhere — nothing
                answers `nimiqpay://` — but the alternative is guessing at the
                device from its user agent, and a guess that goes the other way
                costs a phone user the app entirely. */}
            {/* Above the buttons, where this screen already puts what it has
                to say — `explain` sits in the same place. It keeps the two ways
                in next to each other as the pair of choices they are, rather
                than splitting them with a paragraph.

                Only after a tap that led nowhere, and said in place rather than
                by navigating away: the second way in is the button below, and
                somebody who has just learned they need an app they have not got
                should not have to find their way back to it. */}
            {payMissing && (
              <p className="text-muted-foreground px-2 text-center text-[13px] leading-snug text-balance">
                {t("welcome.payMissing")}{" "}
                <a
                  href={NIMIQ_PAY_PAGE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground font-semibold underline underline-offset-2"
                >
                  {t("welcome.getPay")}
                </a>
              </p>
            )}

            <Button
              size="lg"
              disabled={openingPay}
              className="h-13 w-full rounded-2xl text-base"
              onClick={() => {
                setOpeningPay(true)
                setPayMissing(false)
                openNimiqPay((answered) => {
                  setOpeningPay(false)
                  // Inside Nimiq Pay the app is installed by definition, so a
                  // host that answers slowly is not a missing app and must not
                  // be reported as one.
                  if (!answered && !inPay) setPayMissing(true)
                })
              }}
            >
              {t("welcome.openInPay")}
              {/* The wait is a second and a half of a tap having visibly done
                  nothing, which is the complaint this screen started with. */}
              {openingPay ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
            </Button>

            {/* The second way in, and deliberately the quieter one. Both work,
                but they are not equals here: a wallet in this browser is not a
                shortcut to the one in the app — it is a different wallet, in
                storage only this browser can see. Ranked rather than paired,
                so the common case is one tap and the other is still there for
                whoever wants it.

                Chosen for this page load only, then `connect` is re-run in
                place by the same retry the other cases use. */}
            {!inPay && (
              <Button
                size="lg"
                variant="outline"
                className="h-12 w-full rounded-2xl"
                onClick={() => {
                  // Whatever the other way in had to say about itself is spent:
                  // "you may not have Nimiq Pay installed" is advice about an
                  // app this tap is a decision not to use.
                  setPayMissing(false)
                  // Only the first tap chooses anything. Afterwards this is the
                  // way back into a sheet that was closed, and the wallet it
                  // would ask for is already found.
                  if (!browserWallet) {
                    chooseBrowserWallet()
                    onRetry()
                    setBrowserWallet(true)
                  }
                  setSigningIn(true)
                }}
              >
                {t("welcome.useBrowserWallet")}
              </Button>
            )}

            {/* Only inside Nimiq Pay, where a provider that did not answer in
                time may still answer now. Outside it nothing is being waited
                for, and the second button above is already the way to try
                again. */}
            {inPay && (
              <Button size="lg" variant="ghost" className="h-11 w-full rounded-2xl" onClick={onRetry}>
                <RefreshCw />
                {t("welcome.tryAgain")}
              </Button>
            )}
          </>
        ) : (
          <SignInBlock status={status} onSignIn={onSignIn} />
        )}
      </div>

      <SignInSheet
        open={signingIn}
        onOpenChange={(next) => {
          setSigningIn(next)
          // Closing is abandoning the attempt, so what it said about itself
          // goes with it. Left standing, the failure outlived the sheet twice
          // over: above "Open in Nimiq Pay" on the screen behind, where it was
          // never about that button, and again at the top of the sheet the next
          // time it opened — a complaint reopened rather than a fresh try.
          if (!next) onDismiss()
        }}
        status={status}
        message={message}
        onSignIn={onSignIn}
      />
    </div>
  )
}

