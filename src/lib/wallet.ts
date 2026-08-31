/**
 * Wallet access.
 *
 * Three ways to reach one, and the app treats all three as the same thing: a
 * signer. Identity is whatever key signed, so nothing above here has to know
 * which of them answered.
 *
 * Inside Nimiq Pay the host injects `window.nimiq` and the SDK's `init()`
 * resolves with it. In an ordinary browser there is no provider, so the Nimiq
 * Hub signs in a popup instead — which is what makes a desktop tab a place the
 * app works rather than a dead end. In development a dev identity stands in
 * for both: pass `?as=alice` (or bob, carol, dave) to pick one, which makes it
 * possible to open two tabs and hold a real conversation without touching a
 * phone, or `?wallet=hub` to exercise the Hub path instead.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { init, getHostLanguage, type NimiqProvider } from "@nimiq/mini-app-sdk"
// Type only. The Hub itself is imported where it is needed, which is never
// inside Nimiq Pay — see `connect`.
import type HubApi from "@nimiq/hub-api"

import { addressFromPublicKey } from "./address"
import { unwrapTransaction } from "./payments"
import { signedMessageDigest } from "./signed-message"

/** How long to wait for Nimiq Pay to inject the provider before giving up. */
const PROVIDER_TIMEOUT_MS = 2500

/**
 * Where the Hub lives. Stated rather than left to the SDK's own default, which
 * reads the page's domain and sends anything that is not `nimiq.com` to a Hub
 * on `localhost:8080` — so on knockchat.org the default is a wallet nobody has
 * running.
 */
const HUB_ENDPOINT = "https://hub.nimiq.com"

/** What the Hub tells the user they are signing for. */
const HUB_APP_NAME = "Knock"

/**
 * Whether Nimiq Pay is the thing we are running in.
 *
 * The host context is seeded before the page script runs, unlike the provider,
 * which arrives whenever it arrives. So this answers "is there a wallet coming"
 * whether or not one has turned up yet.
 */
export function insideNimiqPay(): boolean {
  return typeof window.nimiqPay !== "undefined"
}

/**
 * Deeplink that reopens this app inside Nimiq Pay, on the page you are on.
 *
 * The query string comes along, which is what makes an invite survive the trip:
 * someone who scanned a code with their phone's own camera lands here in a
 * browser, and without it they would arrive inside Nimiq Pay at the front door
 * with no idea who they were trying to reach.
 *
 * The custom scheme rather than `nimpay.app/miniapps/open/…`: both resolve to
 * the same link, but this one opens the app directly instead of going through a
 * web page first.
 */
export function nimiqPayDeeplink(): string {
  const here = window.location.host + window.location.pathname + window.location.search
  return `nimiqpay://miniapp?url=${encodeURIComponent(here)}`
}

/**
 * Dev identities are real Ed25519 keypairs from fixed seeds, not fake addresses.
 *
 * That matters: the relay authenticates everyone by verifying a signed
 * challenge, so a dev identity has to be able to actually sign one. Giving the
 * dev path real keys means the relay needs no test-only bypass — there is no
 * back door to forget to close. The seeds match the relay's test wallets.
 */
const DEV_SEEDS: Record<string, number> = { alice: 1, bob: 2, carol: 3, dave: 4 }

function devPrivateKey(name: string): Uint8Array {
  return new Uint8Array(32).fill(DEV_SEEDS[name] ?? 1)
}

function devAddress(name: string): string {
  return addressFromPublicKey(ed25519.getPublicKey(devPrivateKey(name)))
}

export type WalletMode = "nimiq-pay" | "hub" | "dev"

/** What the relay needs to prove who you are: a signature over its challenge. */
export type SignedMessage = { publicKey: string; signature: string }

/**
 * Signs a relay challenge.
 *
 * Takes the message *or a promise of it*, which is not a convenience. The Hub
 * signs in a popup, and a browser only allows a popup while the click that
 * asked for it is still in hand — put an `await` in between and it is blocked,
 * unconditionally on Safari. The message comes from a challenge, and fetching
 * that challenge is exactly such an await.
 *
 * So the promise is what lets the window open on the click and the message
 * arrive after it. `HubApi.signMessage` accepts a promised request for this
 * same reason. The other two signers simply await it and are none the wiser.
 */
export type Signer = (message: string | Promise<string>) => Promise<SignedMessage>

/** One payment on chain. `data` is the postage commitment, where there is one. */
export type Payment = { recipient: string; luna: number; data?: string }

