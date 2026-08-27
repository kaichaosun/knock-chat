/**
 * Wallet access.
 *
 * Inside Nimiq Pay the host injects `window.nimiq` and the SDK's `init()`
 * resolves with it. Outside — a desktop browser during development — there is
 * no provider, so a dev identity stands in. Pass `?as=alice` (or bob, carol,
 * dave) to pick one, which makes it possible to open two tabs and hold a real
 * conversation without touching a phone.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import { init, getHostLanguage, type NimiqProvider } from "@nimiq/mini-app-sdk"

import { addressFromPublicKey } from "./address"
import { signedMessageDigest } from "./signed-message"

/** How long to wait for Nimiq Pay to inject the provider before giving up. */
const PROVIDER_TIMEOUT_MS = 2500

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

export type WalletMode = "nimiq-pay" | "dev"

/** What the relay needs to prove who you are: a signature over its challenge. */
export type SignedMessage = { publicKey: string; signature: string }
export type Signer = (message: string) => Promise<SignedMessage>

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
  return async (message) => ({
    publicKey: toHex(ed25519.getPublicKey(privateKey)),
    signature: toHex(ed25519.sign(signedMessageDigest(message), privateKey)),
  })
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

function language(): string {
  return getHostLanguage() ?? navigator.language.split("-")[0] ?? "en"
}

export async function connect(): Promise<ConnectResult> {
  let provider: NimiqProvider
  try {
    provider = await init({ timeout: PROVIDER_TIMEOUT_MS })
  } catch {
    // No provider: fall back to a dev identity in development, and ask the
    // user to open the app in Nimiq Pay in production.
    const asked = requestedDevIdentity() ?? "alice"
    if (import.meta.env.DEV) {
      return {
        ok: true,
        wallet: {
          mode: "dev",
          provider: null,
          sign: devSigner(asked),
          scope: `dev:${asked}`,
          language: language(),
        },
      }
    }
    return {
      ok: false,
      reason: "no-host",
      message: "Knock runs inside Nimiq Pay.",
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
        const result = await provider.sign(message)
        if ("error" in result) throw new Error(result.error.message)
        return { publicKey: result.publicKey, signature: result.signature }
      },
      scope: "wallet",
      language: language(),
    },
  }
}
