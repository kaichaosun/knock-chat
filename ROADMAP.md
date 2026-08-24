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
| Groups | `chat_group` / `group_member` / `group_request`, plus a `group_id` on delivered messages. A room is a lobby, not a shortcut: membership opens no channel, so reaching a member privately still costs their postage. The door mirrors a knock — pay the owner, get in forever — with the price defaulting to 0 and an optional approval queue. Owner-only moderation, link-only distribution, no ban list. **Bodies are plain text**; the relay can read them. |
| Gifts | A pot dropped in a room, taken first-come-first-served — even or random shares, whatever is unclaimed returned after 24 hours. **The one place the relay holds money**: a pot must be funded before anyone knows who will claim it. Funding is verified on chain and spent once, the same rule postage runs under. Shares are decided at creation, so claiming is only ever "take the next unclaimed row" — `FOR UPDATE … SKIP LOCKED` plus a partial unique index, so simultaneous taps get different shares and nobody gets two. Payout is signed locally with `core-rs-albatross` crates (git, `tag = v2.0.0`) and broadcast through the same public nodes the relay already reads from, so no node of our own is needed. A relay without `KNOCK_RELAY_WALLET` answers 501 and is otherwise unchanged. |
| Chain reads | A node that cannot answer is told apart from a transaction that is not there: the first a 502 that says nothing about the payment, the second a 402. Pinned to the exact bodies real nodes send — including the prose `rpc.nimiqwatch.com` returned while it was down, which read as "not found" tells someone who has just paid that their payment does not exist. Configuration moved into `.env` / `.env.example`, since `KNOCK_NIMIQ_RPC` was previously discoverable only by reading `main.rs`. |
| Display names | `PUT /v1/profile`, and the name served with reachability, contacts and knocks. Normalised and refused — not truncated, not stripped — if it carries invisible or text-reordering characters. Lists carry names in a map beside them rather than on each entry, so a name is looked up when read rather than frozen into a knock. |

**Tests:** 141 offline, plus 8 Postgres-backed run separately
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
| Profile | Address with copy, your display name, and your own postage price. |
| Names | A directory fed by whatever the app already asks for — contacts, knocks, a reachability check — held per identity and cached in storage so a name shows on a cold start. Sanitised again on the way in, since the relay is not the last word on what is safe to draw. Shown alone only in the chat list; everywhere identity matters it sits above the address, never in place of it. |
| Avatars | Nimiq identicons (`identicons-esm`), generated from the address and cached per address. Costs ~31 kB gzip of shape table, which buys a contact the same face they have in the Nimiq Wallet and Nimiq Pay. |
| Send NIM in a chat | A plus button in the composer opens a menu of things a message can be other than text; the one action there now is a transfer to the person you are talking to. The wallet moves the money, then a card is posted into the thread. Message plaintext is framed (`\x1fknock1\n` + JSON — a NUL at first, until Postgres refused one in a `text` column, which encryption had been hiding) so text still travels as itself and an unrecognised frame degrades to "not supported in this version" rather than raw JSON. Confirmed working on Android and iOS. |
| Groups | Rooms in the chat list beside direct chats, told apart by a plain glyph rather than an identicon. A room view labels every incoming message with who said it and carries a standing "not encrypted" notice. Create with a name, a price and an approval switch; share by link (`?group=<id>`); the owner's controls live in the same sheet everyone else sees. Local history keys threads on `group ?? peer`, so a room and a direct chat with the same person stay apart. |
| Deleting a room's chat | Hides it until something is said in it, the way closing a direct chat already worked. A room is not made of its messages — you are in it either way — so emptying the thread alone left the row sitting there looking untouched. Leaving is the other act, and it lives in Groups. |
| Getting into a group | A link (`?group=<id>`), a pasted link or bare id, or a QR code shown in the group's info. Pasting is matched rather than parsed, so a link that picked up a fragment, a redirect wrapper or trailing punctuation still resolves — and a bare id works, which matters because whether Nimiq Pay preserves a query string through its deeplink is still unanswered. QR costs ~8.5 kB gzip and inherits its colour from CSS, so it stays readable in dark mode. |
| Editing a room | The owner can change its name, its cost to join and whether they approve arrivals, from the same sheet everyone sees. The relay took `PATCH /v1/groups/{id}` from the start; only the approval switch had been wired, so a price or a typo'd name was set for good at creation. |
| Being removed from a room | The thread stays and stays readable — the relay describes a room to anyone, just without its members — and the composer is replaced by a line saying you are not in it. Opening it no longer mistakes the room's id for an address, which is what produced "address has the wrong length" from a reachability check on a uuid. |
| Adding somebody to a room | **Add someone** in the group's info picks from your contacts and posts an invite card into your chat with them. A third payload kind (`invite`), so it rides inside the **encrypted** body — the relay never learns which room was shared — and because it is an ordinary message it can only reach someone who has already let you in. A group therefore cannot become a way around postage. The card carries the sender's copy of the name so it draws at once; tapping it opens the join sheet, which fetches what the room really is and what it costs before anything is paid. Anyone in the room can invite; the door still decides who gets through. |
| Gifts in a room | `+` in a room leaves a pot: an amount, how many can take a share, even or random, and a word. Funded from the wallet to the relay, then announced as a card. The card carries only what cannot change — id, total, share count — and asks the relay for how many are left and whether you already took one, since both move after the message was sent. A share that is yours but not yet transferred says **sending** rather than claiming the money has arrived. `+` appears only on a relay that holds gifts. |
| Groups tab | A third tab after Contacts, listing the rooms you are in. Swipe to **Leave** — the durable act, behind a confirmation that says what getting back in would cost. Deleting a room's chat in Chats stays what it always was: tidying this device. Same shape as Chats / Contacts, where the thread is a view and the tab beside it is the thing itself. |
| Payment cards | Not chat bubbles: bordered, tailless, laid out in rows and given a minimum width, so a payment is distinguishable from something someone said without reading either. Reports what the sender said they paid, and nothing more. |
| Paid postage survives a failure | A knock is a payment then a request, and the wallet returns before the transaction is in a block — so the relay used to refuse the knock for being early, after the money had gone. The proof is now written to storage *before* the relay is told anything, the request retries on a 1/2/4/8s backoff, and a payment already made is always reused. Paying twice would strand the first payment forever: its commitment binds a nonce only that device ever had. A sweep on every foreground finishes anything still owed, so the guarantee is "once you have paid, the knock is sent" rather than "…if you come back and tap again". |
| Delivery states | `sending` / `sent` / `failed` / `blocked`. A retry restamps to now and moves to the end of the thread. `blocked` (402) offers no retry while the door is shut, and becomes retryable once it opens. |
| Refresh | Messages poll while visible. Reachability is asked on opening a thread, then on a backoff of 10s / 20s / 40s / 80s while the door is shut, stopping the moment it opens. Nothing is asked of a backgrounded app, and an open conversation costs nothing. |

