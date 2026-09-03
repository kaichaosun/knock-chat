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
  /**
   * Messages taken back since this device last asked, by id alone.
   *
   * Not envelopes with the body emptied: a deletion is not a message. An id for
   * one this device never held is a harmless no-op.
   */
  deleted?: string[]
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

  // Nothing to parse, and `.json()` on an empty body throws a SyntaxError —
  // which is not a `RelayError` and would surface as though the network had
  // failed. The relay answers 204 wherever the outcome is the whole message.
  if (response.status === 204) return undefined as T

  return response.json() as Promise<T>
}

export function getInfo(): Promise<RelayInfo> {
  return request<RelayInfo>("/v1/info")
}

/** What the relay calls a message it has just accepted. */
export type Sent = { id: string; seq: number; created_at: string }

export function sendMessage(from: string, to: string, body: string) {
  return request<Sent>("/v1/messages", {
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
  /**
   * The picture they wear, as a fingerprint. Absent on a relay that predates
   * pictures, `null` for somebody who has not set one.
   */
  avatar?: string | null
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

// -- profile pictures ------------------------------------------------------

/**
 * Profile pictures for a list of addresses, keyed the same way [`Names`] is.
 *
 * The value is a fingerprint, not a URL — the relay names a picture and this
 * client knows how to build a path from the name. Only addresses wearing one
 * appear, and the field itself is absent from a relay that predates pictures,
 * which is why every reader treats it as optional.
 */
export type Faces = Record<string, string>

/** What you are wearing now, as reported after setting or clearing a picture. */
export type Worn = { avatar: string | null }

/**
 * The widths the relay renders. Mirrors `avatar::SIZES` in knock-relay.
 *
 * Asking for anything else is a 404 rather than a resize, so this list is not a
 * suggestion — see [`faceUri`], which only ever builds one of these.
 */
export const FACE_SIZES = [96, 192, 384] as const
export type FaceSize = (typeof FACE_SIZES)[number]

/**
 * The most an upload may weigh, mirroring the relay's own ceiling.
 *
 * The picker downsizes long before this matters; it is here so a file that
 * somehow survives that is refused on this side of the network rather than
 * after a slow upload.
 */
export const MAX_AVATAR_BYTES = 1024 * 1024

/**
 * Where one rendition of a picture lives.
 *
 * A plain URL rather than something fetched, because these are drawn by `<img>`
 * and the browser's own cache is the right cache for them: the fingerprint is
 * in the path, so the bytes at a URL never change and the relay says so with a
 * year of `immutable`.
 *
 * Absolute, because `BASE` may point at another origin entirely.
 */
export function faceUri(fingerprint: string, size: FaceSize): string {
  return `${BASE}/v1/avatar/${fingerprint}/${size}`
}

/**
 * Put on a profile picture. The body is the image itself — see the relay's
 * `set_avatar` for why it is not wrapped in anything.
 */
export function setAvatar(image: Blob): Promise<Worn> {
  return request<Worn>("/v1/profile/avatar", {
    method: "PUT",
    body: image,
    // Overrides the JSON default. The relay reads the format from the bytes
    // and ignores this, but sending the truth costs nothing.
    headers: { "content-type": image.type || "application/octet-stream" },
  })
}

/** Take your picture off, falling back to the identicon. */
export function clearAvatar(): Promise<Worn> {
  return request<Worn>("/v1/profile/avatar", { method: "DELETE" })
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
export function listKnocks(): Promise<{
  knocks: Knock[]
  sent?: Knock[]
  names: Names
  faces?: Faces
}> {
  return request("/v1/knocks")
}

export function acceptKnock(id: string) {
  return request<{ seq: number }>(`/v1/knocks/${id}/accept`, { method: "POST" })
}

export function declineKnock(id: string) {
  return request<Knock>(`/v1/knocks/${id}/decline`, { method: "POST" })
}

export type Contact = { address: string; opened_at: string }

export function listContacts(): Promise<{ contacts: Contact[]; names: Names; faces?: Faces }> {
  return request("/v1/contacts")
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
  /**
   * Whether somebody joining can read what the room said before they arrived.
   *
   * Off by default: a room is heard from the moment you are in it. The past
   * does not arrive through the message feed even when this is on — that feed
   * is a queue whose cursor only goes forward, so it is asked for separately.
   * See [`groupHistory`].
   */
  share_history: boolean
  /**
   * How long somebody has to take back what they said here, in seconds.
   *
   * `0` means never, and the relay refuses anything past
   * [`MAX_DELETE_WINDOW_SECS`] — a day, beyond which a room where last week can
   * be quietly rewritten stops being a record of anything.
   */
  delete_window_secs: number
  /**
   * The picture the room's owner gave it, as a fingerprint.
   *
   * Absent or null means the mosaic of member faces the room started as — see
   * `GroupAvatar`. Unlike that mosaic, which is made of addresses, this is a
   * file somebody chose: the owner's address travels beside it because that is
   * the part a visitor can actually check.
   */
  icon?: string | null
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
  /** The first few, in join order — not the room. See [`listGroupMembers`]. */
  members: string[]
  /** How many are in the room, which `members` no longer tells you. */
  member_count?: number
  names: Names
  /**
   * Pictures for the addresses above. Absent from a relay that predates them.
   * See [`Faces`].
   */
  faces?: Faces
  /** Whether the room is at the relay's member limit, so nobody else fits. */
  full?: boolean
  /**
   * Whether you are already in this room.
   *
   * The relay's answer, not this device's: the room list here is a poll behind
   * and cannot speak for a membership that changed somewhere else. What the
   * door draws depends on it — see `JoinGroupSheet`.
   */
  joined?: boolean
}

/** One page of a room's membership. */
export type MemberPage = {
  members: string[]
  names: Names
  /**
   * Pictures for the addresses above. Absent from a relay that predates them.
   * See [`Faces`].
   */
  faces?: Faces
  /** Where the next page starts, or null at the end of the list. */
  next: number | null
}

/** How many members one page holds. The relay refuses to serve more. */
export const MEMBER_PAGE = 100

/**
 * Everybody in a room, a page at a time.
 *
 * `after` is the `next` from the page before it, and nothing else — it is the
 * relay's own bookmark, not a row number. `q` narrows by any part of a name,
 * or by a whole address; half an address matches nothing, because what the
 * relay holds is bytes rather than the text somebody types.
 */
export function listGroupMembers(
  id: string,
  options: { after?: number | null; q?: string } = {},
): Promise<MemberPage> {
  const params = new URLSearchParams()
  if (options.after) params.set("after", String(options.after))
  if (options.q?.trim()) params.set("q", options.q.trim())
  const query = params.toString()
  return request<MemberPage>(
    `/v1/groups/${encodeURIComponent(id)}/members${query ? `?${query}` : ""}`,
  )
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
  share_history?: boolean
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
  changes: {
    name?: string
    join_price_luna?: number
    requires_approval?: boolean
    share_history?: boolean
    delete_window_secs?: number
  },
): Promise<Group> {
  return request<Group>(`/v1/groups/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(changes),
  })
}

/** One page of a room's past, oldest first. */
export type RoomHistory = {
  messages: Envelope[]
  /** Pass as `before` for the page before this one, or null at the beginning. */
  next: number | null
}

/**
 * What a room said before you got here.
 *
 * Empty unless the owner has turned the room's history on, which is checked at
 * the relay — a client asking anyway is answered, not trusted.
 *
 * Deliberately not part of the message feed. That feed is a queue drained by a
 * cursor that only goes forward, so by the time somebody joins a room their
 * cursor is already past everything older than their membership and no amount
 * of polling would ever reach it. This asks the other question, and pages
 * backwards: `before` is the `next` from the page before it.
 *
 * Your own past messages are not returned, exactly as the feed does not return
 * them — a sender keeps their own copy, and it is the only one that knows it
 * was theirs.
 */
export function groupHistory(
  id: string,
  options: { before?: number | null } = {},
): Promise<RoomHistory> {
  const params = new URLSearchParams()
  if (options.before) params.set("before", String(options.before))
  const query = params.toString()
  return request<RoomHistory>(
    `/v1/groups/${encodeURIComponent(id)}/messages${query ? `?${query}` : ""}`,
  )
}

/**
 * The longest a room may leave a message open to being taken back: one day.
 *
 * Mirrors the relay's own ceiling, which refuses anything past it. Anything
 * from `0` — never — up to this is a length somebody may choose.
 */
export const MAX_DELETE_WINDOW_SECS = 86_400

/**
 * Take back something said in a room.
 *
 * Allowed only to whoever said it, and only while the room's window is still
 * open; both are decided at the relay, which is why this can be offered
 * hopefully and refused honestly. The deletion then reaches everyone else
 * through the message feed.
 */
export function deleteSaid(group: string, message: string): Promise<void> {
  return request<void>(
    `/v1/groups/${encodeURIComponent(group)}/messages/${encodeURIComponent(message)}`,
    { method: "DELETE" },
  )
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

/**
 * Give a room a picture. The owner's alone, and the body is the image itself.
 *
 * Answers with the whole room rather than just the icon, because the icon
 * travels as part of a `Group` everywhere else and a caller holding one wants
 * the updated version of it.
 */
export function setGroupIcon(id: string, image: Blob): Promise<Group> {
  return request<Group>(`/v1/groups/${encodeURIComponent(id)}/icon`, {
    method: "PUT",
    body: image,
    headers: { "content-type": image.type || "application/octet-stream" },
  })
}

/** Take a room's picture off, back to the faces of its members. */
export function clearGroupIcon(id: string): Promise<Group> {
  return request<Group>(`/v1/groups/${encodeURIComponent(id)}/icon`, { method: "DELETE" })
}

export function sayInGroup(id: string, body: string) {
  return request<Sent>(
    `/v1/groups/${encodeURIComponent(id)}/messages`,
    { method: "POST", body: JSON.stringify({ body }) },
  )
}

export function listJoinRequests(
  id: string,
): Promise<{ requests: JoinRequest[]; names: Names; faces?: Faces }> {
  return request(
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
  /**
   * Pictures for the addresses above. Absent from a relay that predates them.
   * See [`Faces`].
   */
  faces?: Faces
  /** What you got, if you were quick enough. */
  yours: number | null
}

/** Where to send a gift's money, and the terms the relay holds it on. */
export type GiftTerms = {
  fund_to: string
  expires_in_hours: number
  max_shares: number
}

/**
 * What a link in a message turned out to lead to.
 *
 * Read from the page itself by the relay, not written by whoever sent the link
 * — which is the only reason it is worth drawing. A card somebody else composed
 * is an advertisement at best and a lure at worst.
 */
export type Preview = {
  /** Where the link ended up, after redirects. Not always what was tapped. */
  url: string
  /** The host of that. The part worth reading before going. */
  host: string
  title: string
  description: string
}

/**
 * Ask what a link leads to.
 *
 * The relay fetches it, so the site is never told who is reading — and, because
 * the answer is cached there, a room reading the same link costs that site one
 * visit rather than one per person. What this does tell the relay is which link
 * is about to be read; see `lib/legal`, and the `previews` preference that
 * turns it off.
 */
export function lookUpLink(url: string): Promise<Preview> {
  return request<Preview>(`/v1/unfurl?url=${encodeURIComponent(url)}`)
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
