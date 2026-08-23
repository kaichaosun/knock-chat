# Knock — Specification

**Status legend:** `[built]` exists today · `[v1]` ships by end of competition week 2 ·
`[later]` deliberately deferred, with the reason given.

---

## 1. Overview

**Knock** is a messaging Mini App for Nimiq Pay. Your Nimiq address is your account,
messages are end-to-end encrypted, and **a stranger has to attach NIM to reach you —
which you keep.**

The premise is that spam is an economics problem, not a classification problem. Every
filter ever built tries to guess intent from content. Knock prices the channel instead:
a fraction of a cent to reach someone you've never met, nothing at all to reach someone
who already knows you. A million spam messages costs roughly $3,900, and a real
conversation costs nothing after the first message.

This is only possible on Nimiq. Postage-based anti-spam has been proposed for thirty years
and never shipped because the transaction fee always dwarfed the postage. At ~0.005 NIM per
transaction against 10 NIM of postage, the fee is 0.05% of the toll, and Albatross's
instant finality means the payment clears before the message does.

### Two layers

1. **Transport** — a relay that holds encrypted envelopes for recipients who are offline,
   and refuses to accept mail that hasn't paid.
2. **Economics** — NIM postage, set by each recipient, waived for people they already
   know or have invited.

---

## 2. Identity

**The Nimiq address is the account.** There is no separate identity, no registration, no
recovery flow. `[v1]`

The Mini App provider exposes a signing oracle, not a private key, so the wallet key is
used for authentication and certification only — never for encryption directly.

Ed25519 cannot do this itself. It is a signature scheme, and while its keys map
birationally onto X25519 for key agreement, the private-key direction of that conversion
needs the seed — `clamp(SHA-512(seed)[0..32])`. Nimiq Pay never exposes the seed and
offers no decrypt or shared-secret method, so a message encrypted to a Nimiq address could
never be decrypted by its owner. An app-held X25519 subkey is therefore not a workaround
but the only construction the platform permits.

### 2.1 Authentication `[built]`

1. Client requests a challenge: `POST /v1/auth/challenge` → `{ nonce, message, expires_at }`.
2. Client passes `message` verbatim to `nimiq.sign()`, which returns `{ publicKey, signature }`.
3. Client posts both back. The relay verifies the Ed25519 signature and derives the
   caller's address as `Blake2b-256(publicKey)[0..20]`.
4. The relay issues a bearer session token, cached on the device.

**The client never calls `listAccounts()`.** The signature already carries the public key,
so asking the wallet who it is beforehand would be a second round trip and a second
permission prompt for information the signature contains. Sign-in is one screen, one tap,
one wallet dialog.

The address derivation is `[built]` and pinned to independently computed vectors in
`knock-relay/src/address.rs`.

**Confirmed on device.** `sign()` does not sign the message it is given. It wraps and
hashes first:

```text
digest = SHA256( 0x16 ‖ "Nimiq Signed Message:\n" ‖ ascii(byte_len) ‖ message )
```

An EIP-191-style guard, so a signing request can never be tricked into authorising a
transaction. The relay verifies over exactly these bytes — `knock-relay/src/signature.rs`
and `src/lib/signed-message.ts`, both pinned to a signature captured from Nimiq Pay on
iOS. Signatures are deterministic, and the returned public key derives to the address the
wallet displays.

Sessions are cached so `sign()` prompts once per device, not once per request. A modal
confirmation on every fetch would be fatal to the onboarding experience.

### 2.2 Encryption keys `[built]`

The wallet key cannot perform a key exchange, so Knock uses the standard
identity-key-certifies-subkey pattern — PGP subkeys, Signal prekeys:

- On first run the client generates an **X25519 keypair** and keeps the private half on
  the device.
- **The sign-in challenge carries that public key**, so the one signature that proves
  identity also certifies the key. Publishing it separately would have meant a second
  wallet confirmation for what is really one act — registering a device.
- A certificate is therefore the signed challenge kept verbatim. The key is read back
  **out of the signed bytes**, never from a field beside them, so the two cannot disagree
  and a relay cannot vouch for one key while serving another.
- `GET /v1/keys/{address}` serves them. Clients verify three things themselves: the
  statement carries a well-formed key, the signature covers that statement, and the
  signing key derives to the claimed address.

This requires **no assumption that `sign()` is deterministic**, which is why it is
preferred over deriving the encryption key from a signature.

