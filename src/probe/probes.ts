/**
 * Device probes — throwaway.
 *
 * Three questions block the auth, invite and postage slices, and none of them
 * can be answered from a desktop browser. Each probe runs against the real
 * provider inside Nimiq Pay and reports raw values, not verdicts, so an
 * unexpected answer is still useful.
 *
 * Delete this directory once SPEC.md §11 is settled.
 */

import { ed25519 } from "@noble/curves/ed25519.js"
import type { NimiqProvider } from "@nimiq/mini-app-sdk"

import { addressFromPublicKey, compact } from "@/lib/address"
import { copyText } from "@/lib/clipboard"
import { hexToBytes, verifySignedMessage } from "@/lib/signed-message"

declare global {
  interface Window {
    /** EIP-1193 provider Nimiq Pay injects alongside `window.nimiq`. */
    ethereum?: unknown
  }
}

export type Outcome = "pass" | "fail" | "info"

export type ProbeReport = {
  outcome: Outcome
  /** Short human answer to the question the probe asks. */
  headline: string
  /** Raw values, shown verbatim and included in the copied report. */
  detail: Record<string, string>
}

/** What the app is running inside, and what survived the trip. */
export function environmentProbe(): ProbeReport {
  const inPay = typeof window.nimiq !== "undefined"
  return {
    outcome: inPay ? "pass" : "info",
    headline: inPay ? "Running inside Nimiq Pay" : "No provider — not inside Nimiq Pay",
    detail: {
      "window.nimiq": String(typeof window.nimiq),
      "window.nimiqPay": String(typeof window.nimiqPay),
      "window.ethereum": String(typeof window.ethereum),
      "host language": String(window.nimiqPay?.language ?? "(not set)"),
      "secure context": String(window.isSecureContext),
      "crypto.randomUUID": String(typeof crypto?.randomUUID),
      href: window.location.href,
      "location.search": window.location.search || "(empty)",
      "location.hash": window.location.hash || "(empty)",
      "user agent": navigator.userAgent,
    },
  }
}

/** Basic provider reachability, and the address the wallet says is ours. */
export async function walletProbe(provider: NimiqProvider): Promise<ProbeReport> {
  const [accounts, consensus, height] = await Promise.all([
    provider.listAccounts(),
    provider.isConsensusEstablished(),
    provider.getBlockNumber(),
  ])
  const list = Array.isArray(accounts) ? accounts : []
  return {
    outcome: list.length > 0 ? "pass" : "fail",
    headline: list.length > 0 ? `Wallet reports ${list.length} account(s)` : "No accounts returned",
    detail: {
      accounts: list.join("\n") || "(none)",
      "consensus established": String(consensus),
      "block height": String(height),
    },
  }
}

/**
 * The important one. Answers three things at once:
 *
 * 1. Does `sign()` sign the raw UTF-8 bytes, or wrap them first? The relay must
 *    verify over exactly the same bytes.
 * 2. Does the returned public key derive to the address the wallet reports?
 *    That validates `addressFromPublicKey` against real data.
 * 3. Are signatures deterministic? Not needed by the current design, but it
 *    settles whether signature-derived keys were ever an option.
 */
export async function signatureProbe(provider: NimiqProvider): Promise<ProbeReport> {
  const message = "knock-probe-v1"
  const first = await provider.sign(message)
  if ("error" in first) throw new Error(first.error.message)

  const second = await provider.sign(message)
  if ("error" in second) throw new Error(second.error.message)

  const publicKey = hexToBytes(first.publicKey)
  const signature = hexToBytes(first.signature)

  // Nimiq wraps and hashes before signing; verify over that construction.
  const verifiesAsSignedMessage = verifySignedMessage(message, signature, publicKey)
  const verifiesOverRawBytes = (() => {
    try {
      return ed25519.verify(signature, new TextEncoder().encode(message), publicKey)
    } catch {
      return false
    }
  })()

  const accounts = await provider.listAccounts()
  const walletAddress = Array.isArray(accounts) ? (accounts[0] ?? "") : ""
  const derived = publicKey.length === 32 ? addressFromPublicKey(publicKey) : "(bad key length)"
  const addressMatches =
    walletAddress !== "" && compact(derived) === compact(walletAddress)

  const deterministic = first.signature === second.signature

  return {
    outcome: verifiesAsSignedMessage && addressMatches ? "pass" : "fail",
    headline: verifiesAsSignedMessage
      ? addressMatches
        ? "Nimiq signed-message construction confirmed; key derives to the wallet address"
        : "Construction confirmed, but the derived address does NOT match"
      : "Does not verify under the known construction — the format changed",
    detail: {
      "message signed": message,
      "verifies as Nimiq signed message": String(verifiesAsSignedMessage),
      "verifies over raw UTF-8": String(verifiesOverRawBytes),
      "public key": first.publicKey,
      "public key bytes": String(publicKey.length),
      "signature": first.signature,
      "signature bytes": String(signature.length),
      "derived address": derived,
      "wallet address": walletAddress || "(none)",
      "addresses match": String(addressMatches),
      "deterministic (same sig twice)": String(deterministic),
      "second signature": second.signature,
    },
  }
}

