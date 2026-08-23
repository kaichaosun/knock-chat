/**
 * Client for knock-relay.
 *
 * Requests go to `/api` by default, which the Vite dev server proxies to the
 * relay — so the same URL works from a phone on the same network as it does on
 * the desktop. Override with `VITE_RELAY_URL` when pointing at a deployed relay.
 */

const BASE = (import.meta.env.VITE_RELAY_URL as string | undefined) ?? "/api"

export type RelayInfo = {
  name: string
  version: string
  /** Identifies the relay's sequence space; see `lib/messages.ts`. */
  instance: string
  max_body_len: number
  authenticated: boolean
}

export type Envelope = {
  /** Stable and unique for all time; the client deduplicates on this. */
  id: string
  seq: number
  from: string
  to: string
  body: string
  created_at: string
}

export type FetchResult = {
  messages: Envelope[]
  /** Opaque — hand it straight back next time and never interpret it. */
  next: string
}

/**
 * The current session token, attached to every request. Held here rather than
 * threaded through each call because there is exactly one session at a time.
 */
let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

/** An error carrying whatever the relay said, so the UI can show something real. */
export class RelayError extends Error {
  // Declared as a field rather than a constructor parameter property, which
  // `erasableSyntaxOnly` disallows.
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "RelayError"
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new RelayError("Can't reach the relay. Is it running?", 0)
  }

  if (!response.ok) {
    // Error bodies are `{ "error": "…" }`, but never trust that under failure.
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined)
    throw new RelayError(detail ?? `Relay returned ${response.status}`, response.status)
  }

  return response.json() as Promise<T>
}

export function getInfo(): Promise<RelayInfo> {
  return request<RelayInfo>("/v1/info")
}

export function sendMessage(from: string, to: string, body: string) {
  return request<{ seq: number; created_at: string }>("/v1/messages", {
    method: "POST",
    body: JSON.stringify({ from, to, body }),
  })
}

export function fetchMessages(to: string, cursor: string | null): Promise<FetchResult> {
  const params = new URLSearchParams({ to })
  if (cursor) params.set("cursor", cursor)
  return request<FetchResult>(`/v1/messages?${params}`)
}

export function ackMessages(to: string, cursor: string) {
  return request<{ acked: number }>("/v1/messages/ack", {
    method: "POST",
    body: JSON.stringify({ to, cursor }),
  })
}

// -- knocks and postage ----------------------------------------------------

/** Luna per NIM. Amounts travel as integer luna and are shown as NIM. */
export const LUNA_PER_NIM = 100_000

export type Policy = { amount_luna: number }

/** Everything a sender needs to decide between writing, knocking, or waiting. */
export type Reachability = {
  policy: Policy
  channel_open: boolean
  knock_pending: boolean
  /** What they call themselves, if they have said. Unverified — see `lib/names`. */
  name: string | null
}

export type Knock = {
  id: string
  from: string
  to: string
  body: string
  created_at: string
}

export function getReachability(address: string): Promise<Reachability> {
  return request<Reachability>(`/v1/reachability/${encodeURIComponent(address)}`)
}

export function setPolicy(amountLuna: number): Promise<Policy> {
  return request<Policy>("/v1/policy", {
    method: "PUT",
    body: JSON.stringify({ amount_luna: amountLuna }),
  })
}

// -- display names ---------------------------------------------------------

/**
 * Display names for a list of addresses, keyed by the address in its grouped
 * form. Only addresses that have chosen a name appear.
 */
export type Names = Record<string, string>

export type Profile = { name: string | null }

/**
 * The longest name the relay will accept, in characters. Mirrored here so the
 * field can stop you before a round trip, not so the client can be trusted —
 * the relay checks the same thing again.
 */
export const MAX_NAME_LEN = 32

/** Set your own display name. A blank name clears it. */
export function setProfile(name: string): Promise<Profile> {
  return request<Profile>("/v1/profile", {
    method: "PUT",
    body: JSON.stringify({ name }),
  })
}

/** Knock on a door. `postage` is omitted only when the recipient waived it. */
export function sendKnock(
  to: string,
  body: string,
  postage: { tx_hash: string; nonce: string } | null,
): Promise<Knock> {
  return request<Knock>("/v1/knocks", {
    method: "POST",
    body: JSON.stringify({ to, body, postage }),
  })
}

export function listKnocks(): Promise<{ knocks: Knock[]; names: Names }> {
  return request<{ knocks: Knock[]; names: Names }>("/v1/knocks")
}

export function acceptKnock(id: string) {
  return request<{ seq: number }>(`/v1/knocks/${id}/accept`, { method: "POST" })
}

export function declineKnock(id: string) {
  return request<Knock>(`/v1/knocks/${id}/decline`, { method: "POST" })
}

export type Contact = { address: string; opened_at: string }

export function listContacts(): Promise<{ contacts: Contact[]; names: Names }> {
  return request<{ contacts: Contact[]; names: Names }>("/v1/contacts")
}

/**
 * Shut the channel with someone you had let in.
 *
 * There is one channel, not one per side, so this closes it for both: their
 * next message costs postage again, exactly as if you had never answered.
 */
export function removeContact(address: string): Promise<{ address: string }> {
  return request<{ address: string }>(`/v1/contacts/${encodeURIComponent(address)}`, {
    method: "DELETE",
  })
}