Re-keying is publishing a newer certificate; the newest valid one wins. **Losing the
device loses the message history and forces a re-key.** That is accepted for v1 and
stated in the UI rather than hidden.

---

## 3. Transport

### 3.1 The relay `[built, extended in v1]`

A Rust service (axum + Postgres) that accepts envelopes, holds them for offline
recipients, and serves them on demand. It exists today in `knock-relay`, carrying
plain-text bodies with no authentication.

A recipient fetches everything above a monotonic `seq` cursor, and acks to release
storage. Ordering is total and gap-free per recipient.

### 3.2 One relay, and we say so `[v1]`

Knock runs a single relay operated by us. Federation is `[later]`. The submission will
say this plainly rather than describing the roadmap as though it shipped.

### 3.3 The read cursor `[built]`

A client resumes delivery from a cursor the relay issued, and hands it back unchanged.
**The cursor is opaque by contract**, because whether one is still meaningful is a question
only the relay can answer: it alone knows which sequence space it is in and how far that
sequence has got.

Two ways a cursor goes stale, both caught server-side:

| | instance | sequence | detected by |
| --- | --- | --- | --- |
| Relay rebuilt | differs | restarts at 1 | instance mismatch |
| Restored from backup | matches | rewinds | cursor is past the highest seq issued |

Either way the relay replays from the beginning rather than returning nothing. That is safe
because every message carries a stable `id` which never repeats, so the client
deduplicates a replay away. Returning nothing is *not* safe: it is silent, permanent, and
indistinguishable from having no new mail — the failure mode this design exists to remove.

A stale cursor on `ack` is refused rather than reinterpreted, since deleting the wrong
messages cannot be undone.

### 3.4 Retention `[v1]`

The relay holds ciphertext until the recipient acks it, then drops it. It is a mailbox,
not an archive. Long-term history lives on the device.

---

## 4. Encryption `[built]`

- **Key agreement:** X25519 ECDH between the two parties' certified subkeys. Both sides
  derive the same key independently; no secret is ever transmitted. There is no ratchet
  and no handshake.
- **Key derivation:** HKDF-SHA256 over the shared secret, with a `knock/v1/message` info
  string.
- **Cipher:** XChaCha20-Poly1305, random 24-byte nonce per message.
- **Associated data:** sender address, recipient address, and the relay `seq`, so a
  ciphertext cannot be replayed into a different thread.

Libraries: `@noble/ciphers` and `@noble/curves` on the client, `x25519-dalek` and
`chacha20poly1305` on any server-side path. **No hand-rolled cryptography.**

### What this does not give you

Static-static ECDH means both parties derive the same key for every message in a
conversation. There is **no forward secrecy and no post-compromise security** — an
attacker who obtains a device's X25519 private key can read that conversation's entire
history. A Double Ratchet is `[later]`; shipping a correct simple scheme beats shipping a
subtly broken complex one in three weeks.

---

## 5. Spam protection

### 5.1 Tiers `[v1 except where noted]`

| Tier | Who | Cost |
| --- | --- | --- |
| **Open channel** | You accepted their knock, or they accepted yours | Free, both directions, permanently |
| **Invited** | Holds a valid invite you minted | Opens a channel without paying |
| **Stranger** | Everyone else | One knock, paid |

Once a channel is open there are no paid messages at all — which is what stops postage
from taxing the reply.

The **staker lane** is cut. It would have let anyone holding an active NIM stake through
free, which is attractive because it leaks nothing — proving "I hold a stake" is a claim
about account state rather than a payment to the recipient. But `getStaker` is refused by
both the public mainnet and testnet nodes, so it would mean self-hosting a node purely for
that tier. Revisit if the relay ever runs its own node.

### 5.2 Knocking `[v1]`

**Reaching someone you have never spoken to is a single paid act.** You send a *knock*: a
message plus proof of payment. If they accept, a channel opens and **both directions are
free forever**. If they decline or ignore it, nothing more happens — and they keep the NIM
either way.

**The recipient sets the amount and keeps it. Default 10 NIM (~$0.004).**

Postage is therefore the one-time cost of opening a channel, not a toll on every message.
That distinction is load-bearing. A per-message toll would charge you to *answer* someone
who had just paid for your attention — penalising the exact behaviour the payment was
meant to buy, and killing the conversation it started. Paying once per relationship costs
a real person almost nothing and still costs a spammer a million payments to reach a
million people.

