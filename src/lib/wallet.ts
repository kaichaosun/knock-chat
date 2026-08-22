/**
 * Wallet access.
 *
 * Inside Nimiq Pay the host injects `window.nimiq` and the SDK's `init()`
 * resolves with it. Outside — a desktop browser during development — there is
 * no provider, so a dev identity stands in. Pass `?as=alice` (or bob, carol,
 * dave) to pick one, which makes it possible to open two tabs and hold a real
 * conversation without touching a phone.
 */

import { init, getHostLanguage, type NimiqProvider } from "@nimiq/mini-app-sdk"

/** How long to wait for Nimiq Pay to inject the provider before giving up. */
const PROVIDER_TIMEOUT_MS = 2500

/** Deeplink that reopens this app inside Nimiq Pay. */
export function nimiqPayDeeplink(): string {
  const host = window.location.host + window.location.pathname
  return `https://nimpay.app/miniapps/open/${host}`
}

/**
 * Valid addresses used only when running outside Nimiq Pay. These are the
 * checksummed vectors from the relay's test suite, so they round-trip cleanly.
 */
const DEV_IDENTITIES: Record<string, string> = {
  alice: "NQ97 V68G X92J 86C2 7P1E ALS6 6CGG 0V5E JLKY",
  bob: "NQ05 563U 530Y XDRT L7GQ M6HE YRNU 20FE 4PNR",
  carol: "NQ73 H7MG SSLA D4ES UB6H BT83 D69H RQ59 97NA",
  dave: "NQ40 8GFD QMNE PJ72 GP82 4RVA CL41 KUAS TMVG",
}

export type WalletMode = "nimiq-pay" | "dev"

export type Wallet = {
  address: string
  mode: WalletMode
  /** Present only inside Nimiq Pay. */
  provider: NimiqProvider | null
  /** ISO 639-1 code the host is set to, when it tells us. */
  language: string
}

export type ConnectResult =
  | { ok: true; wallet: Wallet }
  | { ok: false; reason: "no-host"; message: string }
  | { ok: false; reason: "no-accounts"; message: string }

/** Dev identities offered as quick picks when running outside Nimiq Pay. */
export const devIdentities: Array<{ label: string; address: string }> = Object.entries(
  DEV_IDENTITIES,
).map(([label, address]) => ({ label, address }))

/** Which dev identity the URL asks for, if any. */
export function requestedDevIdentity(): string | null {
  const asked = new URLSearchParams(window.location.search).get("as")
  return asked && asked in DEV_IDENTITIES ? asked : null
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
    const asked = requestedDevIdentity()
    if (import.meta.env.DEV) {
      return {
        ok: true,
        wallet: {
          address: DEV_IDENTITIES[asked ?? "alice"],
          mode: "dev",
          provider: null,
          language: language(),
        },
      }
    }
    return {
      ok: false,
      reason: "no-host",
      message: "Open this Mini App inside Nimiq Pay to use your wallet.",
    }
  }

  const accounts = await provider.listAccounts()
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return {
      ok: false,
      reason: "no-accounts",
      message: "Nimiq Pay did not return an account. Create one and try again.",
    }
  }

  return {
    ok: true,
    wallet: {
      address: accounts[0],
      mode: "nimiq-pay",
      provider,
      language: language(),
    },
  }
}
