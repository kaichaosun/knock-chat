# Knock — Roadmap

Where the build stands and what is left. Design rationale lives in
[SPEC.md](./SPEC.md) and [ARCHITECTURE.md](./ARCHITECTURE.md); this file is
only status.

Two repos: this app, and the relay at `../knock-relay`.

**Competition.** Nimiq Mini Apps, Cycle II — 24 Aug to 18 Sep 2026.

---

## Built

### Relay (Rust · axum · Postgres)

| | |
|---|---|
| Identity | Nimiq address derived from the key that signed, never claimed. Address codec pinned to core-rs-albatross vectors. |
| Sign-in | Challenge → wallet signature → session token. One wallet prompt: the device's encryption key rides in the signed challenge, so proving identity and publishing the key are one act. |
| Key directory | `KeyCertificate` per address; the newest published wins, so re-keying is just a newer certificate. |
| Messages | Post, fetch, ack. Opaque server-issued cursors (`{instance}.{seq}`) that replay rather than stall when a cursor is from another relay or past the end. |
| Knocks | Send, list, accept, decline. Accepting opens the channel and delivers the knock's body as the first message. |
| Postage | On-chain payment verified by tx hash before a knock is stored. Commitment binds payer to sender, since the wallet signs with one address and pays from another. Spend is recorded in the same transaction as the knock. |
| Policy | Per-address price for strangers, `0` to waive. Default 10 NIM. |
| Contacts | Channels as the durable record of who can reach whom, so a fresh device knows without local history. |
| Remove contact | `DELETE /v1/contacts/{address}`. One normalised row, so closing is symmetric by construction. |

**Tests:** 78 offline, plus 4 Postgres-backed run separately
(`cargo test -- --ignored pg_ --test-threads=1`). The Postgres set exists
because two postage bugs were Postgres-only and every test at the time ran
in-memory.

### App (React · Vite · Tailwind · shadcn)

| | |
|---|---|
| Encryption | X25519 + HKDF-SHA256 + XChaCha20-Poly1305, static-static. No forward secrecy, deliberately — see SPEC. Verified: plaintext appears zero times in Postgres. |
| Chats | Threads, day grouping, unread counts (clock-free, counted not timestamped), swipe-left to delete. |
| Contacts | Read from relay channels. Swipe-left to remove, behind a confirmation, since removal costs the other side money to undo. Removing also deletes the local chat. |
| Knocking | Address entry with live cost lookup, or from inside a closed chat with the address fixed. Same sheet either way. |
| Closed chats | Banner with an explicit priced Knock button; composer disabled so no dead message is left behind. |
| Profile | Address with copy, and your own postage price. |
| Delivery states | `sending` / `sent` / `failed` / `blocked`. A retry restamps to now and moves to the end of the thread. `blocked` (402) offers no retry while the door is shut, and becomes retryable once it opens. |
| Refresh | Messages poll while visible. Reachability is asked on open, when a message arrives **while the door is shut**, and on pull-to-refresh — never on a timer. An open conversation costs zero reachability calls. |

**Tests:** 48. Typecheck clean.

---

## Pending

### Blocking for a public deploy

- **CORS.** No layer at all; the app is same-origin via the Vite proxy today.
- **Rate limiting.** Nothing. Sign-in and knock endpoints are the exposure.
- **Expiry sweep.** Challenges and sessions are checked on read but never
  deleted, so both tables grow without bound.
- **Hosting.** Relay, database, and app not deployed anywhere.

### Unverified

- **The paid knock leg.** Everything up to the confirmation is verified, and
  everything after payment is shared with the tested free path — but the
  transaction itself needs a real device in Nimiq Pay. Dev wallets have no
  provider and throw before any transaction.
- **Mainnet.** All testing has been local against
  `rpc.nimiqwatch.com` / `rpc.testnet.nimiqwatch.com`.

### Product gaps

- **Blocking.** Removing a contact is not blocking: they can pay again and
  return. Correct as a default, thin protection against someone determined.
  A real blocklist is its own feature.
- **Knock previews.** The recipient *can* decrypt a knock before accepting —
  `read_key` needs only a session, no channel. Whether to show the body in the
  request list is an open call: it helps the recipient decide, and may make
  abuse cheaper.
- **Staker exemption.** Cut. `getStaker` is refused by public nodes, so free
  passage for stakers has no way to be checked.

### Polish

- Success toast after knocking is the generic compose copy, even when
  reopening a closed chat.
- A revealed swipe row does not follow the finger back; it snaps shut on
  release. Opening is fluid, closing is not.
- README's roadmap section predates postage and encryption.