It also bounds harassment. A stranger can leave **one pending knock**, however much they
are willing to spend — not an unlimited stream of paid messages.

The protocol:

1. Sender fetches `GET /v1/policy/{address}`.
2. Sender picks a random 32-byte nonce and pays on-chain, carrying a **commitment**:
   `data = "knock:" ‖ hex( SHA256( sender_address ‖ nonce )[0..16] )`
3. Sender posts the knock with `{ to, body, postage: { tx_hash, nonce } }`.
4. **The relay verifies before storing anything**, via `getTransactionByHash`: the
   transaction is final, pays the recipient, meets the amount, and carries exactly that
   commitment. Otherwise **`402 Payment Required`**.
5. Recipient accepts — the channel opens and the knock's message becomes the first in the
   thread — or declines, and it is dropped.

**Why a commitment rather than a plain nonce.** A payment is public the moment it lands,
so "paid the right person the right amount" is not enough: anyone watching the chain could
point at someone else's payment and claim it covers their message. The nonce travels only
inside the knock, so an observer sees a hash they cannot reverse and cannot reuse.
Revealing the nonce is what redeems the payment.

**Why the commitment names the sender, not the payer.** A Nimiq Pay wallet may sign with
one account and pay from another — observed on a real device, where `sign()` used
`NQ80 M6TC…` while the transaction came from `NQ86 MASJ…`. Requiring payer and sender to
match would reject legitimate postage.

**Anti-replay** is a `spent_postage` table, keyed by transaction hash and never deleted.
It sits apart from the knock it paid for on purpose: a payment being spent is a fact about
the chain, not about a knock, and it has to outlive every knock. A waived knock records no
payment at all rather than an empty one.

**Being declined is not a ban.** The knock row is removed, so the pair is free to knock
again — with a *new* payment. Paying more than asked is accepted, so a second attempt can
carry more weight, though the interface does not yet offer that.

**Why the relay enforces this rather than the client:** a rejected knock never reaches the
recipient's device at all. A client-side filter still downloads the spam.

### 5.3 The relay is not fully trusted

A malicious or buggy relay could accept unpaid mail. The recipient's client can
independently verify any envelope's postage against the chain, because everything needed
to check it — transaction hash, nonce, amount, addresses — travels with the envelope.

---

## 6. Links and invites `[v1]`

One artifact, two modes. Both open Knock through
`https://nimpay.app/miniapps/open/…`.

- **Public link** — carries your postage policy. Put it on a profile, a README, a
  conference badge. Strangers who open it pay to reach you.
- **Personal invite** — a minted token that waives postage for whoever uses it. Send it to
  a friend; they reach you free and become a contact on their first reply.

Invites are `{ token, owner, uses_remaining, expires_at }`, revocable at any time.

This is what resolves the friction of a messenger that charges strangers: **your friends
never pay, and you never have to explain why they would.** It is also the growth loop —
the same link that onboards a friend monetises a stranger.

> **Open:** whether the Nimiq Pay deeplink preserves a query string on the target URL. If
> not, the invite token moves to a path segment or fragment. Needs one device test.

---

## 7. Client

A mobile-first React Mini App. `[built]` for the plain-text slice: connect, inbox,
thread, composer, address entry, profile.

`[v1]` adds:

- **Postage confirmation** — an unmistakable "this costs 10 NIM" step before signing.
  Nobody should ever spend by accident.
- **Policy editor** — set or waive your own postage.
- **Invite sheet** — mint, share, revoke.
- **Contact state** — make it visible why a message was free or paid.

Vocabulary rule: the interface says *costs 10 NIM*, never *postage nonce*, *envelope*,
or *certificate*.

---

## 8. Threat model

**The relay can see** who messages whom, when, and how large the messages are. It cannot
read content. Sealed sender is `[later]`, and only ever possible on the free path —
postage is a public on-chain payment from sender to recipient, so **first contact is
public metadata by construction.** No relay-side design fixes that; it is the cost of
using NIM rather than blind signatures as the toll.

**The chain shows** every postage payment: sender, recipient, amount, timing.

**Losing your device** loses your history and forces a re-key.

**Knock stops bulk spam, not a determined individual.** Someone willing to spend half a
cent can send one abusive message. Block and report are required regardless; this is an
economic filter, not a moral one.