**Tests:** 138. Typecheck clean.

---

## Pending

### Blocking for a public deploy

- **CORS.** No layer at all; the app is same-origin via the Vite proxy today.
- **Rate limiting.** Nothing. Sign-in and knock endpoints are the exposure.
- **Expiry sweep.** Challenges and sessions are checked on read but never
  deleted, so both tables grow without bound.
- **The relay chooses the text the wallet asks you to approve.**
  `auth.ts` signs `challenge.message` verbatim, whatever the relay returns, with
  no check on it. A hostile or compromised relay can therefore put arbitrary
  text in front of a user inside a wallet approval dialog, indistinguishable
  from Knock's own. The client already knows the exact format, so the fix is to
  build the message locally from the parts — nonce, its own encryption key,
  expiry — and have the relay supply data rather than a string to be approved.
  Independent of anything else; worth doing before strangers use a relay they
  did not deploy.
- **Postage depends on one public node, and one went down.** Verification needs
  `getTransactionByHash`, which needs a *history* node — one without the index
  refuses every lookup however healthy it otherwise is. `rpc.nimiqwatch.com`,
  the default until then, spent 2026-08-24 answering `no available server` to
  everything, and with it down no knock could be paid for at all. It stays the
  default, but `KNOCK_NIMIQ_RPC` now takes a comma-separated list: each request
  starts with whoever answered last and moves on from any node that cannot
  answer, so one going down costs a timeout rather than the feature. That is
  several dependencies instead of one, not none — a history node we operate is
  still the only version of this that does not rest on somebody else.
  Cheapest mitigation is to let `KNOCK_NIMIQ_RPC` take a list and try each in
  turn; the real one is a history node we operate.
- **Hosting.** Relay, database, and app not deployed anywhere.

### Unverified

- **The paid knock leg.** Everything up to the confirmation is verified, and
  everything after payment is shared with the tested free path — but the
  transaction itself needs a real device in Nimiq Pay. Dev wallets have no
  provider and throw before any transaction.
- **Mainnet.** All testing has been local against
  `rpc.nimiqwatch.com` / `rpc.testnet.nimiqwatch.com`.

### Settled by the device probes

- **Signed-message construction, address derivation and determinism**, on
  iPhone (iOS 18.1.1), 2026-08-24. The wallet signs the Nimiq signed-message
  wrapper rather than raw UTF-8; the returned public key derives to the wallet's
  own address; and **signatures are deterministic** — the same message signed
  twice gives byte-identical output. That last one was the open question behind
  signature-derived encryption keys, and the answer is that they would work.
  Not being built: see multi-device below.

### Known limits

- **The Mini App WebView shrinks after a screen lock.** Measured on iPhone
  (iOS 18.1.1): a fresh launch fills the screen, but after locking and
  unlocking, Nimiq Pay hands the page a WebView 462px tall on an 844px screen
  and the rest of the screen is the host's own UI. `innerHeight`,
  `documentElement.clientHeight` and `visualViewport.height` all agree on 462,
  so the page is filling exactly what it is given — a page cannot resize its own
  WebView, and the SDK exposes nothing for height or presentation. Upstream.
  The Viewport probe on the probe screen reports the numbers.

### Known bugs