/**
 * Pays, and answers with the transaction's hash.
 *
 * A hash rather than the transaction, because the hash is the whole of what
 * anyone here does with it: the relay looks the payment up by it and checks the
 * amount, the recipient and the data for itself.
 *
 * Takes a promise for the same reason [`Signer`] does — the Hub pays in a
 * popup, and a popup only opens while the click is still in hand. It has a
 * second use here, though, and it is the more important one: what the payment
 * waits on is whatever must be true before money moves. Nimiq Pay raises no
 * dialog until the promise settles, so a check that fails costs nothing and
 * shows nothing; the Hub's window is already open by then and closes again
 * with nothing done. Either way the order that matters — decide first, spend
 * second — is the one the promise states.
 */
export type Payer = (payment: Payment | Promise<Payment>) => Promise<string>

/**
 * A wallet is only a signer here.
 *
 * It deliberately carries no address: `sign()` returns the public key, and the
 * address derives from that, so asking the wallet who it is *before* proving it
 * would be a second round trip and a second permission prompt for information
 * the signature already contains. Identity arrives with the session.
 */
export type Wallet = {
  mode: WalletMode
  /** Present only inside Nimiq Pay. */
  provider: NimiqProvider | null
  /** Signs a relay challenge. Prompts the user inside Nimiq Pay. */
  sign: Signer
  /**
   * Spends, where this wallet can. Null for a development identity, which has
   * keys the relay believes but no coins anywhere to move.
   *
   * Every caller checks it before it counts on being able to pay, because
   * "cannot pay" is a thing to say plainly rather than a failure to hit.
   */
  pay: Payer | null
  /**
   * Which stored session belongs to this wallet. One per dev identity so two
   * browser tabs can hold separate sessions against the same origin.
   */
  scope: string
  /** ISO 639-1 code the host is set to, when it tells us. */
  language: string
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Sign exactly as Nimiq Pay does, so the relay verifies both paths identically. */
function devSigner(name: string): Signer {
  const privateKey = devPrivateKey(name)
  return async (message) => {
    const text = await message
    return {
      publicKey: toHex(ed25519.getPublicKey(privateKey)),
      signature: toHex(ed25519.sign(signedMessageDigest(text), privateKey)),
    }
  }
}

/**
 * Signs through the Nimiq Hub, in a popup.
 *
 * `signMessage` is handed a promise and called before this function awaits
 * anything, so the popup opens while the click is still live and the challenge
 * is delivered into a window that is already up. Reordering these two lines
 * would put an await in front of the popup and hand the browser a reason to
 * block it — see `Signer`.
 *
 * The Hub wraps and hashes the message exactly as Nimiq Pay does — its
 * `MSG_PREFIX` is the prefix in `lib/signed-message` — so the relay verifies
 * both the same way and needs to know nothing about which wallet signed.
 */
function hubSigner(hub: HubApi): Signer {
  return async (message) => {
    const signed = await hub.signMessage(
      Promise.resolve(message).then((text) => ({ appName: HUB_APP_NAME, message: text })),
    )
    return { publicKey: toHex(signed.signerPublicKey), signature: toHex(signed.signature) }
  }
}

/**
 * Pays through Nimiq Pay.
 *
 * Awaits the payment before raising anything, so the wallet's sheet still
 * appears only once whatever the payment was waiting on has succeeded — which
 * is exactly when it appeared before there was a promise to wait on.
 *
 * Two methods rather than one because the SDK has two, and passing empty data
 * is not the same transaction as passing none.
 */
function providerPayer(provider: NimiqProvider): Payer {
  return async (payment) => {
    const { recipient, luna, data } = await payment
    return unwrapTransaction(
      data === undefined
        ? await provider.sendBasicTransaction({ recipient, value: luna })
        : await provider.sendBasicTransactionWithData({ recipient, value: luna, data }),
    )
  }
}

/**
 * Pays through the Hub, in a popup.
 *
 * `checkout` both broadcasts the transaction and hands it back, which is what
 * makes it the counterpart of `sendBasicTransactionWithData` rather than of
 * `signTransaction` — the relay looks the payment up on chain, so one that was
 * only signed would never be found.
 *
 * Called before this awaits anything, so the window opens on the click; see
 * [`Payer`].
 */
function hubPayer(hub: HubApi): Payer {
  return async (payment) => {
    const signed = await hub.checkout(
      Promise.resolve(payment).then(({ recipient, luna, data }) => ({
        appName: HUB_APP_NAME,
        recipient,
        value: luna,
        // Bytes, not the string. The relay hex-decodes what is on chain and
        // compares it to the commitment as text, so what has to match is the
        // exact UTF-8 — and encoding it here leaves nothing to be interpreted
        // by anyone in between.
        ...(data === undefined ? {} : { extraData: new TextEncoder().encode(data) }),
      })),
    )
    return signed.hash
  }
}

export type ConnectResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; reason: "no-host"; message: string }

