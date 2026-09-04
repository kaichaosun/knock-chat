import { useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { KeyRound, Loader2, ShieldCheck } from "lucide-react"

import { LegalSheet } from "@/components/legal-sheet"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { PRIVACY, TERMS, type LegalDoc } from "@/lib/legal"
import type { WelcomeStatus } from "@/components/welcome-screen"

/**
 * The tap that signs in, and what is being agreed to by making it.
 *
 * One block used from two places, because the two ways in do not disagree about
 * any of this — only about what has to happen before it. Inside Nimiq Pay the
 * wallet is already there and this sits on the welcome screen itself; in a
 * browser it arrives in the sheet below, once somebody has chosen that wallet.
 */
export function SignInBlock({
  status,
  onSignIn,
}: {
  status: WelcomeStatus
  onSignIn: () => void
}) {
  const { t } = useTranslation()
  /** Whichever document is being read, if either. */
  const [reading, setReading] = useState<LegalDoc | null>(null)

  /** The two waits with nothing else on screen: finding the wallet, and asking the relay. */
  const waiting = status === "detecting" || status === "preparing"

  return (
    <>
      {/* Two waits follow a tap, and only the first is ours to show. The relay
          has to hand out a challenge before the wallet can be asked to sign it,
          and that round trip passes with the wallet not yet up and this button
          unchanged and still live — which reads as a tap that missed, and gets
          tapped again. So it spins and goes dead for exactly that stretch.

          Then it comes back to itself, because from the moment the wallet is
          asked its own window covers this and a spinner underneath is never
          seen doing its job. The one time it would be on screen is after that
          window has gone — and on iOS a sheet dismissed by tapping outside
          settles nothing at all (the host calls neither `sendResponse` nor
          `sendError`, and no event reaches the page — see the dismissal probe),
          so a button still spinning there would never come back for somebody
          who changed their mind.

          `active:` because the app turns the native tap highlight off globally:
          without it the first thing to acknowledge a finger is whatever React
          does next, which is the whole complaint. */}
      <Button
        size="lg"
        disabled={waiting}
        onClick={onSignIn}
        className="h-13 w-full rounded-2xl text-base active:scale-[0.98]"
      >
        {waiting ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {/* "resuming" never reaches here — it has a screen of its own — so
            these three are the whole of it. */}
        {t(
          status === "detecting"
            ? "welcome.looking"
            : status === "preparing"
              ? "welcome.opening"
              : "welcome.signIn",
        )}
      </Button>

      {/* Both of these describe the signature about to be given, so neither
          belongs on screen before one is on offer. While the wallet is still
          being looked for the button is disabled and nothing can be signed —
          and a sentence opening "By signing in" is then describing something
          that cannot be done yet.

          From `ready` onwards they stay put, `preparing` and `signing`
          included: those follow the tap that agreed, and taking the terms away
          at the moment they take effect would be the wrong half of the exchange
          to hide. */}
      {status !== "detecting" && (
        <>
          <p className="text-muted-foreground flex items-center justify-center gap-1.5 text-[12px]">
            <ShieldCheck className="size-3.5" />
            {t("welcome.oneSignature")}
          </p>

          {/* Where the agreement is made, so it is on the screen the signature
              is given on rather than somewhere it could be said nobody passed.
              Both open here rather than in a browser: a Mini App has none to
              send anybody to. */}
          <p className="text-muted-foreground px-2 text-center text-[12px] leading-snug text-balance">
            {/* One sentence with two buttons inside it. Split into three strings
                it could not be reordered, and word order is the first thing a
                translation changes. */}
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

      <LegalSheet
        doc={reading}
        open={reading !== null}
        onOpenChange={(next) => !next && setReading(null)}
      />
    </>
  )
}

/**
 * Signing in with a wallet that lives in this browser.
 *
 * A step of its own, because the alternative was a second screen almost
 * identical to the first: the same mark, the same words, the same two cards,
 * one button swapped. Tapping "use a wallet in this browser" and arriving there
 * read as a tap that had not worked.
 *
 * It cannot be folded into that one tap, either. The Hub signs in a popup, and
 * a browser only lets one open while the click that asked for it is still in
 * hand — `connect` has to load the Hub first, which spends that click. So a
 * second gesture is required, and all that was wrong was that it looked like
 * the first one. See `signIn` in `lib/auth` for the promise that buys the rest.
 */
export function SignInSheet({
  open,
  onOpenChange,
  status,
  message,
  onSignIn,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: WelcomeStatus
  /** Whatever went wrong, in the wallet's or the relay's own words. */
  message?: string
  onSignIn: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto w-full max-w-[30rem] rounded-t-3xl px-5 pb-safe"
      >
        <SheetHeader className="px-0">
          <SheetTitle>{t("welcome.signInTitle")}</SheetTitle>
          <SheetDescription>{t("welcome.signInNote")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3 pb-8">
          {status === "error" && message && (
            <p className="text-destructive px-2 text-center text-[13px] text-balance">{message}</p>
          )}
          <SignInBlock status={status} onSignIn={onSignIn} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