- **The composer's length limit is wrong.** `composer.tsx` caps a message at
  4096 bytes, commented as matching the relay's `max_body_len` "so the UI stops
  before the server does". It does not: the relay measures the **ciphertext**,
  and encryption inflates. The wire form is base64 of
  `1 version + 24 nonce + plaintext + 16 tag`, so a 4096-byte message arrives as
  ~5516 bytes and is rejected. The real ceiling is about **3030 bytes** of
  plaintext. A long message therefore fails to send with a generic error.

### Product gaps

- **A gift makes the relay custodial.** It holds a private key with real funds
  between a gift being made and its shares being claimed or returned. Whoever
  obtains that key drains every open gift — the only secret here whose loss
  costs money rather than privacy. Everything else in the relay is built so it
  cannot touch money at all, and this is the deliberate exception. Not yet
  written into SPEC §8, and it should be before anyone else runs one.
- **Gift payouts are unverified end to end.** Signing, serialization and the
  claim race are tested, and the transaction format was checked against a live
  mainnet node — but no gift has been funded, claimed and paid on a real chain.
- **Gift funding has no receipt.** A gift is paid for before it exists, so a
  failure between the wallet returning and the relay accepting strands the NIM
  at the relay: no gift, no refund, nothing on either side tying the payment to
  a person. Not observed in the wild, but knocks hit the same race often enough
  to be given a backoff and a durable receipt, and gifts run the identical
  sequence for more money. A 402 is now retried on a backoff, which covers the
  likely cause (the transaction not yet visible to the RPC), but a closed tab
  or a dead network still loses it. The receipt — survives a restart, redeemed
  later — is the part still missing.

  A payment to the relay wallet is only gift funding if its data field carries
  a `knock:` commitment; an empty one is somebody sending NIM by hand. Worth
  knowing before reading an unmatched transaction as a lost gift.

- **Groups are not encrypted.** Direct messages are end-to-end encrypted;
  group bodies are plain text and the relay can read them. A deliberate cut for
  this version, not an oversight — but it has to be visible in the app, or
  someone told "messages are encrypted to their device" will reasonably assume
  a group is too. The client work is not done yet.
- **A group's owner cannot leave it.** Nothing hands ownership on, so leaving
  would strand a room nobody can change. Refused outright rather than
  half-answered; transferring ownership, or deleting a group, is not built.
- **Removing someone from a free group does not hold.** They walk back in
  through the open door. The remedy is in-product — turn on approval — rather
  than a ban list, which this version does not have.
- **A new member sees no history.** Fan-out happens when a message is sent, so
  somebody who joins later starts from an empty room. Fixing it means either
  keeping room messages server-side and serving a backlog, or fanning out on
  read — both change what the relay stores and for how long.
- **No QR scanning.** A group's code can be shown but not read: the camera
  needs `getUserMedia`, which needs a secure context, and the app runs on
  `http://<lan-ip>` in development — the device probe reports
  `secure context: false`. Nimiq Pay exposes no scanner of its own either. Needs
  HTTPS before it is even testable, so sharing is one-directional for now:
  show a code, and the other person opens the link.
- **No group discovery.** Groups travel by link only. A public directory is
  what would make them serve finding people rather than only talking to people
  already found, and it brings public content and moderation with it.

- **A payment card is a claim, not a receipt.** Nothing checks it against the
  chain, so anyone can send a card saying they paid you. The card is worded as
  a note rather than a receipt, and the truth is the recipient's own balance.
  A relay endpoint that looked the transaction up was built and then removed:
  it never reached "confirmed" for a real payment, which leaves the underlying
  question open — see below.
- **What `sendBasicTransaction` actually returns is still unknown.** The SDK
  documents it as "the serialized transaction"; the postage path has treated it
  as a transaction hash since the beginning. Nothing has ever confirmed which,
  and `getTransactionByHash` failing to find a real payment is a hint that it is
  not a hash. If so, **postage verification has the same bug** and the paid
  knock path cannot work. Worth settling before a public deploy.
- **No explorer link on a payment card.** Linking out needs to know whether the
  relay is on mainnet or testnet, which `/v1/info` does not report.
- **One device per address, and changing it loses your mail.** The encryption
  key is random and lives in `localStorage`, so it is per device *and per
  origin*. Signing in somewhere else publishes a new certificate, "newest wins",
  and the previous device silently stops being able to read new messages —
  anything already sealed to the old key is unreadable for good. During
  development a changed LAN IP is enough to trigger it, because the IP is part
  of the origin; a stable domain removes that particular trigger but not the
  underlying limit.

  Two ways out were considered. Deriving the key from a wallet signature works
  (the probe confirms determinism) and is far less work, but it makes the wallet
  a single point of compromise for all message history and only holds if the
  client stops signing relay-supplied text — see the deploy blocker above. The
  chosen direction is instead **a set of device keys per address**, with senders
  encrypting to every registered key: real multi-device, no new secret derived
  from the wallet, and a bigger change to both the key directory and the sender
  path. Not built.
- **Local nicknames.** A name is chosen by its owner, so two contacts can wear
  the same one and a stranger can wear yours. Letting you rename someone in
  your own copy is the unspoofable half of this feature, and is not built.
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
