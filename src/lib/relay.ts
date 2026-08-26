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
  /** Set when this came from a room, and then it is the room's thread. */
  group_id?: string | null
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

/**
 * The most any amount may be, in NIM. Mirrors the relay's own ceiling.
 *
 * Kept here so the three places a sum can be entered — what you charge to be
 * reached, what a room charges to enter, what a gift holds — all refuse the
 * same thing. The relay refuses it too, and its answer is the one that counts;
 * this is so nobody meets that answer *after* a wallet has opened.
 */
export const MAX_AMOUNT_NIM = 1_000_000
export const MAX_AMOUNT_LUNA = MAX_AMOUNT_NIM * LUNA_PER_NIM

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

/**
 * Knocks waiting for your answer, and the ones you are waiting on.
 *
 * `sent` is your side of it: knocks you made that nobody has answered yet.
 * Both come back together because a client that shows either shows both.
 */
export function listKnocks(): Promise<{ knocks: Knock[]; sent?: Knock[]; names: Names }> {
  return request<{ knocks: Knock[]; sent?: Knock[]; names: Names }>("/v1/knocks")
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

// -- groups ----------------------------------------------------------------

/**
 * A room, and what it costs to get in.
 *
 * Membership opens no channel: reaching a member privately still costs their
 * postage, exactly as if you had met them anywhere else. A room is a lobby.
 *
 * Bodies here are **not encrypted**. Direct messages are; group messages in
 * this version are plain text and the relay can read them.
 */
export type Group = {
  id: string
  owner: string
  name: string
  /** What a stranger pays the owner to get in. Zero means anyone may walk in. */
  join_price_luna: number
  /** Whether the owner still has to say yes after they have paid. */
  requires_approval: boolean
  created_at: string
  /**
   * The earliest few members, when the relay sent them.
   *
   * Only the list endpoint carries these — it returns rooms you are already in,
   * so it gives away nothing joining did not. Everywhere else a `Group` arrives
   * without them, which is why this is optional rather than an empty array
   * standing in for "a room with nobody in it".
   */
  members?: string[]
}

/** A room and who is in it. `members` is empty unless you are one. */
export type GroupDetail = {
  group: Group
  members: string[]
  names: Names
}

export type JoinRequest = {
  id: string
  group_id: string
  address: string
  created_at: string
}

export type JoinResult = {
  /** `pending` when the owner still has to answer. */
  status: "joined" | "pending"
  group: Group
}

export function createGroup(input: {
  name: string
  join_price_luna?: number
  requires_approval?: boolean
}): Promise<Group> {
  return request<Group>("/v1/groups", { method: "POST", body: JSON.stringify(input) })
}

/**
 * The rooms you are in.
 *
 * `waiting` counts who is at the door of each room **you own**, keyed by room
 * id and holding only the rooms somebody is waiting at. It rides alongside the
 * list the way names do: who is waiting is the owner's business, and the relay
 * tells nobody else.
 */
export function listGroups(): Promise<{ groups: Group[]; waiting?: Record<string, number> }> {
  return request<{ groups: Group[]; waiting?: Record<string, number> }>("/v1/groups")
}

export function getGroup(id: string): Promise<GroupDetail> {
  return request<GroupDetail>(`/v1/groups/${encodeURIComponent(id)}`)
}

export function updateGroup(
  id: string,
  changes: { name?: string; join_price_luna?: number; requires_approval?: boolean },
): Promise<Group> {
  return request<Group>(`/v1/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  })
}

/** Walk in, or ask to. `postage` is omitted only when the door is free. */
export function joinGroup(
  id: string,
  postage: { tx_hash: string; nonce: string } | null,
): Promise<JoinResult> {
  return request<JoinResult>(`/v1/groups/${encodeURIComponent(id)}/join`, {
    method: "POST",
    body: JSON.stringify({ postage }),
  })
}

export function sayInGroup(id: string, body: string) {
  return request<{ seq: number; created_at: string }>(
    `/v1/groups/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  )
}

export function listJoinRequests(id: string): Promise<{ requests: JoinRequest[]; names: Names }> {
  return request<{ requests: JoinRequest[]; names: Names }>(
    `/v1/groups/${encodeURIComponent(id)}/requests`,
  )
}

export function answerJoinRequest(id: string, request_id: string, admit: boolean) {
  return request<unknown>(
    `/v1/groups/${encodeURIComponent(id)}/requests/${encodeURIComponent(request_id)}/${
      admit ? "approve" : "decline"
    }`,
    { method: "POST" },
  )
}

/**
 * End a room for everybody in it. Owner only; the relay checks.
 *
 * Named rather than a `DELETE` on the room, matching every other thing you do
 * to a group here — and so it cannot be reached by anything that merely meant
 * to tidy up a resource.
 *
 * Gifts outlive it. The relay may still be holding money owed into the room,
 * and that keeps going home on its own; nothing here waits for it.
 */
export function disbandGroup(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/v1/groups/${encodeURIComponent(id)}/disband`, {
    method: "POST",
  })
}

export function removeGroupMember(id: string, address: string): Promise<{ address: string }> {
  return request<{ address: string }>(
    `/v1/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(address)}`,
    { method: "DELETE" },
  )
}

// -- gifts -----------------------------------------------------------------

/**
 * A pot in a room, taken first come first served.
 *
 * The one thing the relay holds itself: a gift has to be funded before anyone
 * knows who will claim it. Whatever is unclaimed goes back to the sender when
 * it expires.
 */
export type Gift = {
  id: string
  group_id: string
  sender: string
  total_luna: number
  split: "even" | "random"
  note: string
  created_at: string
  expires_at: string
  shares: number
  /** How many have been taken. */
  claimed: number
  refunded: boolean
}

export type GiftClaim = {
  address: string
  amount_luna: number
  claimed_at: string
  /** Null while the share is yours but the transfer has not gone out yet. */
  payout_tx: string | null
}

export type GiftDetail = {
  gift: Gift
  claims: GiftClaim[]
  names: Names
  /** What you got, if you were quick enough. */
  yours: number | null
}

/** Where to send a gift's money, and the terms the relay holds it on. */
export type GiftTerms = {
  fund_to: string
  expires_in_hours: number
  max_shares: number
}

export function getGiftTerms(): Promise<GiftTerms> {
  return request<GiftTerms>("/v1/gifts/terms")
}

export function createGift(
  groupId: string,
  input: {
    total_luna: number
    shares: number
    split: "even" | "random"
    note: string
    postage: { tx_hash: string; nonce: string }
  },
): Promise<Gift> {
  return request<Gift>(`/v1/groups/${encodeURIComponent(groupId)}/gifts`, {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export function getGift(id: string): Promise<GiftDetail> {
  return request<GiftDetail>(`/v1/gifts/${encodeURIComponent(id)}`)
}

export function claimGift(id: string): Promise<GiftClaim> {
  return request<GiftClaim>(`/v1/gifts/${encodeURIComponent(id)}/claim`, { method: "POST" })
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
