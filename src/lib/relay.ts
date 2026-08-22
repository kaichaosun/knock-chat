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
  max_body_len: number
  authenticated: boolean
}

export type Envelope = {
  seq: number
  from: string
  to: string
  body: string
  created_at: string
}

export type FetchResult = {
  messages: Envelope[]
  next: number
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...init?.headers },
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

export function fetchMessages(to: string, since: number): Promise<FetchResult> {
  const params = new URLSearchParams({ to, since: String(since) })
  return request<FetchResult>(`/v1/messages?${params}`)
}

export function ackMessages(to: string, through: number) {
  return request<{ acked: number }>("/v1/messages/ack", {
    method: "POST",
    body: JSON.stringify({ to, through }),
  })
}