---

### 4.1 What encryption costs the product `[built]`

**You cannot message someone who has never opened Knock.** They have published no key, so
there is nothing to encrypt to. This is inherent to end-to-end encryption rather than a
gap to paper over, and the interface says so plainly instead of failing with "couldn't
send". It also contradicts the earlier copy promising you could write to any address, so
that copy is gone.

Messages that will not open — sent to a key the device has since replaced — are kept and
shown as unreadable rather than hidden, so a thread has no silent gaps.

### 5.4 Channels are the record, chats are a view `[built]`

`GET /v1/contacts` lists everyone you have an open channel with, derived from `channel`
rather than from message history. That separation matters: history is device-local, so a
fresh device shows an empty chat list while every relationship is still intact. Contacts is
what makes them reachable again.

Closing a chat is client-side and reversible — it hides a thread and nothing more. New mail
reopens it, so a closed chat can never silently swallow a message.

**Still missing: no way to close a channel.** Once someone is in, they are in permanently.
Blocking and revocation are unbuilt, and that is the most significant gap left in the
model.

## 9. Non-goals for v1

Group chat (changes the envelope format — a genuine fork, deferred deliberately),
federation, forward secrecy, sealed sender, attachments, message editing and deletion,
and any custody of user funds. Knock never holds anyone's money: postage goes wallet to
wallet, and refunds are ordinary transfers.

---

## 10. Build order

Sequenced by dependency, not by preference.

| # | Slice | Why here |
| --- | --- | --- |
| 0 | ~~Confirm `sign()` semantics on a device~~ ✅ | Done; see §2.1 |
| 1 | ~~**Auth**~~ ✅ | Done. Challenge, signature, session; an address can only act as itself |
| 2 | ~~**Encryption**~~ ✅ | Done. X25519 + XChaCha20-Poly1305; the relay stores ciphertext only |
| 3 | **Links and invites** | Cheap, and it is the growth loop |
| 4 | **Knocks and postage** | The differentiator; the chain plumbing dominates, and it is the only piece that can slip without leaving the app incoherent |
| 5 | ~~Staker lane~~ ❌ | Cut: `getStaker` is refused by public nodes |

---

## 11. Open questions

### Answered on device — Nimiq Pay, iOS 18.1.1

1. **`sign()` semantics.** Wraps and hashes before signing; see §2.1. Signatures are
   deterministic, and the public key derives to the wallet's own address, which also
   validates `Address::from_public_key` against real data. Slice 1 is unblocked.
2. **Minimum transaction amount.** None at 1 NIM — a self-send of 100,000 luna was
   accepted and returned a transaction hash. 10 NIM postage is comfortably clear.
3. **Query strings survive** when a URL is typed into Nimiq Pay's mini-apps field.

### Still open

4. **Does the `nimpay.app/miniapps/open/…` deeplink preserve a query string?** Untested —
   it will not resolve a LAN address, so it needs the app on a public host. Blocks invite
   links (slice 3), not slice 1.
5. ~~**Which node does the relay watch**~~ **Resolved: the public node.**
   `rpc.nimiqwatch.com` and `rpc.testnet.nimiqwatch.com` both serve `getTransactionByHash`,
   which is the only method postage needs — one call per knock. Configurable via
   `KNOCK_NIMIQ_RPC`, so self-hosting later is a config change. Note the phone pays on
   **mainnet** (`networkId: 24`) whatever the relay watches, so testnet is for relay-side
   tests rather than end-to-end ones.
6. ~~**Which account is "you"?**~~ **Resolved by dropping `listAccounts()`.** The client
   never asks the wallet to enumerate accounts; it signs, and the address is derived from
   the public key that came back. Whichever account the wallet signs with *is* the
   identity — the choice belongs to the wallet's own dialog rather than to us guessing at
   index zero. One fewer permission prompt, and one fewer screen.
7. **Does a judge with an empty wallet have a path through the app?** If not, the free
   tiers are the demo path and must be reachable in the first sixty seconds.

### Environment notes that shaped the code

The Nimiq Pay WebView is **not a secure context** — `crypto.randomUUID` and
`navigator.clipboard` are both unavailable. The fallbacks in `lib/messages.ts` and
`lib/clipboard.ts` are load-bearing, not defensive, and anything added later that assumes
a secure context will fail silently on device.