/** Does a deeplink carry a query string through to the Mini App? */
export function deeplinkProbe(): ProbeReport {
  const origin = window.location.host + window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const carried = params.get("probe")

  return {
    outcome: carried ? "pass" : "info",
    headline: carried
      ? `Query string survived — probe=${carried}`
      : "Open the link below from Nimiq Pay to test",
    detail: {
      "plain deeplink": `https://nimpay.app/miniapps/open/${origin}`,
      "with query": `https://nimpay.app/miniapps/open/${origin}?probe=42`,
      "with encoded query": `https://nimpay.app/miniapps/open/${encodeURIComponent(`${origin}?probe=42`)}`,
      "custom scheme": `nimiqpay://miniapp?url=${encodeURIComponent(`${origin}?probe=42`)}`,
      "current search": window.location.search || "(empty)",
      "probe param seen": carried ?? "(absent)",
    },
  }
}

/**
 * Is there a floor under transaction values that would break 10 NIM postage?
 * Sends to the user's own address, so only the network fee is spent.
 */
export async function minimumAmountProbe(
  provider: NimiqProvider,
  nim: number,
): Promise<ProbeReport> {
  const accounts = await provider.listAccounts()
  const self = Array.isArray(accounts) ? accounts[0] : undefined
  if (!self) throw new Error("no account to send to")

  const luna = Math.round(nim * 1e5)
  try {
    const result = await provider.sendBasicTransactionWithData({
      recipient: self,
      value: luna,
      data: "knock-probe",
    })
    const failed = typeof result === "object" && result !== null && "error" in result
    return {
      outcome: failed ? "fail" : "pass",
      headline: failed
        ? `${nim} NIM rejected`
        : `${nim} NIM accepted — no floor at this amount`,
      detail: {
        "amount (NIM)": String(nim),
        "amount (luna)": String(luna),
        recipient: self,
        result: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    }
  } catch (error) {
    return {
      outcome: "fail",
      headline: `${nim} NIM threw`,
      detail: {
        "amount (NIM)": String(nim),
        "amount (luna)": String(luna),
        recipient: self,
        error: error instanceof Error ? error.message : String(error),
      },
    }
  }
}

/**
 * Whether this WebView will copy at all, and by which route.
 *
 * `execCommand` returns true in WebViews that copy nothing, so this reports
 * what it claims separately from what can be trusted, and writes a marker you
 * can paste to settle it.
 */
export async function clipboardProbe(): Promise<ProbeReport> {
  const marker = `knock-clipboard-${Date.now()}`
  const detail: Record<string, string> = {
    "secure context": String(window.isSecureContext),
    "navigator.clipboard": String(typeof navigator.clipboard),
    "execCommand present": String(typeof document.execCommand),
  }

  let asyncApi = false
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(marker)
      asyncApi = true
    } catch (error) {
      detail["clipboard.writeText error"] =
        error instanceof Error ? error.message : String(error)
    }
  }
  detail["navigator.clipboard.writeText"] = String(asyncApi)

  // Goes through the app's own implementation rather than a copy of it — a
  // probe that takes a different path can pass where the app fails, which is
  // exactly how the modal focus-trap bug stayed hidden.
  const viaFallback = !asyncApi ? await copyText(marker) : false
  detail["execCommand (via lib/clipboard)"] = String(viaFallback)

  detail["what to paste"] = marker
  detail["how to confirm"] = "Paste somewhere. If it is not this marker, nothing was copied."

  return {
    outcome: asyncApi ? "pass" : viaFallback ? "info" : "fail",
    headline: asyncApi
      ? "Clipboard API works"
      : viaFallback
        ? "execCommand claimed success — paste the marker to see if it is true"
        : "No clipboard access at all; long-press to select instead",
    detail,
  }
}