/** Dev identities offered as quick picks when running outside Nimiq Pay. */
export const devIdentities: Array<{ label: string; address: string }> = Object.keys(
  DEV_SEEDS,
).map((label) => ({ label, address: devAddress(label) }))

/** Which dev identity the URL asks for, if any. */
export function requestedDevIdentity(): string | null {
  const asked = new URLSearchParams(window.location.search).get("as")
  return asked && asked in DEV_SEEDS ? asked : null
}

/**
 * Set when somebody picks the browser wallet over the app on the welcome
 * screen. Lives for this page load and no longer.
 *
 * Not remembered on purpose. Remembering it would need a way to un-remember
 * it — being stuck with the wrong wallet is being stuck out of your account —
 * and the choice costs one tap on a screen you only see when signed out.
 */
let browserWalletChosen = false

/** Take the browser wallet on a device that would otherwise be sent to the app. */
export function chooseBrowserWallet(): void {
  browserWalletChosen = true
}

/**
 * Whether to reach for the Hub rather than the wallet this device would
 * otherwise get — a dev identity in development, Nimiq Pay on a phone.
 *
 * Two ways in. The query string is the developer's: without it the Hub path is
 * unreachable on a laptop, since the dev identity answers first. The flag above
 * is the phone user's, and is the second of the two buttons on the welcome
 * screen.
 */
function wantsHub(): boolean {
  if (browserWalletChosen) return true
  return new URLSearchParams(window.location.search).get("wallet") === "hub"
}

function language(): string {
  return getHostLanguage() ?? navigator.language.split("-")[0] ?? "en"
}

export async function connect(): Promise<ConnectResult> {
  let provider: NimiqProvider
  try {
    provider = await init({ timeout: PROVIDER_TIMEOUT_MS })
  } catch {
    // No Nimiq Pay. In development a dev identity stands in, because two tabs
    // holding a conversation is worth more day to day than a real wallet.
    if (import.meta.env.DEV && !wantsHub()) {
      const asked = requestedDevIdentity() ?? "alice"
      return {
        ok: true,
        wallet: {
          mode: "dev",
          provider: null,
          sign: devSigner(asked),
          // Real keys, and no coins behind them anywhere.
          pay: null,
          scope: `dev:${asked}`,
          language: language(),
        },
      }
    }

    // No provider means we are not inside Nimiq Pay — and that is the whole of
    // what is knowable here. Whether the app is *installed*, or whether this is
    // even a device that could install it, is not: a user agent is a claim, not
    // a fact, and iPadOS calls itself a Macintosh. So the screen asks instead of
    // guessing, and offers both ways in — see `WelcomeScreen`'s `no-host`.
    //
    // Guessing would not be neutral either. Wrong about a phone and its owner
    // loses the app entirely; wrong about a desktop and somebody sees one
    // button that does nothing. Asking is wrong in neither direction.
    if (!wantsHub()) {
      return {
        ok: false,
        reason: "no-host",
        message: "Knock needs a Nimiq wallet.",
      }
    }

    // Everywhere else the Hub is the wallet. A browser tab used to be the end
    // of the road here — one screen offering a `nimiqpay://` link that no
    // desktop can open — and this is what makes it a way in instead.
    //
    // Loaded here rather than at the top of the file: this branch is the only
    // one that reaches it, and inside Nimiq Pay — every phone, which is most
    // of them — it is 11 kB of a wallet that will never be asked anything.
    // Fetched while connecting, long before any click, so the popup below
    // still opens on the tap rather than after an import.
    try {
      const HubApiClass = (await import("@nimiq/hub-api")).default
      const hub = new HubApiClass(HUB_ENDPOINT)
      return {
        ok: true,
        wallet: {
          mode: "hub",
          // No Mini App provider — nothing here speaks that dialect. Paying
          // goes through the Hub's own checkout instead, below.
          provider: null,
          sign: hubSigner(hub),
          pay: hubPayer(hub),
          scope: "hub",
          language: language(),
        },
      }
    } catch {
      // Nothing left to sign with. Rare enough to have no better answer than
      // the one that was always here.
      return {
        ok: false,
        reason: "no-host",
        message: "Knock needs a Nimiq wallet.",
      }
    }
  }

  // Note the absence of a `listAccounts()` call: the signature carries the
  // public key, and whichever account the wallet chooses to sign with is the
  // account the user meant — which also settles "which of my accounts is this?"
  // without us guessing at index zero.
  return {
    ok: true,
    wallet: {
      mode: "nimiq-pay",
      provider,
      sign: async (message) => {
        const result = await provider.sign(await message)
        if ("error" in result) throw new Error(result.error.message)
        return { publicKey: result.publicKey, signature: result.signature }
      },
      pay: providerPayer(provider),
      scope: "wallet",
      language: language(),
    },
  }
}
