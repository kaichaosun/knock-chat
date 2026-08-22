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

### 2.2 Encryption keys `[v1]`

The wallet key cannot perform a key exchange, so Knock uses the standard
identity-key-certifies-subkey pattern — PGP subkeys, Signal prekeys:

- On first run the client generates an **X25519 keypair** and keeps the private half on
  the device.
- It publishes a **key certificate** — `{ address, x25519_pub, created_at }` — signed by
  the wallet key.
- The relay serves certificates at `GET /v1/keys/{address}`. Anyone can verify one: the
  signature must verify against a public key that derives to the claimed address.

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

## 4. Encryption `[v1]`

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
| **Contact** | Anyone you have replied to, or who used your invite | Free, both directions, permanently |
| **Invited** | Holds a valid invite you minted | Free |
| **Staker** | Has an active NIM stake above a threshold | Free, rate-limited `[v1.1]` |
| **Stranger** | Everyone else | Postage |

The **staker lane** is the first thing cut if week 2 runs short. It is worth building
because it is the only tier that leaks nothing — proving "I hold a stake" is a claim about
account state, not a payment to the recipient — and because a thousand sybil identities
require a thousand stakes behind an unstaking cooldown. `get_staker(address)` and
`get_stakers([…])` are readable for any address, so verification is trustless.

### 5.2 Postage `[v1]`

**The recipient sets the amount and keeps it. Default 10 NIM (~$0.004).**

Postage is a payment, not a deposit. Ignoring a message means keeping the money — that is
the point, since the sender consumed attention either way. A **manual refund** is offered
in the thread as a courtesy but is never automatic.

The protocol:

1. Sender fetches `GET /v1/policy/{address}` → `{ required, amount_luna, address }`.
2. Sender picks a random 32-byte nonce `n`.
3. Sender pays on-chain:
   `sendBasicTransactionWithData({ recipient, value: amount, data: "knock1" || n })`
   — a 38-byte payload, far inside the 2112-byte limit.
4. Sender posts the envelope with `postage: { tx_hash, nonce }`.
5. **The relay verifies before storing anything**, via the node's
   `get_transaction_by_hash`: the transaction exists and is final, pays the policy
   address, meets the amount, carries `"knock1" || n` as its data, and comes from the
   envelope's declared sender. The nonce must be unused; it is then consumed.
6. Accept, or answer **`402 Payment Required`** with the current policy so the client can
   retry correctly.

**Anti-replay:** the nonce is single-use behind a unique index, so one payment can never
carry two messages. **Anti-forgery:** the payment must exist on-chain, paying the
recipient — there is nothing to spoof.

**Why the relay enforces this rather than the client:** rejected mail never reaches the
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
| 2 | **Encryption** | Credibility floor; a readable messenger will be noticed |
| 3 | **Links and invites** | Cheap, and it is the growth loop |
| 4 | **Postage and refund** | The differentiator; the chain plumbing dominates, and it is the only piece that can slip without leaving the app incoherent |
| 5 | Staker lane | First thing cut if week 2 runs short |

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
5. **Which node does the relay watch** — a local `nimiq-client` with RPC, or a hosted one?
   `subscribe_for_logs_by_addresses_and_types` gives a push stream, better than polling.
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
